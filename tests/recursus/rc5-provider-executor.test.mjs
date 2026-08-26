import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { zstdCompressSync } from 'node:zlib';

import {
  RC5_EXECUTOR_IMAGE_ID,
  RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS,
} from '../../lib/recursus/rc5-provider-executor.mjs';
import { RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS } from '../../lib/recursus/rc5-provider-worker.mjs';
import { canonicalJsonV1 } from '../../lib/recursus/prompt-context-v1.mjs';

const require = createRequire(import.meta.url);
const {
  baseSimulatorObservation,
  canonicalJson: canonicalSimulatorJson,
  decodeSimulatorBody,
  simulatorHeaderNames,
  validateSimulatorFraming,
  validateSimulatorPayload,
} = require('../../scripts/recursus/rc5-provider-free-payload-probe.cjs');

const {
  allocateAuthorityResources,
  authorityCreationReconciled,
  boundedDeadlineTimeout,
  cleanupAuthority,
  containmentMayRelease,
  CLEANUP_HEADROOM_MS,
  deadlineRemainingMs,
  executionCutoffDeadline,
  MAX_TIMEOUT_MS,
  WORKER_EXIT_GRACE_MS,
} = RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS;

const {
  invocationAuthority,
  parseProviderFreeHttpResponse,
  validateContainerInvocationObservation,
} = RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS;

const CONTAINER_RUN_AUTHORITY = RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.CONTAINER_RUN_AUTHORITY;

function productionInvocationObservation() {
  return {
    application_argv: [...CONTAINER_RUN_AUTHORITY.application_argv],
    dockerenv_present: true,
    entrypoint: CONTAINER_RUN_AUTHORITY.entrypoint,
    environment: { ...CONTAINER_RUN_AUTHORITY.environment.exact, HOSTNAME: 'rc5-provider-free-test' },
    exec_argv: [...CONTAINER_RUN_AUTHORITY.exec_argv],
    gid: CONTAINER_RUN_AUTHORITY.identity.gid,
    node_permissions: Object.fromEntries(CONTAINER_RUN_AUTHORITY.node_permissions_required_false.map((key) => [key, false])),
    platform: CONTAINER_RUN_AUTHORITY.identity.platform,
    script_path: CONTAINER_RUN_AUTHORITY.identity.script_path,
    uid: CONTAINER_RUN_AUTHORITY.identity.uid,
    working_directory: CONTAINER_RUN_AUTHORITY.identity.working_directory,
  };
}

const INSPECT_MOUNT_SOURCES = Object.freeze({
  credential_home: 'C:\\rc5-test\\credentials',
  input_directory: 'C:\\rc5-test\\input',
  lock_directory: 'C:\\rc5-test\\locks',
  output_directory: 'C:\\rc5-test\\output',
});
const INSPECT_NETWORK = 'container:sha256:rc5-test-relay';

function productionInspectObservation() {
  const docker = CONTAINER_RUN_AUTHORITY.docker;
  return {
    Config: {
      ...structuredClone(docker.config_defaults),
      Cmd: [...RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.WORKER_ARGUMENTS],
      Entrypoint: [CONTAINER_RUN_AUTHORITY.entrypoint],
      Env: Object.entries(CONTAINER_RUN_AUTHORITY.environment.exact).map(([key, value]) => `${key}=${value}`),
      Hostname: '0123456789ab',
      Image: RC5_EXECUTOR_IMAGE_ID,
      Labels: { [docker.contract_label.name]: docker.contract_label.value },
      User: docker.container_user,
      WorkingDir: CONTAINER_RUN_AUTHORITY.identity.working_directory,
    },
    HostConfig: {
      ...structuredClone(docker.host_config_defaults),
      Binds: docker.binds,
      CapAdd: docker.capability_additions,
      CapDrop: structuredClone(docker.capability_drops),
      CgroupnsMode: docker.cgroup_namespace_mode,
      DeviceRequests: docker.device_requests,
      Devices: structuredClone(docker.devices),
      IpcMode: docker.ipc_mode,
      LogConfig: structuredClone(docker.log_config),
      Memory: docker.memory_limit_bytes,
      Mounts: CONTAINER_RUN_AUTHORITY.mounts.map((item) => ({
        ReadOnly: item.mode === 'ro',
        Source: INSPECT_MOUNT_SOURCES[item.source_key],
        Target: item.destination,
        Type: item.type,
      })),
      NanoCpus: docker.cpu_limit_nanos,
      NetworkMode: INSPECT_NETWORK,
      PidMode: docker.pid_namespace_mode,
      PidsLimit: docker.pid_limit,
      Privileged: docker.privileged,
      ReadonlyRootfs: docker.read_only_rootfs,
      RestartPolicy: structuredClone(docker.restart_policy),
      Runtime: docker.runtime,
      SecurityOpt: structuredClone(docker.security_options),
      Tmpfs: { [docker.tmpfs.destination]: docker.tmpfs.options },
      UTSMode: docker.uts_namespace_mode,
      Ulimits: structuredClone(docker.ulimits),
      UsernsMode: docker.user_namespace_mode,
      VolumesFrom: docker.volumes_from,
    },
    Image: RC5_EXECUTOR_IMAGE_ID,
    NetworkSettings: { Networks: {} },
  };
}

function distinctJsonValue(value) {
  if (value === null) return 'rc5-changed';
  if (typeof value === 'boolean') return !value;
  if (typeof value === 'number') return value + 1;
  if (typeof value === 'string') return `${value}rc5-changed`;
  if (Array.isArray(value)) return [...structuredClone(value), 'rc5-changed'];
  return { ...structuredClone(value), rc5_changed: true };
}

function expectWorkerAuthorityRejection(observation, label) {
  assert.throws(
    () => validateContainerInvocationObservation(observation),
    (error) => error?.code === 'WORKER_AUTHORITY',
    label,
  );
}

function mutateVectorObservation(field, mutate) {
  const observation = productionInvocationObservation();
  mutate(observation[field]);
  return observation;
}

test('production authority manifest projects one exact ordered container-run argv', () => {
  const expectedExecArgv = [
    '--permission',
    '--use-env-proxy',
    '--no-addons',
    '--report-exclude-env',
    '--report-exclude-network',
    '--allow-fs-read=/.dockerenv',
    '--allow-fs-read=/opt/recursus-profile',
    '--allow-fs-read=/opt/rc5/rc5-provider-worker.mjs',
    '--allow-fs-read=/opt/rc3/recursus-route-content-gate-v17.mjs',
    '--allow-fs-read=/opt/rc3/recursus-route-html-entities-v17.mjs',
    '--allow-fs-read=/credentials',
    '--allow-fs-read=/input/worker-input.json',
    '--allow-fs-read=/output',
    '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials',
    '--allow-fs-write=/output',
    '--allow-fs-write=/locks',
    '--allow-fs-write=/tmp',
  ];
  const expectedApplicationArgv = ['container-run', '/input/worker-input.json', '/output'];
  assert.equal(CONTAINER_RUN_AUTHORITY.manifest_id, 'rc5-container-run-authority-v1');
  assert.equal(CONTAINER_RUN_AUTHORITY.schema_version, '1.0.0');
  assert.match(RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.CONTAINER_RUN_AUTHORITY_SHA256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(CONTAINER_RUN_AUTHORITY.exec_argv, expectedExecArgv);
  assert.deepEqual(CONTAINER_RUN_AUTHORITY.application_argv, expectedApplicationArgv);
  assert.deepEqual(invocationAuthority('container-run'), CONTAINER_RUN_AUTHORITY);
  assert.deepEqual(RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.WORKER_ARGUMENTS, [
    ...expectedExecArgv,
    CONTAINER_RUN_AUTHORITY.identity.script_path,
    ...expectedApplicationArgv,
  ]);
  assert.equal(validateContainerInvocationObservation(productionInvocationObservation()), true);
});

test('every production argv deletion, insertion, adjacent swap, and substitution is rejected by the worker', () => {
  for (const field of ['exec_argv', 'application_argv']) {
    const original = productionInvocationObservation()[field];
    for (let index = 0; index < original.length; index += 1) {
      expectWorkerAuthorityRejection(
        mutateVectorObservation(field, (argv) => { argv.splice(index, 1); }),
        `${field} deletion at ${index}`,
      );
      expectWorkerAuthorityRejection(
        mutateVectorObservation(field, (argv) => { argv[index] = `rc5-substitution-${index}`; }),
        `${field} substitution at ${index}`,
      );
    }
    for (let index = 0; index <= original.length; index += 1) {
      expectWorkerAuthorityRejection(
        mutateVectorObservation(field, (argv) => { argv.splice(index, 0, `rc5-insertion-${index}`); }),
        `${field} insertion at ${index}`,
      );
    }
    for (let index = 0; index < original.length - 1; index += 1) {
      expectWorkerAuthorityRejection(
        mutateVectorObservation(field, (argv) => { [argv[index], argv[index + 1]] = [argv[index + 1], argv[index]]; }),
        `${field} adjacent swap at ${index}`,
      );
    }
  }
});

test('worker and executor reject every closed-environment deletion, change, addition, and duplicate', () => {
  const exactEntries = Object.entries(CONTAINER_RUN_AUTHORITY.environment.exact);
  for (const [key] of exactEntries) {
    const deleted = productionInvocationObservation();
    delete deleted.environment[key];
    expectWorkerAuthorityRejection(deleted, `worker environment deletion: ${key}`);

    const changed = productionInvocationObservation();
    changed.environment[key] = `${changed.environment[key]}-changed`;
    expectWorkerAuthorityRejection(changed, `worker environment change: ${key}`);
  }
  const added = productionInvocationObservation();
  added.environment.RC5_UNREGISTERED = '1';
  expectWorkerAuthorityRejection(added, 'worker environment addition');

  const optionalHostnameAbsent = productionInvocationObservation();
  delete optionalHostnameAbsent.environment.HOSTNAME;
  assert.equal(validateContainerInvocationObservation(optionalHostnameAbsent), true);
  const optionalHostnameChanged = productionInvocationObservation();
  optionalHostnameChanged.environment.HOSTNAME = 'another-container-hostname';
  assert.equal(validateContainerInvocationObservation(optionalHostnameChanged), true);

  const rawEnvironment = exactEntries.map(([key, value]) => `${key}=${value}`);
  const projection = RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.projectUniqueRawEnvironment(rawEnvironment);
  assert.deepEqual(projection.values, CONTAINER_RUN_AUTHORITY.environment.exact);
  for (const entry of rawEnvironment) {
    assert.throws(
      () => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.projectUniqueRawEnvironment([...rawEnvironment, entry]),
      { code: 'RC5_RUNTIME_AUTHORITY' },
      `executor duplicate environment: ${entry.slice(0, entry.indexOf('='))}`,
    );
  }
  for (const malformed of [null, ['NO_EQUALS'], ['1INVALID=value'], [42]]) {
    assert.throws(
      () => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.projectUniqueRawEnvironment(malformed),
      { code: 'RC5_RUNTIME_AUTHORITY' },
    );
  }
});

test('Docker inspect validation rejects identity, environment, authority, limit, and topology mutations', () => {
  const validate = (inspect) => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateContainerRunInspectObservation(inspect, {
    expectedNetwork: INSPECT_NETWORK,
    mountSources: INSPECT_MOUNT_SOURCES,
  });
  assert.deepEqual(validate(productionInspectObservation()), {
    manifest_id: CONTAINER_RUN_AUTHORITY.manifest_id,
    manifest_sha256: RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.CONTAINER_RUN_AUTHORITY_SHA256,
    raw_environment_keys: Object.keys(CONTAINER_RUN_AUTHORITY.environment.exact),
    valid: true,
  });

  const docker = CONTAINER_RUN_AUTHORITY.docker;
  const mutations = [
    ['config image', (value) => { value.Config.Image = 'sha256:' + '0'.repeat(64); }],
    ['runtime image', (value) => { value.Image = 'sha256:' + '0'.repeat(64); }],
    ['entrypoint', (value) => { value.Config.Entrypoint = ['/bin/false']; }],
    ['working directory', (value) => { value.Config.WorkingDir = '/tmp'; }],
    ['user', (value) => { value.Config.User = '0:0'; }],
    ['command', (value) => { value.Config.Cmd.pop(); }],
    ['contract label', (value) => { value.Config.Labels[docker.contract_label.name] += '-changed'; }],
    ['network mode', (value) => { value.HostConfig.NetworkMode = 'none'; }],
    ['attached network', (value) => { value.NetworkSettings.Networks.unexpected = {}; }],
    ['read-only root', (value) => { value.HostConfig.ReadonlyRootfs = false; }],
    ['privileged', (value) => { value.HostConfig.Privileged = true; }],
    ['capability addition', (value) => { value.HostConfig.CapAdd = ['NET_ADMIN']; }],
    ['capability drop', (value) => { value.HostConfig.CapDrop = []; }],
    ['binds', (value) => { value.HostConfig.Binds = []; }],
    ['devices', (value) => { value.HostConfig.Devices = [{ PathOnHost: '/dev/null' }]; }],
    ['device requests', (value) => { value.HostConfig.DeviceRequests = []; }],
    ['volumes from', (value) => { value.HostConfig.VolumesFrom = []; }],
    ['runtime', (value) => { value.HostConfig.Runtime = 'changed'; }],
    ['pid namespace', (value) => { value.HostConfig.PidMode = 'host'; }],
    ['uts namespace', (value) => { value.HostConfig.UTSMode = 'host'; }],
    ['user namespace', (value) => { value.HostConfig.UsernsMode = 'host'; }],
    ['cgroup namespace', (value) => { value.HostConfig.CgroupnsMode = 'host'; }],
    ['restart policy', (value) => { value.HostConfig.RestartPolicy.MaximumRetryCount = 1; }],
    ['ulimit', (value) => { value.HostConfig.Ulimits[0].Hard += 1; }],
    ['log configuration', (value) => { value.HostConfig.LogConfig.Type = 'local'; }],
    ['security option', (value) => { value.HostConfig.SecurityOpt = []; }],
    ['pid limit', (value) => { value.HostConfig.PidsLimit += 1; }],
    ['ipc mode', (value) => { value.HostConfig.IpcMode = 'shareable'; }],
    ['memory limit', (value) => { value.HostConfig.Memory += 1; }],
    ['cpu limit', (value) => { value.HostConfig.NanoCpus += 1; }],
    ['tmpfs options', (value) => { value.HostConfig.Tmpfs[docker.tmpfs.destination] += ',exec'; }],
    ['exposed ports', (value) => { value.Config.ExposedPorts = {}; }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = productionInspectObservation();
    mutate(changed);
    assert.throws(() => validate(changed), { code: 'RC5_RUNTIME_AUTHORITY' }, label);
  }

  for (const [scope, defaults] of [
    ['Config', docker.config_defaults],
    ['HostConfig', docker.host_config_defaults],
  ]) {
    for (const [field, expected] of Object.entries(defaults)) {
      const deleted = productionInspectObservation();
      delete deleted[scope][field];
      assert.throws(() => validate(deleted), { code: 'RC5_RUNTIME_AUTHORITY' }, `${scope}.${field} omission`);

      const changed = productionInspectObservation();
      changed[scope][field] = distinctJsonValue(expected);
      assert.throws(() => validate(changed), { code: 'RC5_RUNTIME_AUTHORITY' }, `${scope}.${field} mutation`);
    }
  }

  for (const [scope, fields] of [
    ['Config', docker.config_dynamic_fields],
    ['HostConfig', docker.host_config_dynamic_fields],
  ]) {
    for (const field of fields) {
      const deleted = productionInspectObservation();
      delete deleted[scope][field];
      assert.throws(() => validate(deleted), { code: 'RC5_RUNTIME_AUTHORITY' }, `${scope}.${field} dynamic omission`);
    }
  }

  for (const [scope, fields] of [
    ['Config', docker.config_absent_fields],
    ['HostConfig', docker.host_config_absent_fields],
  ]) {
    for (const field of fields) {
      const inserted = productionInspectObservation();
      inserted[scope][field] = null;
      assert.throws(() => validate(inserted), { code: 'RC5_RUNTIME_AUTHORITY' }, `${scope}.${field} insertion`);
    }
  }

  for (const invalidHostname of ['', '0123456789a', '0123456789abc', '0123456789AZ']) {
    const changed = productionInspectObservation();
    changed.Config.Hostname = invalidHostname;
    assert.throws(() => validate(changed), { code: 'RC5_RUNTIME_AUTHORITY' }, `hostname ${invalidHostname}`);
  }

  for (const scope of ['Config', 'HostConfig']) {
    const inserted = productionInspectObservation();
    inserted[scope].RC5UnregisteredAuthority = true;
    assert.throws(() => validate(inserted), { code: 'RC5_RUNTIME_AUTHORITY' }, `${scope} unknown-key insertion`);
  }

  const extraTmpfs = productionInspectObservation();
  extraTmpfs.HostConfig.Tmpfs['/unregistered'] = 'rw';
  assert.throws(() => validate(extraTmpfs), { code: 'RC5_RUNTIME_AUTHORITY' }, 'extra tmpfs insertion');

  for (const [key] of Object.entries(CONTAINER_RUN_AUTHORITY.environment.exact)) {
    const deleted = productionInspectObservation();
    deleted.Config.Env = deleted.Config.Env.filter((entry) => !entry.startsWith(`${key}=`));
    assert.throws(() => validate(deleted), { code: 'RC5_RUNTIME_AUTHORITY' }, `inspect environment deletion: ${key}`);

    const changed = productionInspectObservation();
    changed.Config.Env = changed.Config.Env.map((entry) => entry.startsWith(`${key}=`) ? `${key}=changed` : entry);
    assert.throws(() => validate(changed), { code: 'RC5_RUNTIME_AUTHORITY' }, `inspect environment change: ${key}`);

    const duplicated = productionInspectObservation();
    duplicated.Config.Env.push(duplicated.Config.Env.find((entry) => entry.startsWith(`${key}=`)));
    assert.throws(() => validate(duplicated), { code: 'RC5_RUNTIME_AUTHORITY' }, `inspect environment duplicate: ${key}`);
  }
  const extraEnvironment = productionInspectObservation();
  extraEnvironment.Config.Env.push('RC5_UNREGISTERED=1');
  assert.throws(() => validate(extraEnvironment), { code: 'RC5_RUNTIME_AUTHORITY' }, 'inspect environment addition');

  const hostname = productionInspectObservation();
  hostname.Config.Env.push('HOSTNAME=rc5-provider-free-test');
  assert.equal(validate(hostname).valid, true);
});

test('Docker inspect validation rejects every mount source, destination, type, and mode mutation', () => {
  const validate = (inspect) => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateContainerRunInspectObservation(inspect, {
    expectedNetwork: INSPECT_NETWORK,
    mountSources: INSPECT_MOUNT_SOURCES,
  });
  for (let index = 0; index < CONTAINER_RUN_AUTHORITY.mounts.length; index += 1) {
    for (const [field, mutate] of [
      ['source', (mount) => { mount.Source += '-changed'; }],
      ['destination', (mount) => { mount.Target += '-changed'; }],
      ['type', (mount) => { mount.Type = mount.Type === 'bind' ? 'volume' : 'bind'; }],
      ['mode', (mount) => { mount.ReadOnly = !mount.ReadOnly; }],
    ]) {
      const changed = productionInspectObservation();
      mutate(changed.HostConfig.Mounts[index]);
      assert.throws(() => validate(changed), { code: 'RC5_RUNTIME_AUTHORITY' }, `mount ${index} ${field}`);
    }
  }
  const omitted = productionInspectObservation();
  omitted.HostConfig.Mounts.pop();
  assert.throws(() => validate(omitted), { code: 'RC5_RUNTIME_AUTHORITY' }, 'mount omission');
  const inserted = productionInspectObservation();
  inserted.HostConfig.Mounts.push({ ReadOnly: true, Source: 'C:\\rc5-test\\extra', Target: '/extra', Type: 'bind' });
  assert.throws(() => validate(inserted), { code: 'RC5_RUNTIME_AUTHORITY' }, 'mount insertion');
});

test('worker-result validation keeps live and provider-free transport modes disjoint', () => {
  const request = { execution: { max_output_tokens: 4_000 } };
  const resultFor = (transportMode) => ({
    completion: transportMode === 'provider_free_failure' ? 'failed' : 'completed',
    direct_adapter_invocations: 1,
    external_mutations: [],
    finish_reason: transportMode === 'provider_free_failure' ? 'error' : 'stop',
    input_tokens: transportMode === 'provider_free_failure' ? 'not_reported' : 7,
    oauth_refresh_count: 0,
    output_tokens: transportMode === 'provider_free_failure' ? 'not_reported' : 2,
    provider_request_count: 1,
    responses_endpoint: RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.RESPONSES_ENDPOINT,
    schema_version: '1.0.0',
    transport_mode: transportMode,
    trusted_completed: transportMode !== 'provider_free_failure',
    wall_ms: 10,
  });
  const modes = ['live', 'provider_free_success', 'provider_free_failure'];
  for (const mode of modes) {
    const result = resultFor(mode);
    assert.deepEqual(
      RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateWorkerResult(Buffer.from(canonicalJsonV1(result)), request, mode),
      result,
    );
    for (const otherMode of modes.filter((item) => item !== mode)) {
      assert.throws(
        () => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateWorkerResult(Buffer.from(canonicalJsonV1(result)), request, otherMode),
        { code: 'RC5_WORKER_OUTPUT' },
        `${mode} result accepted as ${otherMode}`,
      );
    }
  }
});

function providerFreeResponseFrame(status, reason, body, headers = {}) {
  const bytes = Buffer.from(body, 'utf8');
  const lines = [
    `HTTP/1.1 ${status} ${reason}`,
    `content-length: ${bytes.length}`,
    'connection: close',
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
    '',
    '',
  ];
  return Buffer.concat([Buffer.from(lines.join('\r\n'), 'latin1'), bytes]);
}

test('provider-free HTTP framing parser accepts exact success and 503 responses and rejects ambiguous framing', async () => {
  const successBody = 'data: {"type":"response.completed"}\n\ndata: [DONE]\n\n';
  const success = parseProviderFreeHttpResponse(providerFreeResponseFrame(200, 'OK', successBody, {
    'content-type': 'text/event-stream',
  }));
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('content-type'), 'text/event-stream');
  assert.equal(await success.text(), successBody);

  const failureBody = 'provider-free failure';
  const failure = parseProviderFreeHttpResponse(providerFreeResponseFrame(503, 'Service Unavailable', failureBody, {
    'content-type': 'text/plain',
  }));
  assert.equal(failure.status, 503);
  assert.equal(failure.headers.get('content-type'), 'text/plain');
  assert.equal(await failure.text(), failureBody);

  const malformed = [
    Buffer.from('HTTP/1.1 200 OK\ncontent-length: 0\n\n', 'latin1'),
    Buffer.from('HTTP/1.1 200 OK\r\ncontent-length: 2\r\nconnection: close\r\n\r\nx', 'latin1'),
    Buffer.from('HTTP/1.1 200 OK\r\ncontent-length: 0\r\ncontent-length: 0\r\nconnection: close\r\n\r\n', 'latin1'),
    Buffer.from('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: keep-alive\r\n\r\n', 'latin1'),
    Buffer.from('HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\nset-cookie: secret=value\r\n\r\n', 'latin1'),
  ];
  for (const bytes of malformed) {
    assert.throws(() => parseProviderFreeHttpResponse(bytes), { code: 'PROVIDER_FREE_TRANSPORT' });
  }
});

const SIMULATOR_AUTHORIZATION = 'Bearer RC5_RAW_AUTH_SENTINEL_A7Q2';

function acceptedSimulatorPayload() {
  const roles = ['system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system'];
  return {
    include: ['reasoning.encrypted_content'],
    input: roles.map((role, index) => ({
      content: [{ text: `{"ordinal":${index}}\n`, type: 'input_text' }],
      role,
    })),
    max_output_tokens: 4_000,
    model: 'gpt-5.6-sol',
    parallel_tool_calls: false,
    prompt_cache_key: 'rc5-fact-01',
    reasoning: { effort: 'xhigh', summary: 'auto' },
    store: false,
    stream: true,
    text: { verbosity: 'low' },
    tool_choice: 'none',
  };
}

function acceptedSimulatorRequest() {
  const body = Buffer.from(JSON.stringify(acceptedSimulatorPayload()), 'utf8');
  return {
    body,
    complete: true,
    headers: {
      authorization: SIMULATOR_AUTHORIZATION,
      'content-length': String(body.length),
      'content-type': 'application/json',
      host: 'chatgpt.com',
    },
    httpVersion: '1.1',
    method: 'POST',
    rawHeaders: [
      'Host', 'chatgpt.com',
      'Content-Length', String(body.length),
      'Content-Type', 'application/json',
      'Authorization', SIMULATOR_AUTHORIZATION,
    ],
    rawTrailers: [],
    socket: { encrypted: false },
    url: '/backend-api/codex/responses',
  };
}

function removeRawHeader(request, name) {
  const retained = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index].toLocaleLowerCase('en-US') !== name) {
      retained.push(request.rawHeaders[index], request.rawHeaders[index + 1]);
    }
  }
  request.rawHeaders = retained;
  delete request.headers[name];
}

test('simulator framing rejects wrong route, protocol, authorization, and conflicting entity framing', () => {
  const accepted = acceptedSimulatorRequest();
  assert.deepEqual(validateSimulatorFraming(accepted), { contentEncoding: undefined, length: accepted.body.length });

  const mutations = [
    ['method', (value) => { value.method = 'GET'; }],
    ['path', (value) => { value.url += '?hidden=1'; }],
    ['HTTP version', (value) => { value.httpVersion = '2.0'; }],
    ['encrypted socket', (value) => { value.socket.encrypted = true; }],
    ['missing authorization', (value) => { removeRawHeader(value, 'authorization'); }],
    ['duplicate authorization', (value) => { value.rawHeaders.push('Authorization', SIMULATOR_AUTHORIZATION); }],
    ['missing content length', (value) => { removeRawHeader(value, 'content-length'); }],
    ['duplicate content length', (value) => { value.rawHeaders.push('Content-Length', value.headers['content-length']); }],
    ['noncanonical content length', (value) => {
      value.headers['content-length'] = '01';
      value.rawHeaders[value.rawHeaders.indexOf('Content-Length') + 1] = '01';
    }],
    ['zero content length', (value) => {
      value.headers['content-length'] = '0';
      value.rawHeaders[value.rawHeaders.indexOf('Content-Length') + 1] = '0';
    }],
    ['oversized content length', (value) => {
      value.headers['content-length'] = '1048577';
      value.rawHeaders[value.rawHeaders.indexOf('Content-Length') + 1] = '1048577';
    }],
    ['wrong content type', (value) => {
      value.headers['content-type'] = 'text/plain';
      value.rawHeaders[value.rawHeaders.indexOf('Content-Type') + 1] = 'text/plain';
    }],
    ['conflicting content type', (value) => {
      value.headers['content-type'] = 'application/json, text/plain';
      value.rawHeaders[value.rawHeaders.indexOf('Content-Type') + 1] = value.headers['content-type'];
    }],
    ['duplicate content type', (value) => { value.rawHeaders.push('Content-Type', 'application/json'); }],
    ['transfer encoding conflict', (value) => {
      value.headers['transfer-encoding'] = 'chunked';
      value.rawHeaders.push('Transfer-Encoding', 'chunked');
    }],
    ['unsupported content encoding', (value) => {
      value.headers['content-encoding'] = 'gzip';
      value.rawHeaders.push('Content-Encoding', 'gzip');
    }],
    ['duplicate content encoding', (value) => {
      value.headers['content-encoding'] = 'zstd';
      value.rawHeaders.push('Content-Encoding', 'zstd', 'Content-Encoding', 'zstd');
    }],
    ['expect continuation', (value) => {
      value.headers.expect = '100-continue';
      value.rawHeaders.push('Expect', '100-continue');
    }],
    ['proxy authorization', (value) => {
      value.headers['proxy-authorization'] = 'Basic hidden';
      value.rawHeaders.push('Proxy-Authorization', 'Basic hidden');
    }],
    ['header count', (value) => {
      for (let index = 0; index < 29; index += 1) value.rawHeaders.push(`X-RC5-${index}`, 'value');
    }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = acceptedSimulatorRequest();
    mutate(changed);
    assert.throws(() => validateSimulatorFraming(changed), /invalid simulator/u, label);
  }
});

test('simulator payload rejects role, order, count, budget, tools, encryption, and hidden-field mutations', () => {
  assert.equal(validateSimulatorPayload(acceptedSimulatorPayload()), true);
  const mutations = [
    ['role', (value) => { value.input[0].role = 'user'; }],
    ['order', (value) => { [value.input[3], value.input[4]] = [value.input[4], value.input[3]]; }],
    ['omitted input', (value) => { value.input.pop(); }],
    ['inserted input', (value) => { value.input.push(structuredClone(value.input[0])); }],
    ['maximum tokens', (value) => { value.max_output_tokens = 4_001; }],
    ['tools field', (value) => { value.tools = []; }],
    ['tool choice', (value) => { value.tool_choice = 'auto'; }],
    ['parallel tools', (value) => { value.parallel_tool_calls = true; }],
    ['reasoning encryption include', (value) => { value.include = []; }],
    ['hidden instructions', (value) => { value.instructions = 'hidden'; }],
    ['hidden item field', (value) => { value.input[0].name = 'hidden'; }],
    ['hidden content field', (value) => { value.input[0].content[0].encrypted_content = 'hidden'; }],
    ['content type', (value) => { value.input[0].content[0].type = 'output_text'; }],
    ['empty content', (value) => { value.input[0].content[0].text = ''; }],
    ['model', (value) => { value.model = 'changed'; }],
    ['session identity', (value) => { value.prompt_cache_key = 'rc5-unknown'; }],
    ['reasoning field', (value) => { value.reasoning.hidden = true; }],
    ['text field', (value) => { value.text.hidden = true; }],
  ];
  for (const [label, mutate] of mutations) {
    const changed = acceptedSimulatorPayload();
    mutate(changed);
    assert.throws(() => validateSimulatorPayload(changed), /unexpected simulator/u, label);
  }
});

test('simulator body decoder rejects malformed, oversized, conflicting, and decompression-bomb inputs', () => {
  const payload = acceptedSimulatorPayload();
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const decoded = decodeSimulatorBody(bytes, { contentEncoding: undefined, length: bytes.length });
  assert.deepEqual(decoded.payload, payload);
  assert.equal(decoded.canonicalBytes.toString('utf8'), `${canonicalSimulatorJson(payload)}\n`);

  const compressed = zstdCompressSync(bytes);
  const compressedDecoded = decodeSimulatorBody(compressed, { contentEncoding: 'zstd', length: compressed.length });
  assert.deepEqual(compressedDecoded.payload, payload);
  assert.equal(compressedDecoded.canonicalBytes.toString('utf8'), `${canonicalSimulatorJson(payload)}\n`);

  const rejected = [
    [Buffer.from('{', 'utf8'), { contentEncoding: undefined, length: 1 }],
    [Buffer.alloc(0), { contentEncoding: undefined, length: 0 }],
    [bytes, { contentEncoding: undefined, length: bytes.length + 1 }],
    [bytes, { contentEncoding: 'gzip', length: bytes.length }],
    [bytes, { contentEncoding: undefined, length: bytes.length, hidden: true }],
    [Buffer.alloc(1_048_577), { contentEncoding: undefined, length: 1_048_577 }],
    [Buffer.from('not-zstd', 'utf8'), { contentEncoding: 'zstd', length: 8 }],
  ];
  for (const [body, framing] of rejected) {
    assert.throws(() => decodeSimulatorBody(body, framing), /simulator/u);
  }

  const decompressionBomb = zstdCompressSync(Buffer.alloc(1_048_577, 0x20));
  assert.ok(decompressionBomb.length < 1_048_576);
  assert.throws(
    () => decodeSimulatorBody(decompressionBomb, { contentEncoding: 'zstd', length: decompressionBomb.length }),
    /simulator compressed body rejected/u,
  );
});

test('simulator projections and persisted observation bytes contain header names but never raw header values', () => {
  const request = acceptedSimulatorRequest();
  const framing = validateSimulatorFraming(request);
  const headerNames = simulatorHeaderNames(request);
  const observation = baseSimulatorObservation('success', 1, headerNames);
  const projected = JSON.stringify({ framing, headerNames });
  const persistedBytes = `${canonicalSimulatorJson(observation)}\n`;
  assert.deepEqual(headerNames, ['authorization', 'content-length', 'content-type', 'host']);
  assert.deepEqual(Object.keys(framing), ['contentEncoding', 'length']);
  for (const secretValue of [SIMULATOR_AUTHORIZATION, 'RC5_RAW_AUTH_SENTINEL_A7Q2', 'application/json', 'chatgpt.com']) {
    assert.equal(projected.includes(secretValue), false);
    assert.equal(persistedBytes.includes(secretValue), false);
  }
  assert.match(persistedBytes, /"header_names":\["authorization","content-length","content-type","host"\]/u);
});

test('shared deadline bounds every post-dispatch operation and closes at expiry', () => {
  const startedAt = 1_000;
  const hardDeadline = startedAt + MAX_TIMEOUT_MS;
  const executionDeadline = executionCutoffDeadline(hardDeadline);
  assert.equal(executionDeadline, hardDeadline - CLEANUP_HEADROOM_MS);
  assert.equal(executionCutoffDeadline(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY);
  assert.equal(executionCutoffDeadline(Number.NaN), 0);
  assert.equal(deadlineRemainingMs(hardDeadline, startedAt), MAX_TIMEOUT_MS);
  assert.equal(deadlineRemainingMs(hardDeadline, startedAt + 0.9), MAX_TIMEOUT_MS - 1);
  assert.equal(deadlineRemainingMs(executionDeadline, executionDeadline), 0);
  assert.equal(deadlineRemainingMs(executionDeadline, executionDeadline + 1), 0);
  assert.equal(deadlineRemainingMs(hardDeadline, executionDeadline), CLEANUP_HEADROOM_MS);
  assert.equal(deadlineRemainingMs(Number.POSITIVE_INFINITY, hardDeadline), Number.POSITIVE_INFINITY);

  const workerTimeout = deadlineRemainingMs(executionDeadline, startedAt) - WORKER_EXIT_GRACE_MS;
  assert.equal(workerTimeout, 475_000);
  assert.equal(boundedDeadlineTimeout(executionDeadline, 30_000, executionDeadline - 45_000), 30_000);
  assert.equal(boundedDeadlineTimeout(executionDeadline, 30_000, executionDeadline - 1_500), 1_500);
  assert.equal(boundedDeadlineTimeout(executionDeadline, 30_000, executionDeadline), 0);
  assert.equal(boundedDeadlineTimeout(executionDeadline, 30_000, executionDeadline + 1), 0);
  assert.equal(boundedDeadlineTimeout(hardDeadline, 30_000, executionDeadline), 30_000);
  assert.equal(boundedDeadlineTimeout(Number.POSITIVE_INFINITY, 30_000, hardDeadline), 30_000);
  assert.equal(boundedDeadlineTimeout(executionDeadline, 0, startedAt), 0);
});

function absentDockerResult(kind, name) {
  const stderr = kind === 'container'
    ? `Error response from daemon: No such container: ${name}`
    : kind === 'network'
      ? `Error response from daemon: network ${name} not found`
      : `Error response from daemon: get ${name}: no such volume`;
  return { error: undefined, signal: null, status: 1, stderr, stdout: '[]' };
}

function cleanupRunner(options = {}) {
  const calls = [];
  const run = (_executable, args, timeoutMs, deadlineMs) => {
    calls.push({ args: [...args], deadlineMs, timeoutMs });
    if (args[1] !== 'inspect') return { error: undefined, signal: null, status: 0, stderr: '', stdout: '' };
    const kind = args[0];
    const name = args[2];
    if (options.presentName === name) return { error: undefined, signal: null, status: 0, stderr: '', stdout: '[{}]' };
    return absentDockerResult(kind, name);
  };
  return { calls, run };
}

test('cleanup headroom reconciles both partial creation and post-run failure states', () => {
  const hardDeadline = Date.now() + CLEANUP_HEADROOM_MS;
  for (const [label, configure] of [
    ['partial authority creation', (resources) => {
      resources.creation.socket = 'created';
      resources.creation.network = 'creating';
      resources.creation.state = 'creating';
    }],
    ['post-run authority', (resources) => {
      for (const key of ['network', 'proxy', 'relay', 'simulator', 'socket', 'worker']) resources.creation[key] = 'ready';
      resources.creation.state = 'authority_ready';
      resources.relayId = 'sha256:rc5-relay';
    }],
  ]) {
    const resources = allocateAuthorityResources(label === 'partial authority creation' ? '0011223344556677' : '8899aabbccddeeff');
    configure(resources);
    const fake = cleanupRunner();
    assert.deepEqual(cleanupAuthority('docker.exe', resources, hardDeadline, fake.run), {
      cleaned: true,
      inspection_error_count: 0,
    }, label);
    assert.equal(authorityCreationReconciled(resources), true, label);
    assert.equal(fake.calls.length, 12, label);
    assert.ok(fake.calls.every((call) => call.deadlineMs === hardDeadline && call.timeoutMs >= 1 && call.timeoutMs <= 5_000), label);
  }

  const stranded = allocateAuthorityResources('fedcba9876543210');
  stranded.creation.worker = 'ready';
  stranded.creation.state = 'authority_ready';
  const fake = cleanupRunner({ presentName: stranded.names.worker });
  assert.deepEqual(cleanupAuthority('docker.exe', stranded, hardDeadline, fake.run), {
    cleaned: false,
    inspection_error_count: 1,
  });
  assert.equal(authorityCreationReconciled(stranded), false);
  assert.equal(containmentMayRelease({ cleaned: false, inspection_error_count: 1 }, stranded), false);
});

test('preallocated authority descriptor cannot be reported clean before creation is reconciled absent', () => {
  const resources = allocateAuthorityResources('0123456789abcdef');
  assert.equal(Object.isSealed(resources), true);
  assert.equal(Object.isFrozen(resources.names), true);
  assert.deepEqual(resources.names, {
    network: 'rc5-exec-net-0123456789abcdef',
    proxy: 'rc5-exec-proxy-0123456789abcdef',
    relay: 'rc5-exec-relay-0123456789abcdef',
    simulator: 'rc5-exec-simulator-0123456789abcdef',
    socket: 'rc5-exec-socket-0123456789abcdef',
    worker: 'rc5-exec-worker-0123456789abcdef',
  });
  assert.deepEqual(resources.creation, {
    network: 'pending',
    proxy: 'pending',
    relay: 'pending',
    simulator: 'pending',
    socket: 'pending',
    state: 'descriptor_published',
    worker: 'pending',
  });
  assert.equal(authorityCreationReconciled(resources), false);
  assert.equal(containmentMayRelease({ cleaned: true, inspection_error_count: 0 }, resources), false);

  for (const key of ['network', 'proxy', 'relay', 'simulator', 'socket', 'worker']) resources.creation[key] = 'absent';
  assert.equal(authorityCreationReconciled(resources), false);
  resources.creation.state = 'reconciled_absent';
  resources.relayId = 'sha256:still-present';
  assert.equal(authorityCreationReconciled(resources), false);
  resources.relayId = null;
  assert.equal(authorityCreationReconciled(resources), true);
});

test('signal containment releases only after strict cleanup and reconciled authority absence', () => {
  const resources = allocateAuthorityResources('fedcba9876543210');
  for (const cleanupObservation of [
    undefined,
    { cleaned: false, inspection_error_count: 0 },
    { cleaned: true, inspection_error_count: 0 },
  ]) {
    assert.equal(containmentMayRelease(cleanupObservation, resources), false);
  }

  for (const key of ['network', 'proxy', 'relay', 'simulator', 'socket', 'worker']) resources.creation[key] = 'absent';
  resources.creation.state = 'reconciled_absent';
  assert.equal(containmentMayRelease({ cleaned: false, inspection_error_count: 0 }, resources), false);
  assert.equal(containmentMayRelease({ cleaned: true, inspection_error_count: 0 }, resources), true);
});

test('production signal containment stays persistent through the verified-cleanup release gate', () => {
  const source = readFileSync(new URL('../../lib/recursus/rc5-provider-executor.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.on\('SIGINT', containSigint\);/u);
  assert.match(source, /process\.on\('SIGTERM', containSigterm\);/u);
  assert.doesNotMatch(source, /process\.once\('SIG(?:INT|TERM)'/u);
  const releaseDecision = source.indexOf('cleaned = containmentMayRelease(observation, describedResources);');
  const removeSigint = source.indexOf("process.removeListener('SIGINT', containSigint);", releaseDecision);
  const removeSigterm = source.indexOf("process.removeListener('SIGTERM', containSigterm);", releaseDecision);
  assert.ok(releaseDecision >= 0);
  assert.ok(removeSigint > releaseDecision);
  assert.ok(removeSigterm > releaseDecision);
});

test('production result evidence is collected before cleanup and reconciled only afterward', () => {
  const source = readFileSync(new URL('../../lib/recursus/rc5-provider-executor.mjs', import.meta.url), 'utf8');
  const collectEvidence = source.indexOf('const resultEvidence = collectResultEvidence(');
  const cleanupAuthority = source.indexOf('const cleanupObservation = cleanup();', collectEvidence);
  const reconcileEvidence = source.indexOf('const normalized = reconcileResultEvidence(', cleanupAuthority);
  assert.ok(collectEvidence >= 0);
  assert.ok(cleanupAuthority > collectEvidence);
  assert.ok(reconcileEvidence > cleanupAuthority);
  assert.equal(source.includes('function collectResult('), false);
});

test('provider-free simulator authority requires an exact DNS alias', () => {
  const source = readFileSync(new URL('../../lib/recursus/rc5-provider-executor.mjs', import.meta.url), 'utf8');
  assert.match(source, /Aliases\.some\(\(alias\) => alias === 'chatgpt\.com'\)/u);
  assert.doesNotMatch(source, /Aliases\?\.includes\('chatgpt\.com'\)/u);
});

test('worker timeout accepts cleanup headroom and rejects limits above registered authority', () => {
  const { validateWorkerTimeout } = RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS;
  assert.equal(validateWorkerTimeout(535_000, MAX_TIMEOUT_MS), true);
  assert.equal(validateWorkerTimeout(1_000, MAX_TIMEOUT_MS), true);
  assert.throws(() => validateWorkerTimeout(MAX_TIMEOUT_MS + 1, MAX_TIMEOUT_MS), { code: 'WORKER_INPUT' });
  assert.throws(() => validateWorkerTimeout(535_001, 535_000), { code: 'WORKER_INPUT' });
  assert.throws(() => validateWorkerTimeout(999, MAX_TIMEOUT_MS), { code: 'WORKER_INPUT' });
});
