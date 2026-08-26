import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const EXPECTED_PROVIDER = 'openai-codex';
const EXPECTED_MODEL = 'gpt-5.6-sol';
const EXPECTED_REASONING = 'xhigh';
const EXPECTED_CREDENTIAL_REF = 'OPENAI_CODEX_OAUTH';
const EXPECTED_CAPABILITY = 'ordered_system_user_messages_v1';
const EXPECTED_INTERFACE = 'RC5-DSH-ORDERED-PARTS-DRAFT';
const EXPECTED_INTERFACE_VERSION = '0.0.0-draft';
const EXPECTED_WIRE_CONTRACT = 'recursus-dsh-ordered-parts-v1';
const EXPECTED_TARGET = 'recursus-direct-v1';
const RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const OAUTH_ENDPOINT = 'https://auth.openai.com/oauth/token';
const EXPECTED_MAX_TOKENS = 4_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_ARTIFACT_BYTES = 65_536;
const MAX_INPUT_BYTES = 1_048_576;
const MAX_PROVIDER_FREE_RESPONSE_BYTES = 2 * 1024 * 1024;
const TRANSPORT_MODES = new Set(['live', 'provider_free_success', 'provider_free_failure']);
const ROLE_SEQUENCE = Object.freeze(['system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system']);
const CASE_IDS = new Set(['FACT-01', 'FACT-03', 'SAFE-01']);
const REQUEST_IDENTITIES = Object.freeze({
  'FACT-01': Object.freeze({ digest: '7a63482e682d5de5a06b39dd034a41aa4aaa328d06cca110218c66376a5a6873', fixture: 'oferta-ordinary' }),
  'FACT-03': Object.freeze({ digest: 'dafa9c16e5f548bfd1cf704b1724670af341f4ad963f4d8ae2dd59a49859db8f', fixture: 'oferta-budget' }),
  'SAFE-01': Object.freeze({ digest: 'bc4fe0c277a5ae9aff99be62750abc65df063c84739355cf081b1ed86faa75f2', fixture: 'oferta-injection' }),
});
const PROVIDER_AUTHORITY = 'I authorize RC-5 to make at most three direct-adapter provider calls, one each for FACT-01, FACT-03, and SAFE-01, with no retries and the limits in `docs/recursus/RC5_SLICE_CARD.md`.';

export class RC5ProviderWorkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RC5ProviderWorkerError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new RC5ProviderWorkerError(code, message);
}

function exactKeys(value, keys, code = 'WORKER_INPUT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    reject(code, 'A closed worker object has an unknown or missing field.');
  }
}

function assertNoLoneSurrogates(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) reject('WORKER_CANONICAL_JSON', 'Worker JSON contains invalid Unicode.');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      reject('WORKER_CANONICAL_JSON', 'Worker JSON contains invalid Unicode.');
    }
  }
}

function canonicalValue(value, depth = 0) {
  if (depth > 64) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the structure bound.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertNoLoneSurrogates(value);
    if (Array.from(value).length > 262_144) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the string bound.');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a noncanonical number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 16_384) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the array bound.');
    return `[${value.map((item) => canonicalValue(item, depth + 1)).join(',')}]`;
  }
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a non-JSON value.');
  }
  const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (keys.length > 16_384) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the object bound.');
  return `{${keys.map((key) => {
    assertNoLoneSurrogates(key);
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a prohibited key.');
    return `${JSON.stringify(key)}:${canonicalValue(value[key], depth + 1)}`;
  }).join(',')}}`;
}

function canonicalJson(value) {
  return `${canonicalValue(value)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

const COMMON_WORKER_ENVIRONMENT = {
  LANG: 'C.UTF-8',
  LC_ALL: 'C.UTF-8',
  NODE_ENV: 'production',
  NODE_VERSION: '24.19.0',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  YARN_VERSION: '1.22.22',
};
const COMMON_WORKER_READS = [
  '--allow-fs-read=/.dockerenv',
  '--allow-fs-read=/opt/recursus-profile',
  '--allow-fs-read=/opt/rc5/rc5-provider-worker.mjs',
];

export const RC5_CONTAINER_RUN_AUTHORITY_V1 = deepFreeze({
  application_argv: ['container-run', '/input/worker-input.json', '/output'],
  docker: {
    binds: null,
    capability_additions: null,
    capability_drops: ['ALL'],
    cgroup_namespace_mode: 'private',
    config_absent_fields: [
      'ArgsEscaped',
      'ExposedPorts',
      'Healthcheck',
      'MacAddress',
      'NetworkDisabled',
      'OnBuild',
      'Shell',
      'StopSignal',
    ],
    config_defaults: {
      AttachStderr: true,
      AttachStdin: false,
      AttachStdout: true,
      Domainname: '',
      OpenStdin: false,
      StdinOnce: false,
      StopTimeout: 1,
      Tty: false,
      Volumes: null,
    },
    config_dynamic_fields: [
      'Cmd',
      'Entrypoint',
      'Env',
      'Hostname',
      'Image',
      'Labels',
      'User',
      'WorkingDir',
    ],
    container_user: '65532:65532',
    contract_label: { name: 'org.opencnid.rc5.contract', value: 'rc5-bounded-provider-executor-v2' },
    cpu_limit_nanos: 2_000_000_000,
    device_requests: null,
    devices: [],
    exposed_ports: null,
    host_config_absent_fields: [
      'Init',
      'RootfsPropagation',
      'Sysctls',
    ],
    host_config_defaults: {
      AutoRemove: false,
      BlkioDeviceReadBps: [],
      BlkioDeviceReadIOps: [],
      BlkioDeviceWriteBps: [],
      BlkioDeviceWriteIOps: [],
      BlkioWeight: 0,
      BlkioWeightDevice: [],
      Cgroup: '',
      CgroupParent: '',
      ConsoleSize: [0, 0],
      ContainerIDFile: '',
      CpuCount: 0,
      CpuPercent: 0,
      CpuPeriod: 0,
      CpuQuota: 0,
      CpuRealtimePeriod: 0,
      CpuRealtimeRuntime: 0,
      CpuShares: 0,
      CpusetCpus: '',
      CpusetMems: '',
      DeviceCgroupRules: null,
      Dns: null,
      DnsOptions: [],
      DnsSearch: [],
      ExtraHosts: null,
      GroupAdd: null,
      IOMaximumBandwidth: 0,
      IOMaximumIOps: 0,
      Isolation: '',
      Links: null,
      MaskedPaths: [
        '/proc/acpi',
        '/proc/asound',
        '/proc/interrupts',
        '/proc/kcore',
        '/proc/keys',
        '/proc/latency_stats',
        '/proc/sched_debug',
        '/proc/scsi',
        '/proc/timer_list',
        '/proc/timer_stats',
        '/sys/devices/virtual/powercap',
        '/sys/firmware',
      ],
      MemoryReservation: 0,
      MemorySwap: 2_147_483_648,
      MemorySwappiness: null,
      OomKillDisable: false,
      OomScoreAdj: 0,
      PortBindings: {},
      PublishAllPorts: false,
      ReadonlyPaths: [
        '/proc/bus',
        '/proc/fs',
        '/proc/irq',
        '/proc/sys',
        '/proc/sysrq-trigger',
      ],
      ShmSize: 67_108_864,
      VolumeDriver: '',
    },
    host_config_dynamic_fields: [
      'Binds',
      'CapAdd',
      'CapDrop',
      'CgroupnsMode',
      'DeviceRequests',
      'Devices',
      'IpcMode',
      'LogConfig',
      'Memory',
      'Mounts',
      'NanoCpus',
      'NetworkMode',
      'PidMode',
      'PidsLimit',
      'Privileged',
      'ReadonlyRootfs',
      'RestartPolicy',
      'Runtime',
      'SecurityOpt',
      'Tmpfs',
      'UTSMode',
      'Ulimits',
      'UsernsMode',
      'VolumesFrom',
    ],
    hostname_pattern: '^[a-f0-9]{12}$',
    ipc_mode: 'none',
    log_config: { Config: {}, Type: 'none' },
    memory_limit_bytes: 1_073_741_824,
    pid_limit: 128,
    pid_namespace_mode: '',
    privileged: false,
    pull_policy: 'never',
    read_only_rootfs: true,
    restart_policy: { MaximumRetryCount: 0, Name: 'no' },
    runtime: 'runc',
    security_options: ['no-new-privileges'],
    tmpfs: {
      destination: '/tmp',
      options: 'rw,noexec,nosuid,nodev,size=16777216,uid=65532,gid=65532,mode=0700',
    },
    ulimits: [{ Hard: 256, Name: 'nofile', Soft: 256 }],
    user_namespace_mode: '',
    uts_namespace_mode: '',
    volumes_from: null,
  },
  entrypoint: '/usr/local/bin/node',
  environment: {
    allowed_additional_keys: ['HOSTNAME'],
    exact: {
      ...COMMON_WORKER_ENVIRONMENT,
      HOME: '/tmp/rc5-home',
      HTTP_PROXY: 'http://127.0.0.1:8080',
      HTTPS_PROXY: 'http://127.0.0.1:8080',
      NO_PROXY: '',
      TMPDIR: '/tmp',
      TZ: 'UTC',
    },
  },
  exec_argv: [
    '--permission', '--use-env-proxy', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    ...COMMON_WORKER_READS,
    '--allow-fs-read=/opt/rc3/recursus-route-content-gate-v17.mjs',
    '--allow-fs-read=/opt/rc3/recursus-route-html-entities-v17.mjs',
    '--allow-fs-read=/credentials', '--allow-fs-read=/input/worker-input.json', '--allow-fs-read=/output', '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials', '--allow-fs-write=/output', '--allow-fs-write=/locks', '--allow-fs-write=/tmp',
  ],
  identity: {
    dockerenv_path: '/.dockerenv',
    gid: 65_532,
    platform: 'linux',
    script_path: '/opt/rc5/rc5-provider-worker.mjs',
    uid: 65_532,
    working_directory: '/opt/rc3',
  },
  manifest_id: 'rc5-container-run-authority-v1',
  mounts: [
    { destination: '/credentials', mode: 'rw', source_key: 'credential_home', type: 'bind' },
    { destination: '/input', mode: 'ro', source_key: 'input_directory', type: 'bind' },
    { destination: '/locks', mode: 'rw', source_key: 'lock_directory', type: 'bind' },
    { destination: '/output', mode: 'rw', source_key: 'output_directory', type: 'bind' },
  ],
  network: {
    docker_mode: 'container:<relay-container-id>',
    worker_attached_network_count: 0,
    worker_namespace: 'relay_container',
  },
  node_permissions_required_false: ['child', 'worker'],
  proxy: {
    destinations: [
      { authority: 'auth.openai.com:443', id: 'oauth_refresh', max_tunnels: 1 },
      { authority: 'chatgpt.com:443', id: 'responses', max_tunnels: 1 },
    ],
    environment_url: 'http://127.0.0.1:8080',
    protocol: 'http_connect',
    relay_host: '127.0.0.1',
    relay_port: 8080,
  },
  schema_version: '1.0.0',
  transport_modes: {
    production: 'live',
    provider_free: ['provider_free_success', 'provider_free_failure'],
  },
  supporting_invocations: {
    'container-auth-status': {
      application_argv: ['container-auth-status', '/output'],
      environment: {
        allowed_additional_keys: ['HOSTNAME'],
        exact: { ...COMMON_WORKER_ENVIRONMENT, HOME: '/nonexistent', TZ: 'America/Chicago' },
      },
      exec_argv: [
        '--permission', '--no-addons', '--report-exclude-env', '--report-exclude-network', ...COMMON_WORKER_READS,
        '--allow-fs-read=/credentials/.credentials.yaml', '--allow-fs-read=/locks', '--allow-fs-read=/output',
        '--allow-fs-write=/locks', '--allow-fs-write=/output',
      ],
    },
  },
});

export const RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256 = sha256(canonicalJson(RC5_CONTAINER_RUN_AUTHORITY_V1));

function nativeDirectory(pathValue, label, requireEmpty = false) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) reject('WORKER_PATH', `${label} must be a native directory.`);
  if (requireEmpty && readdirSync(target).length !== 0) reject('WORKER_PATH', `${label} must be empty.`);
  return target;
}

function nativeFile(pathValue, label, maxBytes = MAX_INPUT_BYTES) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) {
    reject('WORKER_PATH', `${label} must be a bounded single-link native file.`);
  }
  return target;
}

function readCanonicalJson(pathValue, label) {
  const file = nativeFile(pathValue, label);
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { reject('WORKER_INPUT', `${label} is invalid.`); }
  if (!bytes.equals(Buffer.from(canonicalJson(value), 'utf8'))) reject('WORKER_INPUT', `${label} is not canonical JSON.`);
  return value;
}

function writeExclusiveJson(directory, name, value) {
  writeFileSync(join(directory, name), canonicalJson(value), { encoding: 'utf8', flag: 'wx' });
}

async function loadFromProfile(requireFromProfile, packageName) {
  let resolved;
  try { resolved = requireFromProfile.resolve(packageName); } catch {
    reject('PROFILE_INCOMPLETE', 'The pinned profile is missing a registered runtime package.');
  }
  try { return await import(pathToFileURL(resolved).href); } catch {
    reject('PROFILE_INCOMPLETE', 'A registered runtime package could not be loaded.');
  }
}

function requestProjection(request) {
  const copy = JSON.parse(JSON.stringify(request));
  delete copy.request_digest;
  return copy;
}

function validateMessage(message, ordinal, scenarioId) {
  exactKeys(message, [
    'canonical_block_id', 'canonical_block_ordinal', 'content', 'content_encoding', 'message_id', 'ordinal', 'role',
    'semantic_envelope_byte_count', 'semantic_envelope_sha256', 'source', 'target_field',
  ]);
  const expectedRole = ROLE_SEQUENCE[ordinal];
  const expectedTarget = expectedRole === 'system' ? 'harness.system' : 'harness.user';
  if (message.role !== expectedRole || message.target_field !== expectedTarget || message.ordinal !== ordinal ||
      !Number.isInteger(message.canonical_block_ordinal) || message.canonical_block_ordinal < 0 ||
      typeof message.canonical_block_id !== 'string' || message.canonical_block_id.length === 0 ||
      message.message_id !== `rc5-${scenarioId.toLocaleLowerCase('en-US')}-${String(ordinal).padStart(2, '0')}` ||
      message.content_encoding !== 'canonical-json-utf8-lf-v1' ||
      !Number.isInteger(message.semantic_envelope_byte_count) || message.semantic_envelope_byte_count < 1 ||
      !/^[a-f0-9]{64}$/u.test(message.semantic_envelope_sha256 || '')) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message identity differs from RC-5.');
  }
  exactKeys(message.source, ['kind', 'plugin']);
  if (message.source.kind !== 'plugin' || message.source.plugin !== EXPECTED_WIRE_CONTRACT) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message source differs from RC-5.');
  }
  if (!Array.isArray(message.content) || message.content.length !== 1) reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message is not text-only.');
  exactKeys(message.content[0], ['text', 'type']);
  const text = message.content[0].text;
  if (message.content[0].type !== 'text' || typeof text !== 'string' || text.length === 0 ||
      Buffer.byteLength(text, 'utf8') !== message.semantic_envelope_byte_count || sha256(text) !== message.semantic_envelope_sha256) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body differs from its registered identity.');
  }
  let semanticEnvelope;
  try { semanticEnvelope = JSON.parse(text); } catch { reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body is not JSON.'); }
  if (canonicalJson(semanticEnvelope) !== text) reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body is not canonical JSON.');
}

export function validateOrderedWorkerRequest(request) {
  exactKeys(request, [
    'dsh_generate_options', 'execution', 'fixture_id', 'interface', 'request_digest', 'request_id', 'route_bundle',
    'scenario_id', 'schema_version',
  ]);
  if (request.schema_version !== '1.0.0' || !CASE_IDS.has(request.scenario_id) ||
      request.request_id !== `RC5-DSH-ORDERED-PARTS-${request.scenario_id}` ||
      request.fixture_id !== REQUEST_IDENTITIES[request.scenario_id]?.fixture) {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 request identity differs.');
  }
  exactKeys(request.interface, ['id', 'required_transport_capability', 'status', 'version', 'wire_contract']);
  if (request.interface.id !== EXPECTED_INTERFACE || request.interface.version !== EXPECTED_INTERFACE_VERSION ||
      request.interface.required_transport_capability !== EXPECTED_CAPABILITY || request.interface.wire_contract !== EXPECTED_WIRE_CONTRACT ||
      request.interface.status !== 'mutable_provider_free_draft') {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 request interface differs.');
  }
  exactKeys(request.request_digest, ['algorithm', 'value']);
  const expectedDigest = sha256(canonicalJson(requestProjection(request)));
  if (request.request_digest.algorithm !== 'sha256' || request.request_digest.value !== expectedDigest ||
      request.request_digest.value !== REQUEST_IDENTITIES[request.scenario_id].digest) {
    reject('WORKER_REQUEST_DIGEST', 'The RC-5 request digest does not reconcile.');
  }
  exactKeys(request.route_bundle, ['canonical_compilation_sha256', 'route_bundle_digest', 'route_bundle_id', 'target_id']);
  if (request.route_bundle.target_id !== EXPECTED_TARGET || typeof request.route_bundle.route_bundle_id !== 'string' ||
      request.route_bundle.route_bundle_id.length === 0 ||
      !/^[a-f0-9]{64}$/u.test(request.route_bundle.route_bundle_digest || '') ||
      !/^[a-f0-9]{64}$/u.test(request.route_bundle.canonical_compilation_sha256 || '')) {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 route binding differs.');
  }
  const options = request.dsh_generate_options;
  exactKeys(options, ['maxTokens', 'messages', 'model', 'provider', 'reasoningEffort', 'sessionId', 'tools']);
  if (options.provider !== EXPECTED_PROVIDER || options.model !== EXPECTED_MODEL || options.reasoningEffort !== EXPECTED_REASONING ||
      options.maxTokens !== EXPECTED_MAX_TOKENS || options.sessionId !== `rc5-${request.scenario_id.toLocaleLowerCase('en-US')}` ||
      !Array.isArray(options.tools) || options.tools.length !== 0 || !Array.isArray(options.messages) || options.messages.length !== 9 ||
      Object.hasOwn(options, 'system')) {
    reject('WORKER_REQUEST_POLICY', 'The direct-adapter options differ from the RC-5 boundary.');
  }
  options.messages.forEach((message, ordinal) => validateMessage(message, ordinal, request.scenario_id));
  if (options.messages.map((message) => message.role).join(',') !== ROLE_SEQUENCE.join(',')) {
    reject('WORKER_REQUEST_DRIFT', 'The RC-5 ordered DSH role sequence differs.');
  }
  exactKeys(request.execution, [
    'automatic_retries', 'external_mutation', 'max_concurrency', 'max_output_tokens', 'max_provider_calls', 'timeout_ms',
  ]);
  if (request.execution.automatic_retries !== 0 || request.execution.external_mutation !== false ||
      request.execution.max_concurrency !== 1 || request.execution.max_output_tokens !== EXPECTED_MAX_TOKENS ||
      request.execution.max_provider_calls !== 1 || !Number.isInteger(request.execution.timeout_ms) ||
      request.execution.timeout_ms < 1_000 || request.execution.timeout_ms > MAX_TIMEOUT_MS) {
    reject('WORKER_REQUEST_POLICY', 'The RC-5 execution policy differs.');
  }
  return request;
}

function validateReservationBinding(reservation, request) {
  exactKeys(reservation, [
    'attempt_id', 'automatic_retries', 'case_ordinal', 'max_concurrency', 'max_output_tokens', 'max_provider_calls',
    'plan_digest', 'provider_authority_sha256', 'provider_call_budget_consumed', 'request_digest', 'request_file_sha256',
    'reservation_id', 'reserved_at_utc', 'route', 'runtime_id', 'scenario_id', 'schema_version', 'state', 'timeout_ms',
  ]);
  exactKeys(reservation.route, [
    'adapter_revision', 'executor_image_id', 'model', 'provider', 'reasoning_effort', 'transport_image_id',
  ]);
  const ordinal = ROLE_SEQUENCE.length > 0 ? ['FACT-01', 'FACT-03', 'SAFE-01'].indexOf(request.scenario_id) : -1;
  if (reservation.schema_version !== '1.0.0' || reservation.state !== 'consumed_pre_call' ||
      reservation.scenario_id !== request.scenario_id || reservation.case_ordinal !== ordinal ||
      reservation.reservation_id !== `RC5-RESERVATION-${request.scenario_id}-R01` ||
      reservation.attempt_id !== `RC5-ATTEMPT-${request.scenario_id}-R01` ||
      reservation.request_digest !== request.request_digest.value || reservation.provider_call_budget_consumed !== true ||
      reservation.automatic_retries !== 0 || reservation.max_concurrency !== 1 || reservation.max_output_tokens !== EXPECTED_MAX_TOKENS ||
      reservation.max_provider_calls !== 1 || reservation.timeout_ms !== request.execution.timeout_ms ||
      reservation.provider_authority_sha256 !== sha256(PROVIDER_AUTHORITY) ||
      !/^[a-f0-9]{64}$/u.test(reservation.plan_digest || '') || !/^[a-f0-9]{64}$/u.test(reservation.request_file_sha256 || '') ||
      typeof reservation.runtime_id !== 'string' || !/^RC5-EXEC-(?:FACT-01|FACT-03|SAFE-01)-[a-f0-9]{16}$/u.test(reservation.runtime_id) ||
      reservation.route.adapter_revision !== '2fc02090af1632b86ee1175a6720904dfd71081c' ||
      reservation.route.transport_image_id !== 'sha256:11f4d4b9777b13ec29430bd682e0cb6b46f715e3ead28736c87a94f89f89aa01' ||
      !/^sha256:[a-f0-9]{64}$/u.test(reservation.route.executor_image_id || '') ||
      reservation.route.model !== EXPECTED_MODEL || reservation.route.provider !== EXPECTED_PROVIDER ||
      reservation.route.reasoning_effort !== EXPECTED_REASONING) {
    reject('WORKER_RESERVATION', 'The durable reservation does not authorize this exact RC-5 request.');
  }
  return reservation;
}

function validateDispatchBinding(dispatch, reservation) {
  exactKeys(dispatch, [
    'attempt_id', 'automatic_retries', 'dispatch_id', 'dispatched_at_utc', 'provider_call_charged', 'request_digest',
    'reservation_id', 'runtime_id', 'scenario_id', 'schema_version', 'state',
  ]);
  if (dispatch.schema_version !== '1.0.0' || dispatch.state !== 'provider_handoff_started' ||
      dispatch.provider_call_charged !== true || dispatch.automatic_retries !== 0 ||
      dispatch.scenario_id !== reservation.scenario_id || dispatch.request_digest !== reservation.request_digest ||
      dispatch.runtime_id !== reservation.runtime_id || dispatch.reservation_id !== reservation.reservation_id ||
      dispatch.attempt_id !== reservation.attempt_id || dispatch.dispatch_id !== `RC5-DISPATCH-${reservation.scenario_id}-R01`) {
    reject('WORKER_DISPATCH', 'The durable dispatch does not reconcile to the RC-5 reservation.');
  }
  return dispatch;
}

function validateWorkerTimeout(timeoutMs, registeredTimeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isInteger(registeredTimeoutMs) || registeredTimeoutMs < 1_000 || registeredTimeoutMs > MAX_TIMEOUT_MS ||
      timeoutMs > registeredTimeoutMs) {
    reject('WORKER_INPUT', 'Worker timeout differs from the bounded registered authority.');
  }
  return true;
}

function strictWorkerInput(pathValue) {
  if (pathValue !== '/input/worker-input.json') reject('WORKER_INPUT', 'Worker input path differs from the registered mount.');
  const value = readCanonicalJson(pathValue, 'worker input');
  exactKeys(value, ['credentialPath', 'dispatch', 'lockDirectory', 'profileDirectory', 'request', 'reservation', 'timeoutMs', 'transportMode']);
  if (value.credentialPath !== '/credentials/.credentials.yaml' || value.lockDirectory !== '/locks' ||
      value.profileDirectory !== '/opt/recursus-profile' || !TRANSPORT_MODES.has(value.transportMode)) {
    reject('WORKER_INPUT', 'Worker paths or timeout differ from the registered container authority.');
  }
  validateWorkerTimeout(value.timeoutMs, value.request?.execution?.timeout_ms);
  validateOrderedWorkerRequest(value.request);
  validateReservationBinding(value.reservation, value.request);
  validateDispatchBinding(value.dispatch, value.reservation);
  return value;
}

function credentialScope(service) {
  const values = service?.values;
  if (!(values instanceof Map)) reject('CREDENTIAL_SCOPE', 'The credential service does not expose the registered key scope.');
  const selected = values.has(EXPECTED_CREDENTIAL_REF);
  return Object.freeze({ selected_reference_present: selected, unexpected_reference_count: values.size - (selected ? 1 : 0) });
}

function installFetchGuard(delegate = globalThis.fetch, limits = {}) {
  if (typeof delegate !== 'function') reject('FETCH_AUTHORITY', 'The registered fetch implementation is unavailable.');
  const maxResponses = limits.maxResponses ?? 1;
  const maxOauth = limits.maxOauth ?? 1;
  const counts = { oauth: 0, responses: 0, unregistered: 0 };
  const guarded = function guardedFetch(input, init) {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
    let href = '';
    try { href = new URL(rawUrl).href; } catch {}
    if (method === 'POST' && href === RESPONSES_ENDPOINT) {
      counts.responses += 1;
      if (limits.expectedResponsesPayload !== undefined) {
        let observed;
        try { observed = decodeRequestBody(init?.body, new Headers(init?.headers)); } catch {
          reject('FETCH_PAYLOAD_DRIFT', 'The live Responses payload could not be validated.');
        }
        if (canonicalJson(observed) !== canonicalJson(limits.expectedResponsesPayload)) {
          reject('FETCH_PAYLOAD_DRIFT', 'The live Responses payload differs from the validated RC-5 request.');
        }
      }
    }
    else if (method === 'POST' && href === OAUTH_ENDPOINT) counts.oauth += 1;
    else counts.unregistered += 1;
    if (counts.responses > maxResponses || counts.oauth > maxOauth || counts.unregistered > 0) {
      reject('FETCH_AUTHORITY', 'The adapter exceeded the registered fetch authority.');
    }
    return Reflect.apply(delegate, globalThis, [input, init]);
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: false, enumerable: true, value: guarded, writable: false });
  return Object.freeze({
    snapshot() {
      if (globalThis.fetch !== guarded) reject('FETCH_AUTHORITY', 'The application fetch guard was replaced.');
      return Object.freeze({ ...counts });
    },
  });
}

function protectAdapter(adapter) {
  let invocations = 0;
  const original = adapter.stream.bind(adapter);
  Object.defineProperty(adapter, 'stream', {
    configurable: false,
    enumerable: false,
    value(options) {
      invocations += 1;
      if (invocations > 1) reject('ADAPTER_INVOCATION_BUDGET', 'The worker exceeded one direct-adapter invocation.');
      return original(options);
    },
    writable: false,
  });
  return Object.freeze({ count: () => invocations });
}

function safeTokenCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 'not_reported';
}

function mapFinishReason(reason) {
  switch (reason?.kind) {
    case 'stop': return 'stop';
    case 'max-tokens': return 'max_tokens';
    case 'aborted': return 'aborted';
    case 'error': return 'error';
    default: return 'malformed';
  }
}

async function collectStream(adapter, generateOptions, timeoutMs) {
  const controller = new AbortController();
  let deadlineFired = false;
  const timer = setTimeout(() => {
    deadlineFired = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  const startedAt = Date.now();
  const textBlocks = new Map();
  let usage;
  let finish;
  let executionError = false;
  try {
    try {
      for await (const chunk of adapter.stream({ ...generateOptions, signal: controller.signal })) {
        if (chunk?.type === 'block-end') {
          if (chunk.block?.type === 'text' && typeof chunk.block.text === 'string' && Number.isInteger(chunk.index) && chunk.index >= 0) {
            if (textBlocks.has(chunk.index)) reject('MALFORMED_RESPONSE', 'The adapter produced a duplicate text block.');
            textBlocks.set(chunk.index, chunk.block.text);
          } else if (chunk.block?.type !== 'reasoning') reject('UNEXPECTED_TOOL_SURFACE', 'The no-tools request produced a non-text model action.');
        } else if (chunk?.type === 'usage') {
          if (usage !== undefined) reject('MALFORMED_RESPONSE', 'The adapter produced multiple usage records.');
          usage = chunk.usage;
        } else if (chunk?.type === 'finish') {
          if (finish !== undefined) reject('MALFORMED_RESPONSE', 'The adapter produced multiple finish records.');
          finish = chunk.reason;
        } else if (chunk?.type === 'block-start') {
          if (chunk.blockType !== 'text' && chunk.blockType !== 'reasoning') {
            reject('UNEXPECTED_TOOL_SURFACE', 'The no-tools request produced a non-text model action.');
          }
        } else if (!['text-delta', 'reasoning-delta'].includes(chunk?.type)) {
          reject('MALFORMED_RESPONSE', 'The adapter produced an unknown stream event.');
        }
      }
    } catch {
      executionError = true;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const wallMs = Math.min(timeoutMs, Math.max(0, Date.now() - startedAt));
  const finishReason = deadlineFired ? 'aborted' : executionError ? 'error' : mapFinishReason(finish);
  const completion = deadlineFired ? 'timed_out' : finishReason === 'stop' ? 'completed' : 'failed';
  const text = [...textBlocks.entries()].sort(([left], [right]) => left - right).map(([, value]) => value).join('');
  if (completion === 'completed' && (executionError || text.length === 0)) reject('MALFORMED_RESPONSE', 'A completed response has no usable assistant text.');
  const outputTokens = safeTokenCount(usage?.outputTokens);
  if (outputTokens !== 'not_reported' && outputTokens > EXPECTED_MAX_TOKENS) {
    reject('ARTIFACT_BUDGET', 'The provider reported output beyond the registered token cap.');
  }
  return Object.freeze({
    artifact: completion === 'completed' ? Buffer.from(text, 'utf8') : null,
    completion,
    finishReason,
    inputTokens: safeTokenCount(usage?.inputTokens),
    outputTokens,
    trustedCompleted: completion === 'completed',
    wallMs,
  });
}

function assertAdapterIdentity(codex, adapter, modelInfo) {
  if (codex.OPENAI_CODEX_TRANSPORT_CAPABILITIES?.[EXPECTED_CAPABILITY] !== true ||
      codex.ORDERED_SYSTEM_USER_MESSAGES_CAPABILITY !== EXPECTED_CAPABILITY ||
      modelInfo?.provider !== EXPECTED_PROVIDER || modelInfo?.id !== EXPECTED_MODEL ||
      !modelInfo?.reasoning?.efforts?.some((item) => item.id === EXPECTED_REASONING)) {
    reject('ADAPTER_IDENTITY', 'The direct adapter does not provide the registered RC-5 route.');
  }
  if (typeof adapter.stream !== 'function') reject('ADAPTER_IDENTITY', 'The direct adapter stream is unavailable.');
}

async function inspectAuthentication(options) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const credentialPath = nativeFile(options.credentialPath, 'DSH credential document');
  const lockDirectory = nativeDirectory(options.lockDirectory, 'credential lock directory');
  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const [cordis, credentialLocal, credentialApi, codex] = await Promise.all([
    loadFromProfile(requireFromProfile, '@deepseek-ai/cordis'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials-local'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials'),
    loadFromProfile(requireFromProfile, 'deepseek-openai-codex'),
  ]);
  const ctx = new cordis.Context();
  try {
    await ctx.plugin(credentialLocal.default, { path: credentialPath, watch: false });
    const status = await ctx.credentials.describe(credentialApi.credentialRef(EXPECTED_CREDENTIAL_REF));
    const scope = credentialScope(ctx.credentials);
    if (!status.configured || !status.writable || !scope.selected_reference_present || scope.unexpected_reference_count !== 0) {
      reject('AUTHENTICATION_UNAVAILABLE', 'The registered OAuth credential is not configured as one writable reference.');
    }
    const store = new codex.DshPiCredentialStore(ctx.credentials, {
      acquireTimeoutMs: 5_000,
      directory: lockDirectory,
      reference: credentialApi.credentialRef(EXPECTED_CREDENTIAL_REF),
      staleMs: 30_000,
    });
    await store.validateDurable();
    await store.modify(EXPECTED_PROVIDER, async () => undefined);
    return Object.freeze({
      configured: true,
      durable_decoded: true,
      lock_acquired: true,
      selected_reference_present: true,
      source: status.source ?? null,
      unexpected_reference_count: 0,
      writable: true,
    });
  } finally {
    await ctx.fiber.dispose();
  }
}

function boundedProviderFreeBody(body) {
  if (body === undefined || body === null) return Buffer.alloc(0);
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof Uint8Array) return Buffer.from(body);
  reject('PROVIDER_FREE_TRANSPORT', 'The provider-free request body has an unsupported representation.');
}

function parseProviderFreeHttpResponse(bytes) {
  const boundary = bytes.indexOf('\r\n\r\n');
  if (boundary < 0 || boundary > 16_384) reject('PROVIDER_FREE_TRANSPORT', 'The simulator response header is malformed.');
  const head = bytes.subarray(0, boundary).toString('latin1').split('\r\n');
  const status = /^HTTP\/1\.1 ([1-5][0-9]{2}) [\x20-\x7e]+$/u.exec(head.shift() ?? '');
  if (status === null) reject('PROVIDER_FREE_TRANSPORT', 'The simulator response status is malformed.');
  const headers = new Headers();
  for (const line of head) {
    const match = /^([!#$%&'*+.^_`|~0-9A-Za-z-]+):[\x09\x20-\x7e]*$/u.exec(line);
    if (match === null) reject('PROVIDER_FREE_TRANSPORT', 'The simulator response contains a malformed header.');
    const separator = line.indexOf(':');
    const name = line.slice(0, separator).toLowerCase();
    if (headers.has(name) || ['set-cookie', 'www-authenticate', 'proxy-authenticate'].includes(name)) {
      reject('PROVIDER_FREE_TRANSPORT', 'The simulator response contains an unexpected header.');
    }
    headers.set(name, line.slice(separator + 1).trim());
  }
  const body = bytes.subarray(boundary + 4);
  const declaredLength = Number(headers.get('content-length'));
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength !== body.length ||
      headers.get('connection')?.toLowerCase() !== 'close') {
    reject('PROVIDER_FREE_TRANSPORT', 'The simulator response body does not reconcile to its header.');
  }
  return new Response(body, { headers, status: Number(status[1]) });
}

function providerFreeTunnelFetch(timeoutMs) {
  return function tunnelFetch(input, init = {}) {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (href !== RESPONSES_ENDPOINT || String(init.method ?? input?.method ?? 'GET').toUpperCase() !== 'POST') {
      reject('PROVIDER_FREE_TRANSPORT', 'The simulator transport received an unregistered request.');
    }
    const body = boundedProviderFreeBody(init.body);
    if (body.length > MAX_INPUT_BYTES) reject('PROVIDER_FREE_TRANSPORT', 'The simulator request exceeds its byte bound.');
    const originalHeaders = new Headers(init.headers ?? input?.headers);
    const forwarded = [];
    for (const [name, value] of originalHeaders.entries()) {
      const normalized = name.toLowerCase();
      if (['connection', 'content-length', 'host', 'proxy-authorization', 'transfer-encoding'].includes(normalized)) continue;
      if (/[^!#$%&'*+.^_`|~0-9a-z-]/u.test(normalized) || /[^\x09\x20-\x7e]/u.test(value)) {
        reject('PROVIDER_FREE_TRANSPORT', 'The simulator request contains a malformed header.');
      }
      forwarded.push(`${normalized}: ${value}`);
    }
    const requestBytes = Buffer.concat([
      Buffer.from([
        'POST /backend-api/codex/responses HTTP/1.1',
        'host: chatgpt.com',
        ...forwarded,
        `content-length: ${body.length}`,
        'connection: close',
        '',
        '',
      ].join('\r\n'), 'latin1'),
      body,
    ]);
    return new Promise((resolvePromise, rejectPromise) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: 8080 });
      let phase = 'connect';
      let buffered = Buffer.alloc(0);
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', abort);
        socket.destroy();
        callback(value);
      };
      const fail = () => finish(rejectPromise, new RC5ProviderWorkerError('PROVIDER_FREE_TRANSPORT', 'The sealed simulator transport failed.'));
      const abort = () => fail();
      const timer = setTimeout(fail, Math.min(timeoutMs, 30_000));
      timer.unref?.();
      if (init.signal?.aborted) return abort();
      init.signal?.addEventListener('abort', abort, { once: true });
      socket.once('connect', () => {
        socket.write('CONNECT chatgpt.com:443 HTTP/1.1\r\nHost: chatgpt.com:443\r\n\r\n');
      });
      socket.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        if (buffered.length > MAX_PROVIDER_FREE_RESPONSE_BYTES) return fail();
        if (phase === 'connect') {
          const boundary = buffered.indexOf('\r\n\r\n');
          if (boundary < 0) {
            if (buffered.length > 8_192) fail();
            return;
          }
          if (buffered.subarray(0, boundary + 4).toString('latin1') !== 'HTTP/1.1 200 Connection Established\r\n\r\n') return fail();
          buffered = buffered.subarray(boundary + 4);
          phase = 'response';
          socket.write(requestBytes);
        }
      });
      socket.once('end', () => {
        if (phase !== 'response') return fail();
        try { finish(resolvePromise, parseProviderFreeHttpResponse(buffered)); } catch { fail(); }
      });
      socket.once('error', fail);
      socket.once('close', () => {
        if (!settled && !socket.readableEnded) fail();
      });
    });
  };
}

async function runDirectAdapter(options) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const credentialPath = nativeFile(options.credentialPath, 'DSH credential document');
  const lockDirectory = nativeDirectory(options.lockDirectory, 'credential lock directory');
  const request = validateOrderedWorkerRequest(options.request);
  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const providerFree = options.transportMode !== 'live';
  const fetchDelegate = providerFree ? providerFreeTunnelFetch(options.timeoutMs) : globalThis.fetch;
  const fetchGuard = installFetchGuard(fetchDelegate, {
    expectedResponsesPayload: expectedWirePayload(request),
    maxOauth: providerFree ? 0 : 1,
  });
  const [cordis, credentialLocal, codex] = await Promise.all([
    loadFromProfile(requireFromProfile, '@deepseek-ai/cordis'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials-local'),
    loadFromProfile(requireFromProfile, 'deepseek-openai-codex'),
  ]);
  const ctx = new cordis.Context();
  let adapter;
  try {
    await ctx.plugin(credentialLocal.default, { path: credentialPath, watch: false });
    const scope = credentialScope(ctx.credentials);
    if (!scope.selected_reference_present || scope.unexpected_reference_count !== 0) {
      reject('CREDENTIAL_SCOPE', 'The dedicated credential document contains an unexpected reference.');
    }
    const config = codex.resolveConfig({
      adapterTimeoutMs: options.timeoutMs,
      credentialRef: EXPECTED_CREDENTIAL_REF,
      lockDirectory,
    });
    const description = await ctx.credentials.describe(config.credentialRef);
    if (!description.configured) reject('AUTHENTICATION_UNAVAILABLE', 'The registered OAuth credential is not configured.');
    const store = new codex.DshPiCredentialStore(ctx.credentials, {
      acquireTimeoutMs: config.credentialLockAcquireTimeoutMs,
      directory: config.lockDirectory,
      reference: config.credentialRef,
      staleMs: config.credentialLockStaleMs,
    });
    await store.validateDurable();
    adapter = new codex.OpenAICodexAdapter({ credentials: store, resolveAttachments: () => undefined, timeoutMs: config.adapterTimeoutMs });
    const identity = await adapter.resolveModel(EXPECTED_PROVIDER, EXPECTED_MODEL);
    assertAdapterIdentity(codex, adapter, identity);
    const invocationGuard = protectAdapter(adapter);
    const collected = await collectStream(adapter, request.dsh_generate_options, options.timeoutMs);
    const fetchCounts = fetchGuard.snapshot();
    if (invocationGuard.count() !== 1 || fetchCounts.responses !== 1 || fetchCounts.oauth > 1 || fetchCounts.unregistered !== 0) {
      reject('EXECUTION_AUTHORITY', 'The direct adapter did not remain within one registered provider request.');
    }
    if ((options.transportMode === 'provider_free_success' &&
        (collected.completion !== 'completed' || collected.finishReason !== 'stop' || fetchCounts.oauth !== 0)) ||
        (options.transportMode === 'provider_free_failure' &&
        (collected.completion !== 'failed' || collected.finishReason !== 'error' || collected.artifact !== null || fetchCounts.oauth !== 0))) {
      reject('PROVIDER_FREE_EXECUTION', 'The exact-path simulator result differs from its sealed mode.');
    }
    if (collected.artifact !== null && collected.artifact.length > MAX_ARTIFACT_BYTES) {
      reject('ARTIFACT_BUDGET', 'The assistant artifact exceeds the persistence bound.');
    }
    return Object.freeze({
      artifact: collected.artifact,
      result: Object.freeze({
        completion: collected.completion,
        direct_adapter_invocations: invocationGuard.count(),
        external_mutations: [],
        finish_reason: collected.finishReason,
        input_tokens: collected.inputTokens,
        oauth_refresh_count: fetchCounts.oauth,
        output_tokens: collected.outputTokens,
        provider_request_count: fetchCounts.responses,
        responses_endpoint: RESPONSES_ENDPOINT,
        schema_version: '1.0.0',
        transport_mode: options.transportMode,
        trusted_completed: collected.trustedCompleted,
        wall_ms: collected.wallMs,
      }),
    });
  } finally {
    adapter?.dispose();
    await ctx.fiber.dispose();
  }
}

function expectedWirePayload(request) {
  const options = request.dsh_generate_options;
  return {
    include: ['reasoning.encrypted_content'],
    input: options.messages.map((message) => ({ content: [{ text: message.content[0].text, type: 'input_text' }], role: message.role })),
    max_output_tokens: options.maxTokens,
    model: options.model,
    parallel_tool_calls: false,
    prompt_cache_key: options.sessionId,
    reasoning: { effort: 'xhigh', summary: 'auto' },
    store: false,
    stream: true,
    text: { verbosity: 'low' },
    tool_choice: 'none',
  };
}

function decodeRequestBody(body, headers) {
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof Uint8Array) {
    const bytes = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(body) : body;
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }
  reject('PROVIDER_FREE_PAYLOAD', 'The provider-free request body has an unexpected representation.');
}

function invocationAuthority(command) {
  if (command === RC5_CONTAINER_RUN_AUTHORITY_V1.application_argv[0]) return RC5_CONTAINER_RUN_AUTHORITY_V1;
  return RC5_CONTAINER_RUN_AUTHORITY_V1.supporting_invocations[command];
}

function validateContainerInvocationObservation(observation) {
  exactKeys(observation, [
    'application_argv', 'dockerenv_present', 'entrypoint', 'environment', 'exec_argv', 'gid', 'node_permissions',
    'platform', 'script_path', 'uid', 'working_directory',
  ], 'WORKER_AUTHORITY');
  const command = observation.application_argv?.[0];
  const authority = invocationAuthority(command);
  if (authority === undefined ||
      observation.platform !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.platform ||
      observation.uid !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.uid ||
      observation.gid !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.gid ||
      observation.working_directory !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.working_directory ||
      observation.script_path !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.script_path ||
      observation.entrypoint !== RC5_CONTAINER_RUN_AUTHORITY_V1.entrypoint ||
      observation.dockerenv_present !== true) {
    reject('WORKER_AUTHORITY', 'Worker is outside the registered container authority context.');
  }
  exactKeys(observation.node_permissions, RC5_CONTAINER_RUN_AUTHORITY_V1.node_permissions_required_false, 'WORKER_AUTHORITY');
  if (RC5_CONTAINER_RUN_AUTHORITY_V1.node_permissions_required_false
    .some((permission) => observation.node_permissions[permission] !== false)) {
    reject('WORKER_AUTHORITY', 'Worker Node permissions differ from the registered authority profile.');
  }
  if (JSON.stringify(observation.exec_argv) !== JSON.stringify(authority.exec_argv)) {
    reject('WORKER_AUTHORITY', 'Worker Node permissions differ from the registered authority profile.');
  }
  if (JSON.stringify(observation.application_argv) !== JSON.stringify(authority.application_argv)) {
    reject('WORKER_AUTHORITY', 'Worker application arguments differ from the registered authority profile.');
  }
  if (observation.environment === null || typeof observation.environment !== 'object' || Array.isArray(observation.environment)) {
    reject('WORKER_AUTHORITY', 'Worker environment differs from the closed registered allowlist.');
  }
  const allowedEnvironment = new Set([
    ...Object.keys(authority.environment.exact),
    ...authority.environment.allowed_additional_keys,
  ]);
  if (Object.keys(observation.environment).some((key) => !allowedEnvironment.has(key)) ||
      Object.entries(authority.environment.exact).some(([key, value]) => observation.environment[key] !== value) ||
      authority.environment.allowed_additional_keys.some((key) =>
        Object.hasOwn(observation.environment, key) && typeof observation.environment[key] !== 'string')) {
    reject('WORKER_AUTHORITY', 'Worker environment differs from the closed registered allowlist.');
  }
  return true;
}

function captureContainerInvocationObservation(argv) {
  return {
    application_argv: [...argv],
    dockerenv_present: existsSync(RC5_CONTAINER_RUN_AUTHORITY_V1.identity.dockerenv_path),
    entrypoint: process.execPath,
    environment: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')),
    exec_argv: [...process.execArgv],
    gid: process.getgid?.(),
    node_permissions: Object.fromEntries(RC5_CONTAINER_RUN_AUTHORITY_V1.node_permissions_required_false
      .map((permission) => [permission, process.permission?.has(permission)])),
    platform: process.platform,
    script_path: process.argv[1],
    uid: process.getuid?.(),
    working_directory: process.cwd(),
  };
}

function assertContainerInvocation(argv) {
  return validateContainerInvocationObservation(captureContainerInvocationObservation(argv));
}

async function runCli(argv) {
  assertContainerInvocation(argv);
  const [command, inputPath, outputDirectory] = argv;
  if (command === 'container-auth-status') {
    const output = nativeDirectory(inputPath, 'authentication status output', true);
    const status = await inspectAuthentication({
      credentialPath: '/credentials/.credentials.yaml',
      lockDirectory: '/locks',
      profileDirectory: '/opt/recursus-profile',
    });
    writeExclusiveJson(output, 'authentication-status.json', status);
    return;
  }
  if (command !== 'container-run') reject('WORKER_USAGE', 'Worker container command is invalid.');
  const output = nativeDirectory(outputDirectory, 'worker output', true);
  const input = strictWorkerInput(inputPath);
  const execution = await runDirectAdapter(input);
  if (execution.result.completion === 'completed') {
    if (execution.artifact === null || execution.artifact.length === 0) reject('MALFORMED_RESPONSE', 'A completed result requires assistant output.');
    const { assertStagingContentSafe } = await import('file:///opt/rc3/recursus-route-content-gate-v17.mjs');
    try { assertStagingContentSafe(execution.artifact, 'RC-5 assistant output'); } catch {
      reject('STAGING_CONTENT_REJECTED', 'Assistant output failed the content-safe persistence gate.');
    }
    writeFileSync(join(output, 'assistant-output.md'), execution.artifact, { flag: 'wx' });
  } else if (execution.artifact !== null) {
    reject('MALFORMED_RESPONSE', 'An incomplete result cannot persist assistant output.');
  }
  writeExclusiveJson(output, 'worker-result.json', execution.result);
}

export const RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS = Object.freeze({
  captureContainerInvocationObservation,
  invocationAuthority,
  parseProviderFreeHttpResponse,
  validateContainerInvocationObservation,
  validateWorkerTimeout,
});

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    try {
      const output = process.argv.at(-1);
      if (typeof output === 'string' && isAbsolute(output) && existsSync(output)) {
        const code = error instanceof RC5ProviderWorkerError ? error.code : 'WORKER_FAILED';
        writeExclusiveJson(output, 'worker-failure.json', { code, status: 'failed' });
      }
    } catch {}
    process.exitCode = 1;
  }
}
