import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { canonicalJsonV1 } from './prompt-context-v1.mjs';
import { RC5_PROVIDER_AUTHORITY, RC5SliceError } from './rc5-slice.mjs';

export const RC5_EXECUTOR_IMAGE = 'recursus-rc5-bounded-executor:2fc0209';
export const RC5_EXECUTOR_IMAGE_ID = 'sha256:9b9c9e77482ce9e474f3dcd18301d16efbf279cb2918ddeb5a794ad6d960c887';
export const RC5_EXECUTOR_PARENT_IMAGE_ID = 'sha256:11f4d4b9777b13ec29430bd682e0cb6b46f715e3ead28736c87a94f89f89aa01';
export const RC5_PROVIDER_WORKER_SOURCE = Object.freeze({
  byte_count: 42_010,
  path: '/opt/rc5/rc5-provider-worker.mjs',
  sha256: 'c3b4fe03457438a337c5a818f73a066d0c5b7b21cb3e67b6180a7515d3c634e7',
});
export const RC5_PROXY_SOURCE = Object.freeze({
  byte_count: 9_399,
  path: '/opt/rc5/rc5-route-proxy.mjs',
  sha256: '0f4348017e62663a69f388a6b3862e64ce3c9a8dc236f221a56684029f8be470',
});

const DOCKER_CONTEXT = 'desktop-linux';
const DOCKER_CLI_BYTE_COUNT = 42_748_848;
const DOCKER_CLI_SHA256 = '7bc66b018b9da43fea986f893288bb93970d3d1217f5063201fd97c827f20732';
const MAX_DOCKER_OUTPUT = 2 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 65_536;
const MAX_RESULT_BYTES = 16 * 1024;
const MAX_TRACE_BYTES = 128 * 1024;
const MAX_TIMEOUT_MS = 600_000;
const CLEANUP_HEADROOM_MS = 120_000;
const WORKER_EXIT_GRACE_MS = 5_000;
const RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const ROLE_SEQUENCE = Object.freeze(['system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system']);
const CONTRACT_LABEL = 'org.opencnid.rc5.contract';
const CONTRACT_ID = 'rc5-bounded-provider-executor-v1';
const WORKER_HASH_LABEL = 'io.opencnid.recursus.rc5-provider-worker.sha256';
const WORKER_BYTES_LABEL = 'io.opencnid.recursus.rc5-provider-worker.byte-count';
const WORKER_PATH_LABEL = 'io.opencnid.recursus.rc5-provider-worker.path';
const PROXY_HASH_LABEL = 'io.opencnid.recursus.rc5-proxy.sha256';
const PROXY_BYTES_LABEL = 'io.opencnid.recursus.rc5-proxy.byte-count';
const PROXY_PATH_LABEL = 'io.opencnid.recursus.rc5-proxy.path';
const IMAGE_PARENT_LABEL = 'io.opencnid.recursus.parent-image';

const WORKER_SCRIPT = '/opt/rc5/rc5-provider-worker.mjs';
const CONTENT_GATE_SCRIPT = '/opt/rc3/recursus-route-content-gate-v17.mjs';
const HTML_ENTITIES_SCRIPT = '/opt/rc3/recursus-route-html-entities-v17.mjs';
const PROXY_SCRIPT = '/opt/rc5/rc5-route-proxy.mjs';
const RELAY_SCRIPT = '/opt/rc3/recursus-route-relay-v17.mjs';
const SOCKET_INIT_SCRIPT = '/opt/rc3/recursus-route-socket-init-v17.mjs';
const CREDENTIAL_PERMISSION_SCRIPT = '/opt/rc3/recursus-route-credential-permission-v17.mjs';
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const CREDENTIAL_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{10,}|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{8,}|\b(?:OPENAI_CODEX_OAUTH|API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PRIVATE[_-]?KEY)\b\s*[:=]\s*\S+)/iu;

function reject(code, message, exitCode = 1) {
  throw new RC5SliceError(code, message, exitCode);
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function portablePath(value) {
  const normalized = String(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function overlaps(left, right) {
  const value = relative(resolve(left), resolve(right));
  return value === '' || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function absoluteNativePath(value, label, kind = 'directory') {
  if (typeof value !== 'string' || !isAbsolute(value)) reject('RC5_EXECUTOR_PATH', `${label} must be an explicit absolute path.`, 2);
  const target = resolve(value);
  if (target.includes(',') || /^(?:\\\\|\\[.?]\\)/u.test(target)) reject('RC5_EXECUTOR_PATH', `${label} may not be a UNC, device, or comma-bearing path.`, 2);
  if (!existsSync(target)) reject('RC5_EXECUTOR_PATH', `${label} is unavailable.`, 2);
  const info = lstatSync(target);
  const expectedKind = kind === 'file' ? info.isFile() : info.isDirectory();
  if (!expectedKind || info.isSymbolicLink() || portablePath(realpathSync.native(target)) !== portablePath(target)) {
    reject('RC5_EXECUTOR_PATH', `${label} must be a resolved native ${kind}.`, 2);
  }
  return target;
}

function assertDisjointRoots(runtimeRoot, credentialHome) {
  for (const [left, right] of [[REPOSITORY_ROOT, runtimeRoot], [REPOSITORY_ROOT, credentialHome], [runtimeRoot, credentialHome]]) {
    if (overlaps(left, right) || overlaps(right, left)) reject('RC5_EXECUTOR_ROOT_OVERLAP', 'Repository, runtime, and credential roots must be disjoint.', 2);
  }
}

function validateStateRoot(value, runtimeRoot, credentialHome) {
  const stateRoot = absoluteNativePath(value, 'slice state root');
  const expectedRuntimeParent = join(stateRoot, 'runtime');
  if (portablePath(resolve(runtimeRoot, '..')) !== portablePath(expectedRuntimeParent) ||
      overlaps(REPOSITORY_ROOT, stateRoot) || overlaps(stateRoot, REPOSITORY_ROOT) ||
      overlaps(stateRoot, credentialHome) || overlaps(credentialHome, stateRoot)) {
    reject('RC5_EXECUTOR_ROOT_OVERLAP', 'The slice state, runtime, repository, and credential roots differ from the bounded layout.', 2);
  }
  return stateRoot;
}

function ensureEmptyRuntimeRoot(value) {
  const root = absoluteNativePath(value, 'runtime root');
  if (readdirSync(root).length !== 0) reject('RC5_EXECUTOR_ROOT_NOT_EMPTY', 'Runtime root must already exist and be empty.', 2);
  return root;
}

function ensureClosedCredentialHome(value) {
  const root = absoluteNativePath(value, 'credential home');
  const entries = readdirSync(root).sort();
  if (JSON.stringify(entries) !== JSON.stringify(['.credentials.yaml'])) {
    reject('RC5_CREDENTIAL_BOUNDARY', 'Credential home must contain only .credentials.yaml.', 2);
  }
  const credential = join(root, '.credentials.yaml');
  const info = lstatSync(credential);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || portablePath(realpathSync.native(credential)) !== portablePath(credential)) {
    reject('RC5_CREDENTIAL_BOUNDARY', 'Credential document must be a resolved single-link native file.', 2);
  }
  // Deliberately do not open or read the credential document on the host.
  return root;
}

function dockerEnvironment() {
  return Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'PATH', 'ProgramData', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR']
    .filter((key) => typeof process.env[key] === 'string')
    .map((key) => [key, process.env[key]]));
}

function deadlineRemainingMs(deadlineMs, nowMs = Date.now()) {
  if (deadlineMs === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.floor(deadlineMs - nowMs));
}

function boundedDeadlineTimeout(deadlineMs, requestedMs, nowMs = Date.now()) {
  if (!Number.isInteger(requestedMs) || requestedMs < 1) return 0;
  const remaining = deadlineRemainingMs(deadlineMs, nowMs);
  return remaining === Number.POSITIVE_INFINITY ? requestedMs : Math.min(requestedMs, remaining);
}

function assertBeforeDeadline(deadlineMs, label) {
  if (deadlineRemainingMs(deadlineMs) < 1) reject('RC5_WORKER_TIMEOUT', `${label} reached the hard case deadline.`, 2);
}

function dockerResult(executable, args, options = {}) {
  const timeoutMs = boundedDeadlineTimeout(options.deadlineMs ?? Number.POSITIVE_INFINITY, options.timeoutMs ?? 30_000);
  if (timeoutMs < 1) reject('RC5_WORKER_TIMEOUT', 'A Docker operation was blocked at the hard case deadline.', 2);
  return spawnSync(executable, ['--context', DOCKER_CONTEXT, ...args], {
    encoding: 'utf8',
    env: dockerEnvironment(),
    maxBuffer: MAX_DOCKER_OUTPUT,
    shell: false,
    timeout: timeoutMs,
    windowsHide: true,
  });
}

function docker(executable, args, options = {}) {
  const result = dockerResult(executable, args, options);
  if (result.error || result.status !== 0 || result.signal !== null) {
    reject(options.code ?? 'RC5_DOCKER_COMMAND', options.message ?? 'The bounded Docker operation failed without exposing provider content.', 2);
  }
  if (options.deadlineMs !== undefined) assertBeforeDeadline(options.deadlineMs, 'Docker operation');
  return result.stdout.trim();
}

function dockerBestEffort(executable, args, timeoutMs = 15_000, deadlineMs = Number.POSITIVE_INFINITY) {
  const bounded = boundedDeadlineTimeout(deadlineMs, timeoutMs);
  if (bounded < 1) return Object.freeze({ error: new Error('deadline elapsed'), signal: null, status: null, stderr: '', stdout: '' });
  return dockerResult(executable, args, { timeoutMs: bounded });
}

function parseJson(text, code, label) {
  try {
    return JSON.parse(text);
  } catch {
    reject(code, `${label} did not return valid JSON.`, 2);
  }
}

function dockerJson(executable, args, code, label, options = {}) {
  return parseJson(docker(executable, args, { ...options, code }), code, label);
}

function verifyDockerHost(executable) {
  const bytes = readFileSync(executable);
  if (bytes.length !== DOCKER_CLI_BYTE_COUNT || hash(bytes) !== DOCKER_CLI_SHA256) {
    reject('RC5_DOCKER_IDENTITY', 'Docker CLI differs from the accepted V17 host lock.', 2);
  }
  const context = dockerJson(executable, ['context', 'inspect', DOCKER_CONTEXT, '--format', '{{json .}}'], 'RC5_DOCKER_IDENTITY', 'Docker context inspection');
  if (context?.Name !== DOCKER_CONTEXT || context?.Metadata?.Description !== 'Docker Desktop' ||
      context?.Endpoints?.docker?.Host !== 'npipe:////./pipe/dockerDesktopLinuxEngine' ||
      context?.Endpoints?.docker?.SkipTLSVerify !== false || Object.keys(context?.TLSMaterial ?? {}).length !== 0) {
    reject('RC5_DOCKER_IDENTITY', 'Docker context differs from the accepted Docker Desktop context.', 2);
  }
  const version = dockerJson(executable, ['version', '--format', '{{json .}}'], 'RC5_DOCKER_IDENTITY', 'Docker version inspection');
  if (version.Client?.Version !== '29.5.3' || version.Client?.Os !== 'windows' || version.Client?.Arch !== 'amd64' ||
      version.Client?.Context !== DOCKER_CONTEXT || version.Server?.Version !== '29.5.3' || version.Server?.Os !== 'linux' ||
      version.Server?.Arch !== 'amd64' || version.Server?.Platform?.Name !== 'Docker Desktop 4.79.0 (230596)') {
    reject('RC5_DOCKER_IDENTITY', 'Docker client or local daemon differs from the accepted host lock.', 2);
  }
}

function imageSourceProbe(executable) {
  const source = "const{createHash}=require('node:crypto');const{readFileSync}=require('node:fs');const sources=process.argv.slice(1).map(p=>{const b=readFileSync(p);return{byte_count:b.length,path:p,sha256:createHash('sha256').update(b).digest('hex')}});process.stdout.write(JSON.stringify(sources));";
  return parseJson(docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--user=65532:65532', '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID,
    '--permission', `--allow-fs-read=${WORKER_SCRIPT}`, `--allow-fs-read=${PROXY_SCRIPT}`, '--eval', source, WORKER_SCRIPT, PROXY_SCRIPT,
  ], { code: 'RC5_IMAGE_IDENTITY' }), 'RC5_IMAGE_IDENTITY', 'Worker source inspection');
}

function verifyImage(executable) {
  const images = dockerJson(executable, ['image', 'inspect', RC5_EXECUTOR_IMAGE], 'RC5_IMAGE_IDENTITY', 'Executor image inspection');
  if (!Array.isArray(images) || images.length !== 1) reject('RC5_IMAGE_IDENTITY', 'Executor image inspection was ambiguous.', 2);
  const image = images[0];
  const labels = image.Config?.Labels ?? {};
  if (image.Id !== RC5_EXECUTOR_IMAGE_ID || image.Os !== 'linux' || image.Architecture !== 'amd64' ||
      image.Config?.User !== '65532:65532' || JSON.stringify(image.Config?.Entrypoint) !== JSON.stringify(['/usr/local/bin/node']) ||
      labels[IMAGE_PARENT_LABEL] !== RC5_EXECUTOR_PARENT_IMAGE_ID || labels[WORKER_PATH_LABEL] !== WORKER_SCRIPT ||
      labels[WORKER_HASH_LABEL] !== RC5_PROVIDER_WORKER_SOURCE.sha256 || labels[WORKER_BYTES_LABEL] !== String(RC5_PROVIDER_WORKER_SOURCE.byte_count) ||
      labels[PROXY_PATH_LABEL] !== PROXY_SCRIPT || labels[PROXY_HASH_LABEL] !== RC5_PROXY_SOURCE.sha256 ||
      labels[PROXY_BYTES_LABEL] !== String(RC5_PROXY_SOURCE.byte_count)) {
    reject('RC5_IMAGE_IDENTITY', 'Executor image differs from the pinned materialization.', 2);
  }
  const observedSource = imageSourceProbe(executable);
  if (canonicalJsonV1(observedSource) !== canonicalJsonV1([RC5_PROVIDER_WORKER_SOURCE, RC5_PROXY_SOURCE])) {
    reject('RC5_IMAGE_IDENTITY', 'Executor worker or proxy source differs from the pinned source identity.', 2);
  }
  return Object.freeze({ id: image.Id, reference: RC5_EXECUTOR_IMAGE, worker_source: RC5_PROVIDER_WORKER_SOURCE });
}

function mount(source, target, readOnly = false, type = 'bind') {
  return ['--mount', `type=${type},source=${source},target=${target}${readOnly ? ',readonly' : ''}`];
}

function commonContainerArgs(name, networkMode, logDriver = 'none') {
  const args = [
    'create', '--name', name, '--pull=never', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=128', '--memory=1024m', '--cpus=2', '--ulimit=nofile=256:256', '--ipc=none',
    '--user=65532:65532', '--network', networkMode,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=65532,gid=65532,mode=0700',
    '--label', `${CONTRACT_LABEL}=${CONTRACT_ID}`,
  ];
  if (logDriver === 'none') args.push('--log-driver=none');
  else args.push('--log-driver=local', '--log-opt=max-size=1m', '--log-opt=max-file=1', '--log-opt=compress=false');
  return args;
}

function inspectContainer(executable, name, deadlineMs = Number.POSITIVE_INFINITY) {
  const values = dockerJson(executable, ['inspect', name], 'RC5_CONTAINER_INSPECTION', 'Container inspection', { deadlineMs, timeoutMs: 5_000 });
  if (!Array.isArray(values) || values.length !== 1) reject('RC5_CONTAINER_INSPECTION', 'Container inspection was ambiguous.', 2);
  return values[0];
}

function verifyBaseAuthority(inspect, expectedNetwork, expectedCommand, expectedLogConfig) {
  const observedNetworks = Object.keys(inspect.NetworkSettings?.Networks ?? {}).sort();
  const expectedNetworks = expectedNetwork.startsWith('container:') ? [] : [expectedNetwork];
  if (inspect.Config?.Image !== RC5_EXECUTOR_IMAGE_ID || inspect.Image !== RC5_EXECUTOR_IMAGE_ID || inspect.Config?.User !== '65532:65532' ||
      inspect.Config?.Labels?.[CONTRACT_LABEL] !== CONTRACT_ID || inspect.HostConfig?.ReadonlyRootfs !== true ||
      inspect.HostConfig?.Privileged !== false || inspect.HostConfig?.CapAdd !== null ||
      JSON.stringify(inspect.HostConfig?.CapDrop) !== JSON.stringify(['ALL']) || inspect.HostConfig?.Binds !== null ||
      JSON.stringify(inspect.HostConfig?.Devices) !== JSON.stringify([]) || inspect.HostConfig?.DeviceRequests !== null ||
      inspect.HostConfig?.VolumesFrom !== null || inspect.HostConfig?.Runtime !== 'runc' || inspect.HostConfig?.PidMode !== '' ||
      inspect.HostConfig?.UTSMode !== '' || inspect.HostConfig?.UsernsMode !== '' || inspect.HostConfig?.CgroupnsMode !== 'private' ||
      JSON.stringify(inspect.HostConfig?.RestartPolicy) !== JSON.stringify({ Name: 'no', MaximumRetryCount: 0 }) ||
      JSON.stringify(inspect.HostConfig?.Ulimits) !== JSON.stringify([{ Name: 'nofile', Hard: 256, Soft: 256 }]) ||
      JSON.stringify(inspect.HostConfig?.LogConfig) !== JSON.stringify(expectedLogConfig) ||
      JSON.stringify(inspect.HostConfig?.SecurityOpt) !== JSON.stringify(['no-new-privileges']) ||
      inspect.HostConfig?.PidsLimit !== 128 || inspect.HostConfig?.IpcMode !== 'none' ||
      inspect.HostConfig?.Memory !== 1_073_741_824 || inspect.HostConfig?.NanoCpus !== 2_000_000_000 ||
      inspect.HostConfig?.Tmpfs?.['/tmp'] !== 'rw,noexec,nosuid,nodev,size=16777216,uid=65532,gid=65532,mode=0700' ||
      inspect.HostConfig?.NetworkMode !== expectedNetwork || JSON.stringify(observedNetworks) !== JSON.stringify(expectedNetworks) ||
      JSON.stringify(inspect.Config?.Cmd) !== JSON.stringify(expectedCommand) || inspect.Config?.ExposedPorts != null) {
    reject('RC5_RUNTIME_AUTHORITY', 'A container differs from the bounded authority profile.', 2);
  }
}

function exactMounts(inspect, expected) {
  const normalized = (source) => portablePath(source);
  const observed = (inspect.HostConfig?.Mounts ?? []).map((item) => ({
    destination: item.Target,
    mode: item.ReadOnly ? 'ro' : 'rw',
    source: item.Source,
    type: item.Type,
  })).sort((left, right) => left.destination.localeCompare(right.destination));
  const wanted = [...expected].sort((left, right) => left.destination.localeCompare(right.destination));
  if (observed.length !== wanted.length) reject('RC5_RUNTIME_AUTHORITY', 'Container mount count differs from the bounded profile.', 2);
  for (let index = 0; index < wanted.length; index += 1) {
    const left = observed[index];
    const right = wanted[index];
    const sourceMatches = right.type === 'bind' ? normalized(left.source) === normalized(right.source) : left.source === right.source;
    if (left.destination !== right.destination || left.mode !== right.mode || left.type !== right.type || !sourceMatches) {
      reject('RC5_RUNTIME_AUTHORITY', 'Container mount set differs from the bounded profile.', 2);
    }
  }
}

function waitForLog(executable, name, type, deadlineMs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assertBeforeDeadline(deadlineMs, 'Container readiness');
    const output = docker(executable, ['logs', name], { code: 'RC5_CONTAINER_READINESS', deadlineMs, timeoutMs: 5_000 });
    if (output.split(/\r?\n/u).some((line) => line.includes(`\"type\":\"${type}\"`))) return;
    const pauseMs = Math.min(100, deadlineRemainingMs(deadlineMs));
    if (pauseMs < 1) reject('RC5_WORKER_TIMEOUT', 'Container readiness reached the hard case deadline.', 2);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pauseMs);
  }
  reject('RC5_CONTAINER_READINESS', 'An authority container did not become ready.', 2);
}

function secureCredential(executable, credentialHome) {
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--cap-add=CHOWN', '--cap-add=FOWNER',
    '--security-opt=no-new-privileges', '--user=0:0', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,mode=0700',
    ...mount(credentialHome, '/credentials'), '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, '--permission',
    `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials', '--allow-fs-write=/credentials',
    CREDENTIAL_PERMISSION_SCRIPT, 'initialize',
  ], { code: 'RC5_CREDENTIAL_PERMISSION' });
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user=65532:65532', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
    ...mount(credentialHome, '/credentials'), '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, '--permission',
    `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials', '--allow-fs-write=/credentials',
    CREDENTIAL_PERMISSION_SCRIPT, 'probe',
  ], { code: 'RC5_CREDENTIAL_PERMISSION' });
}

function verifyCredentialProtection(executable, credentialHome, deadlineMs = Number.POSITIVE_INFINITY) {
  try {
    docker(executable, [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--user=65532:65532', '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
      ...mount(credentialHome, '/credentials', true), '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, '--permission',
      `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials', CREDENTIAL_PERMISSION_SCRIPT, 'verify',
    ], { code: 'RC5_CREDENTIAL_PERMISSION', deadlineMs, timeoutMs: 10_000 });
    return true;
  } catch (error) {
    if (error instanceof RC5SliceError && error.code === 'RC5_WORKER_TIMEOUT') throw error;
    return false;
  }
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) reject('RC5_EXECUTOR_REQUEST', 'Ordered-parts request is invalid.', 2);
  const options = request.dsh_generate_options;
  const execution = request.execution;
  const roles = options?.messages?.map((message) => message.role).join(',');
  if (request.interface?.required_transport_capability !== 'ordered_system_user_messages_v1' ||
      request.interface?.wire_contract !== 'recursus-dsh-ordered-parts-v1' || options?.provider !== 'openai-codex' ||
      options?.model !== 'gpt-5.6-sol' || options?.reasoningEffort !== 'xhigh' || options?.maxTokens !== 4_000 ||
      !Array.isArray(options?.tools) || options.tools.length !== 0 || !Array.isArray(options?.messages) || options.messages.length !== 9 ||
      roles !== 'system,system,system,system,user,user,user,user,system' ||
      options.messages.some((message, ordinal) => message.ordinal !== ordinal || !Array.isArray(message.content) ||
        message.content.length !== 1 || message.content[0]?.type !== 'text' || typeof message.content[0]?.text !== 'string' ||
        message.content[0].text.length === 0) ||
      execution?.automatic_retries !== 0 || execution?.external_mutation !== false || execution?.max_concurrency !== 1 ||
      execution?.max_output_tokens !== 4_000 || execution?.max_provider_calls !== 1 || execution?.timeout_ms !== MAX_TIMEOUT_MS ||
      !/^[a-f0-9]{64}$/u.test(request.request_digest?.value ?? '') || !/^(?:FACT-01|FACT-03|SAFE-01)$/u.test(request.scenario_id ?? '')) {
    reject('RC5_EXECUTOR_REQUEST', 'Ordered-parts request exceeds or differs from the bounded RC-5 contract.', 2);
  }
  return request;
}

function validateReservationBinding(reservation, request, runtimeId) {
  const keys = [
    'attempt_id', 'automatic_retries', 'case_ordinal', 'max_concurrency', 'max_output_tokens', 'max_provider_calls',
    'plan_digest', 'provider_authority_sha256', 'provider_call_budget_consumed', 'request_digest', 'request_file_sha256',
    'reservation_id', 'reserved_at_utc', 'route', 'runtime_id', 'scenario_id', 'schema_version', 'state', 'timeout_ms',
  ];
  const routeKeys = ['adapter_revision', 'executor_image_id', 'model', 'provider', 'reasoning_effort', 'transport_image_id'];
  const ordinal = ['FACT-01', 'FACT-03', 'SAFE-01'].indexOf(request.scenario_id);
  if (!exactKeys(reservation, keys) || !exactKeys(reservation?.route, routeKeys) || reservation.schema_version !== '1.0.0' ||
      reservation.state !== 'consumed_pre_call' || reservation.scenario_id !== request.scenario_id || reservation.case_ordinal !== ordinal ||
      reservation.reservation_id !== `RC5-RESERVATION-${request.scenario_id}-R01` ||
      reservation.attempt_id !== `RC5-ATTEMPT-${request.scenario_id}-R01` || reservation.request_digest !== request.request_digest.value ||
      reservation.provider_call_budget_consumed !== true || reservation.automatic_retries !== 0 || reservation.max_concurrency !== 1 ||
      reservation.max_output_tokens !== 4_000 || reservation.max_provider_calls !== 1 || reservation.timeout_ms !== MAX_TIMEOUT_MS ||
      reservation.provider_authority_sha256 !== hash(Buffer.from(RC5_PROVIDER_AUTHORITY, 'utf8')) ||
      !/^[a-f0-9]{64}$/u.test(reservation.plan_digest || '') || !/^[a-f0-9]{64}$/u.test(reservation.request_file_sha256 || '') ||
      reservation.runtime_id !== runtimeId || !/^RC5-EXEC-(?:FACT-01|FACT-03|SAFE-01)-[a-f0-9]{16}$/u.test(runtimeId || '') ||
      reservation.route.adapter_revision !== '2fc02090af1632b86ee1175a6720904dfd71081c' ||
      reservation.route.transport_image_id !== RC5_EXECUTOR_PARENT_IMAGE_ID ||
      reservation.route.executor_image_id !== RC5_EXECUTOR_IMAGE_ID || reservation.route.model !== 'gpt-5.6-sol' ||
      reservation.route.provider !== 'openai-codex' || reservation.route.reasoning_effort !== 'xhigh') {
    reject('RC5_EXECUTOR_RESERVATION', 'The durable reservation does not authorize the bounded executor.', 2);
  }
  return reservation;
}

function validateDispatchBinding(dispatch, reservation) {
  const keys = [
    'attempt_id', 'automatic_retries', 'dispatch_id', 'dispatched_at_utc', 'provider_call_charged', 'request_digest',
    'reservation_id', 'runtime_id', 'scenario_id', 'schema_version', 'state',
  ];
  if (!exactKeys(dispatch, keys) || dispatch.schema_version !== '1.0.0' || dispatch.state !== 'provider_handoff_started' ||
      dispatch.provider_call_charged !== true || dispatch.automatic_retries !== 0 || dispatch.scenario_id !== reservation.scenario_id ||
      dispatch.request_digest !== reservation.request_digest || dispatch.runtime_id !== reservation.runtime_id ||
      dispatch.reservation_id !== reservation.reservation_id || dispatch.attempt_id !== reservation.attempt_id ||
      dispatch.dispatch_id !== `RC5-DISPATCH-${reservation.scenario_id}-R01`) {
    reject('RC5_EXECUTOR_DISPATCH', 'The durable dispatch does not reconcile to the reservation.', 2);
  }
  return dispatch;
}

function validateDurableLedgerFiles(stateRoot, reservation, dispatch) {
  const reservationBytes = readBoundedNativeFile(join(stateRoot, 'reservations'), `${reservation.scenario_id}.json`, 64 * 1024);
  const dispatchBytes = readBoundedNativeFile(join(stateRoot, 'dispatches'), `${dispatch.scenario_id}.json`, 64 * 1024);
  const observedReservation = parseJson(reservationBytes.toString('utf8'), 'RC5_EXECUTOR_RESERVATION', 'Durable reservation');
  const observedDispatch = parseJson(dispatchBytes.toString('utf8'), 'RC5_EXECUTOR_DISPATCH', 'Durable dispatch');
  if (!reservationBytes.equals(Buffer.from(canonicalJsonV1(observedReservation), 'utf8')) ||
      !dispatchBytes.equals(Buffer.from(canonicalJsonV1(observedDispatch), 'utf8')) ||
      canonicalJsonV1(observedReservation) !== canonicalJsonV1(reservation) ||
      canonicalJsonV1(observedDispatch) !== canonicalJsonV1(dispatch)) {
    reject('RC5_EXECUTOR_LEDGER_DRIFT', 'The durable reservation or dispatch changed before worker creation.', 2);
  }
  return true;
}

function createLayout(root) {
  const input = join(root, 'input');
  const output = join(root, 'output');
  const locks = join(root, 'locks');
  for (const directory of [input, output, locks]) mkdirSync(directory);
  return Object.freeze({ input, locks, output, root });
}

function writeCanonicalExclusive(filePath, value) {
  writeFileSync(filePath, Buffer.from(canonicalJsonV1(value), 'utf8'), { flag: 'wx', mode: 0o600 });
}

function workerArguments() {
  return [
    '--permission', '--use-env-proxy', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', `--allow-fs-read=${CONTENT_GATE_SCRIPT}`,
    `--allow-fs-read=${HTML_ENTITIES_SCRIPT}`, `--allow-fs-read=${WORKER_SCRIPT}`,
    '--allow-fs-read=/credentials', '--allow-fs-read=/input/worker-input.json', '--allow-fs-read=/output', '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials', '--allow-fs-write=/output', '--allow-fs-write=/locks', '--allow-fs-write=/tmp',
    WORKER_SCRIPT, 'container-run', '/input/worker-input.json', '/output',
  ];
}

function providerFreeWorkerArguments() {
  return [
    '--permission', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', `--allow-fs-read=${WORKER_SCRIPT}`,
    '--allow-fs-read=/input/worker-input.json', '--allow-fs-read=/output', '--allow-fs-write=/output',
    WORKER_SCRIPT, 'container-provider-free', '/input/worker-input.json', '/output',
  ];
}

function probeLedger(request, ordinal) {
  const runtimeId = `RC5-EXEC-${request.scenario_id}-${String(ordinal + 1).padStart(16, '0')}`;
  const reservation = {
    attempt_id: `RC5-ATTEMPT-${request.scenario_id}-R01`,
    automatic_retries: 0,
    case_ordinal: ordinal,
    max_concurrency: 1,
    max_output_tokens: 4_000,
    max_provider_calls: 1,
    plan_digest: '0'.repeat(64),
    provider_authority_sha256: hash(Buffer.from(RC5_PROVIDER_AUTHORITY, 'utf8')),
    provider_call_budget_consumed: true,
    request_digest: request.request_digest.value,
    request_file_sha256: hash(Buffer.from(canonicalJsonV1(request), 'utf8')),
    reservation_id: `RC5-RESERVATION-${request.scenario_id}-R01`,
    reserved_at_utc: '2026-08-26T00:00:00.000Z',
    route: {
      adapter_revision: '2fc02090af1632b86ee1175a6720904dfd71081c',
      executor_image_id: RC5_EXECUTOR_IMAGE_ID,
      model: 'gpt-5.6-sol',
      provider: 'openai-codex',
      reasoning_effort: 'xhigh',
      transport_image_id: RC5_EXECUTOR_PARENT_IMAGE_ID,
    },
    runtime_id: runtimeId,
    scenario_id: request.scenario_id,
    schema_version: '1.0.0',
    state: 'consumed_pre_call',
    timeout_ms: MAX_TIMEOUT_MS,
  };
  const dispatch = {
    attempt_id: reservation.attempt_id,
    automatic_retries: 0,
    dispatch_id: `RC5-DISPATCH-${request.scenario_id}-R01`,
    dispatched_at_utc: '2026-08-26T00:00:01.000Z',
    provider_call_charged: true,
    request_digest: reservation.request_digest,
    reservation_id: reservation.reservation_id,
    runtime_id: reservation.runtime_id,
    scenario_id: reservation.scenario_id,
    schema_version: '1.0.0',
    state: 'provider_handoff_started',
  };
  validateReservationBinding(reservation, request, runtimeId);
  validateDispatchBinding(dispatch, reservation);
  return Object.freeze({ dispatch: Object.freeze(dispatch), reservation: Object.freeze(reservation) });
}

function validateProviderFreeProbeResult(value, request) {
  const keys = ['capability', 'endpoint', 'failure', 'payload_sha256', 'provider_calls', 'request_digest', 'role_sequence', 'schema_version', 'success'];
  if (!exactKeys(value, keys) || !exactKeys(value.failure, ['completion', 'direct_adapter_invocations', 'no_retry', 'provider_request_count']) ||
      !exactKeys(value.success, ['completion', 'direct_adapter_invocations', 'finish_reason', 'input_tokens', 'output_tokens', 'provider_request_count']) ||
      value.schema_version !== '1.0.0' || value.capability !== 'ordered_system_user_messages_v1' ||
      value.endpoint !== RESPONSES_ENDPOINT || value.provider_calls !== 0 || value.request_digest !== request.request_digest.value ||
      canonicalJsonV1(value.role_sequence) !== canonicalJsonV1(ROLE_SEQUENCE) || !/^[a-f0-9]{64}$/u.test(value.payload_sha256 || '') ||
      value.success.completion !== 'completed' || value.success.direct_adapter_invocations !== 1 || value.success.finish_reason !== 'stop' ||
      value.success.input_tokens !== 7 || value.success.output_tokens !== 2 || value.success.provider_request_count !== 1 ||
      value.failure.completion !== 'failed' || value.failure.direct_adapter_invocations !== 1 || value.failure.provider_request_count !== 1 ||
      value.failure.no_retry !== true) {
    reject('RC5_EXECUTOR_PROBE', 'The provider-free executor result differs from the bounded contract.', 2);
  }
  return value;
}

export async function probeDockerProviderExecutor(options = {}) {
  if (process.platform !== 'win32') reject('RC5_EXECUTOR_PLATFORM', 'The provider-free executor probe requires Windows Docker Desktop.', 2);
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const probeRoot = ensureEmptyRuntimeRoot(options.probeRoot);
  if (!Array.isArray(options.requests) || options.requests.length !== 3) reject('RC5_EXECUTOR_PROBE', 'The executor probe requires all three RC-5 requests.', 2);
  verifyDockerHost(executable);
  const image = verifyImage(executable);
  const captures = [];
  for (let ordinal = 0; ordinal < options.requests.length; ordinal += 1) {
    const request = validateRequest(options.requests[ordinal]);
    const root = join(probeRoot, request.scenario_id);
    const input = join(root, 'input');
    const output = join(root, 'output');
    mkdirSync(root);
    mkdirSync(input);
    mkdirSync(output);
    const ledger = probeLedger(request, ordinal);
    const workerInput = {
      credentialPath: '/credentials/.credentials.yaml',
      dispatch: ledger.dispatch,
      lockDirectory: '/locks',
      profileDirectory: '/opt/recursus-profile',
      request,
      reservation: ledger.reservation,
      timeoutMs: MAX_TIMEOUT_MS,
    };
    writeCanonicalExclusive(join(input, 'worker-input.json'), workerInput);
    docker(executable, [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--pids-limit=64', '--memory=536870912', '--cpus=1', '--user=65532:65532', '--log-driver=none',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=8388608,uid=65532,gid=65532,mode=0700',
      '--env=HOME=/nonexistent', '--env=LANG=C.UTF-8', '--env=TZ=UTC',
      ...mount(input, '/input', true), ...mount(output, '/output'), '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID,
      ...providerFreeWorkerArguments(),
    ], { code: 'RC5_EXECUTOR_PROBE', timeoutMs: 60_000 });
    if (canonicalJsonV1(readdirSync(output).sort()) !== canonicalJsonV1(['executor-probe.json'])) {
      reject('RC5_EXECUTOR_PROBE', 'The provider-free worker output topology differs.', 2);
    }
    const bytes = readBoundedNativeFile(output, 'executor-probe.json', MAX_RESULT_BYTES);
    const value = parseJson(bytes.toString('utf8'), 'RC5_EXECUTOR_PROBE', 'Executor probe result');
    if (!bytes.equals(Buffer.from(canonicalJsonV1(value), 'utf8'))) reject('RC5_EXECUTOR_PROBE', 'Executor probe output is not canonical JSON.', 2);
    validateProviderFreeProbeResult(value, request);
    captures.push(Object.freeze({ ...value, scenario_id: request.scenario_id }));
  }
  return Object.freeze({
    captures: Object.freeze(captures),
    credential_mounted: false,
    image,
    network: 'none',
    provider_calls: 0,
    proxy_source: RC5_PROXY_SOURCE,
    schema_version: '1.0.0',
    status: 'validated_provider_free',
    worker_source: RC5_PROVIDER_WORKER_SOURCE,
  });
}

function closedWorkerEnvironment(inspect) {
  const observed = Object.fromEntries((inspect.Config?.Env ?? []).map((entry) => {
    const boundary = entry.indexOf('=');
    return [entry.slice(0, boundary), entry.slice(boundary + 1)];
  }));
  const expected = {
    HOME: '/tmp/rc5-home', HTTP_PROXY: 'http://127.0.0.1:8080', HTTPS_PROXY: 'http://127.0.0.1:8080',
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'production', NODE_VERSION: '24.19.0', NO_PROXY: '',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', TMPDIR: '/tmp', TZ: 'UTC', YARN_VERSION: '1.22.22',
  };
  if (canonicalJsonV1(observed) !== canonicalJsonV1(expected)) reject('RC5_RUNTIME_AUTHORITY', 'Worker environment differs from the closed allowlist.', 2);
}

function allocateAuthorityResources(nonce) {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{16}$/u.test(nonce)) reject('RC5_RUNTIME_AUTHORITY', 'Authority resource nonce is invalid.', 2);
  const names = Object.freeze({
    network: `rc5-exec-net-${nonce}`,
    proxy: `rc5-exec-proxy-${nonce}`,
    relay: `rc5-exec-relay-${nonce}`,
    socket: `rc5-exec-socket-${nonce}`,
    worker: `rc5-exec-worker-${nonce}`,
  });
  return Object.seal({
    creation: {
      network: 'pending',
      proxy: 'pending',
      relay: 'pending',
      socket: 'pending',
      state: 'descriptor_published',
      worker: 'pending',
    },
    names,
    relayId: null,
  });
}

function authorityCreationReconciled(resources) {
  return resources === undefined || (resources?.creation?.state === 'reconciled_absent' && resources.relayId === null &&
    ['network', 'proxy', 'relay', 'socket', 'worker'].every((key) => resources.creation[key] === 'absent'));
}

function containmentMayRelease(cleanupObservation, resources) {
  return cleanupObservation?.cleaned === true && authorityCreationReconciled(resources);
}

function createAuthority(executable, resources, deadlineMs) {
  const { names } = resources;
  resources.creation.state = 'creating';
  resources.creation.socket = 'creating';
  docker(executable, ['volume', 'create', '--label', `${CONTRACT_LABEL}=${CONTRACT_ID}`, names.socket], { code: 'RC5_AUTHORITY_VOLUME', deadlineMs });
  resources.creation.socket = 'created';
  resources.creation.network = 'creating';
  docker(executable, ['network', 'create', '--driver', 'bridge', '--label', `${CONTRACT_LABEL}=${CONTRACT_ID}`, names.network], { code: 'RC5_AUTHORITY_NETWORK', deadlineMs });
  resources.creation.network = 'created';
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--cap-add=CHOWN', '--cap-add=FOWNER',
    '--security-opt=no-new-privileges', '--user=0:0', ...mount(names.socket, '/run/rc3-socket', false, 'volume'),
    '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, SOCKET_INIT_SCRIPT,
  ], { code: 'RC5_AUTHORITY_SOCKET_INIT', deadlineMs });
  resources.creation.proxy = 'creating';
  const proxyArgs = [
    ...commonContainerArgs(names.proxy, names.network, 'local'), ...mount(names.socket, '/run/rc3-socket', false, 'volume'),
    '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, PROXY_SCRIPT,
  ];
  docker(executable, proxyArgs, { code: 'RC5_AUTHORITY_PROXY_CREATE', deadlineMs });
  resources.creation.proxy = 'created';
  const proxy = inspectContainer(executable, names.proxy, deadlineMs);
  verifyBaseAuthority(proxy, names.network, [PROXY_SCRIPT], { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '1m' } });
  exactMounts(proxy, [{ destination: '/run/rc3-socket', mode: 'rw', source: names.socket, type: 'volume' }]);
  docker(executable, ['start', names.proxy], { code: 'RC5_AUTHORITY_PROXY_START', deadlineMs });
  waitForLog(executable, names.proxy, 'proxy_ready', deadlineMs);
  resources.creation.proxy = 'ready';
  resources.creation.relay = 'creating';
  const relayArgs = [
    ...commonContainerArgs(names.relay, 'none', 'local'), ...mount(names.socket, '/run/rc3-socket', true, 'volume'),
    '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, RELAY_SCRIPT,
  ];
  docker(executable, relayArgs, { code: 'RC5_AUTHORITY_RELAY_CREATE', deadlineMs });
  resources.creation.relay = 'created';
  const relay = inspectContainer(executable, names.relay, deadlineMs);
  verifyBaseAuthority(relay, 'none', [RELAY_SCRIPT], { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '1m' } });
  exactMounts(relay, [{ destination: '/run/rc3-socket', mode: 'ro', source: names.socket, type: 'volume' }]);
  docker(executable, ['start', names.relay], { code: 'RC5_AUTHORITY_RELAY_START', deadlineMs });
  waitForLog(executable, names.relay, 'relay_ready', deadlineMs);
  resources.creation.relay = 'ready';
  resources.relayId = relay.Id;
  resources.creation.state = 'authority_ready';
  return resources;
}

function createStoppedWorker(executable, resources, paths, deadlineMs) {
  resources.creation.worker = 'creating';
  const args = [
    ...commonContainerArgs(resources.names.worker, `container:${resources.relayId}`),
    '--env=HOME=/tmp/rc5-home', '--env=TMPDIR=/tmp', '--env=LANG=C.UTF-8', '--env=TZ=UTC',
    '--env=HTTP_PROXY=http://127.0.0.1:8080', '--env=HTTPS_PROXY=http://127.0.0.1:8080', '--env=NO_PROXY=',
    ...mount(paths.credentialHome, '/credentials'), ...mount(paths.layout.input, '/input', true),
    ...mount(paths.layout.output, '/output'), ...mount(paths.layout.locks, '/locks'),
    '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, ...workerArguments(),
  ];
  docker(executable, args, { code: 'RC5_WORKER_CREATE', deadlineMs });
  resources.creation.worker = 'created';
  const inspect = inspectContainer(executable, resources.names.worker, deadlineMs);
  verifyBaseAuthority(inspect, `container:${resources.relayId}`, workerArguments(), { Type: 'none', Config: {} });
  exactMounts(inspect, [
    { destination: '/credentials', mode: 'rw', source: paths.credentialHome, type: 'bind' },
    { destination: '/input', mode: 'ro', source: paths.layout.input, type: 'bind' },
    { destination: '/locks', mode: 'rw', source: paths.layout.locks, type: 'bind' },
    { destination: '/output', mode: 'rw', source: paths.layout.output, type: 'bind' },
  ]);
  closedWorkerEnvironment(inspect);
  if (inspect.State?.Status !== 'created' || inspect.State?.Running !== false ||
      (inspect.Config?.Cmd ?? []).some((item) => item === '--allow-child-process' || item === '--allow-worker')) {
    reject('RC5_RUNTIME_AUTHORITY', 'Worker was not prepared as a stopped one-shot container.', 2);
  }
  resources.creation.worker = 'ready';
}

function strictNotFound(kind, name, result) {
  const expected = kind === 'container'
    ? `Error response from daemon: No such container: ${name}`
    : kind === 'network'
      ? `Error response from daemon: network ${name} not found`
      : `Error response from daemon: get ${name}: no such volume`;
  return result?.error === undefined && result?.status === 1 && result?.signal === null && result?.stdout?.trim() === '[]' && result?.stderr?.trim() === expected;
}

function cleanupAuthority(executable, resources, deadlineMs = Number.POSITIVE_INFINITY) {
  if (!resources?.names) return Object.freeze({ cleaned: true, inspection_error_count: 0 });
  resources.creation.state = 'cleanup_in_progress';
  const remainingTimeout = () => boundedDeadlineTimeout(deadlineMs, 5_000);
  for (const name of [resources.names.worker, resources.names.relay, resources.names.proxy]) {
    dockerBestEffort(executable, ['rm', '--force', name], Math.max(1, remainingTimeout()), deadlineMs);
  }
  dockerBestEffort(executable, ['network', 'rm', resources.names.network], Math.max(1, remainingTimeout()), deadlineMs);
  dockerBestEffort(executable, ['volume', 'rm', resources.names.socket], Math.max(1, remainingTimeout()), deadlineMs);
  const inspections = [
    ['container', resources.names.worker], ['container', resources.names.relay], ['container', resources.names.proxy],
    ['network', resources.names.network], ['volume', resources.names.socket],
  ].map(([kind, name]) => ({ kind, name, result: dockerBestEffort(executable, [kind, 'inspect', name], Math.max(1, remainingTimeout()), deadlineMs) }));
  const errors = inspections.filter((entry) => !strictNotFound(entry.kind, entry.name, entry.result)).length;
  resources.creation.state = errors === 0 ? 'reconciled_absent' : 'cleanup_incomplete';
  if (errors === 0) {
    for (const key of ['network', 'proxy', 'relay', 'socket', 'worker']) resources.creation[key] = 'absent';
    resources.relayId = null;
  }
  return Object.freeze({ cleaned: errors === 0, inspection_error_count: errors });
}

function waitForWorker(executable, workerName, timeoutMs, deadlineMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const boundedWaitMs = boundedDeadlineTimeout(deadlineMs, timeoutMs);
    if (boundedWaitMs < 1) {
      rejectPromise(new RC5SliceError('RC5_WORKER_TIMEOUT', 'Worker wait was blocked at the hard case deadline.', 2));
      return;
    }
    const child = spawn(executable, ['--context', DOCKER_CONTEXT, 'wait', workerName], {
      env: dockerEnvironment(),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let stdout = '';
    let stderr = '';
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      dockerBestEffort(executable, ['rm', '--force', workerName], Math.max(1, boundedDeadlineTimeout(deadlineMs, 5_000)), deadlineMs);
      child.kill();
      settle(rejectPromise, new RC5SliceError('RC5_WORKER_TIMEOUT', 'The bounded worker exceeded its registered wall time and was force-removed.', 2));
    }, boundedWaitMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > 4_096) {
        child.kill();
        settle(rejectPromise, new RC5SliceError('RC5_WORKER_WAIT', 'Worker wait output exceeded its bound.', 2));
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (Buffer.byteLength(stderr, 'utf8') > 4_096) {
        child.kill();
        settle(rejectPromise, new RC5SliceError('RC5_WORKER_WAIT', 'Worker wait diagnostic exceeded its bound.', 2));
      }
    });
    child.once('error', () => settle(rejectPromise, new RC5SliceError('RC5_WORKER_WAIT', 'Worker wait could not be started.', 2)));
    child.once('close', (code, signal) => {
      if (settled) return;
      if (code !== 0 || signal !== null || stderr.trim() !== '') {
        settle(rejectPromise, new RC5SliceError('RC5_WORKER_WAIT', 'Worker wait failed without exposing provider content.', 2));
        return;
      }
      const exitCode = Number(stdout.trim());
      if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
        settle(rejectPromise, new RC5SliceError('RC5_WORKER_WAIT', 'Worker exit status was invalid.', 2));
        return;
      }
      settle(resolvePromise, exitCode);
    });
  });
}

function parseEvents(output, allowed) {
  return output.split(/\r?\n/u).filter(Boolean).map((line) => {
    const event = parseJson(line, 'RC5_AUTHORITY_TRACE', 'Authority trace');
    if (!event || typeof event !== 'object' || Array.isArray(event) || !allowed.has(event.type)) reject('RC5_AUTHORITY_TRACE', 'Authority trace contains an unknown event.', 2);
    return event;
  });
}

function onlyEvent(events, type) {
  const values = events.filter((event) => event.type === type);
  if (values.length !== 1) reject('RC5_AUTHORITY_TRACE', `Authority trace requires exactly one ${type} event.`, 2);
  return values[0];
}

function stopAndReadAuthority(executable, resources, deadlineMs) {
  assertBeforeDeadline(deadlineMs, 'Authority shutdown');
  dockerBestEffort(executable, ['stop', '--time=5', resources.names.relay], Math.max(1, boundedDeadlineTimeout(deadlineMs, 10_000)), deadlineMs);
  dockerBestEffort(executable, ['stop', '--time=5', resources.names.proxy], Math.max(1, boundedDeadlineTimeout(deadlineMs, 10_000)), deadlineMs);
  const proxyEvents = parseEvents(docker(executable, ['logs', resources.names.proxy], { code: 'RC5_AUTHORITY_TRACE', deadlineMs, timeoutMs: 5_000 }), new Set(['proxy_ready', 'connect_denied', 'connect_admitted', 'tunnel_closed', 'proxy_summary']));
  const relayEvents = parseEvents(docker(executable, ['logs', resources.names.relay], { code: 'RC5_AUTHORITY_TRACE', deadlineMs, timeoutMs: 5_000 }), new Set(['relay_ready', 'relay_summary']));
  const proxyReady = onlyEvent(proxyEvents, 'proxy_ready');
  const relayReady = onlyEvent(relayEvents, 'relay_ready');
  const proxy = onlyEvent(proxyEvents, 'proxy_summary');
  const relay = onlyEvent(relayEvents, 'relay_summary');
  const admitted = proxyEvents.filter((event) => event.type === 'connect_admitted');
  const closed = proxyEvents.filter((event) => event.type === 'tunnel_closed');
  const denied = proxyEvents.filter((event) => event.type === 'connect_denied');
  if (proxyEvents[0] !== proxyReady || proxyEvents.at(-1) !== proxy || relayEvents[0] !== relayReady || relayEvents.at(-1) !== relay ||
      proxyReady.policy_version !== 'rc5-proxy-v1' || relayReady.policy_version !== 'rc3-relay-v17' ||
      proxy.clean_shutdown !== true || relay.clean_shutdown !== true || proxy.unexpected !== 0 || relay.upstream_failures !== 0 ||
      proxy.denied !== denied.length || proxy.responses_admitted !== admitted.filter((event) => event.destination_id === 'responses').length ||
      proxy.oauth_admitted !== admitted.filter((event) => event.destination_id === 'oauth_refresh').length ||
      proxy.responses_admitted > 1 || proxy.oauth_admitted > 1 || relay.accepted_connections !== admitted.length + denied.length ||
      denied.length !== 0 || closed.length !== admitted.length ||
      admitted.some((event) => !['responses', 'oauth_refresh'].includes(event.destination_id) || event.ordinal !== 1) ||
      closed.some((event) => !['responses', 'oauth_refresh'].includes(event.destination_id) || event.ordinal !== 1 ||
        !['client_closed', 'upstream_closed'].includes(event.close_reason))) {
    reject('RC5_AUTHORITY_TRACE', 'Authority trace violates the one-request, no-retry topology.', 2);
  }
  const proxyBytes = Buffer.from(canonicalJsonV1(proxyEvents), 'utf8');
  const relayBytes = Buffer.from(canonicalJsonV1(relayEvents), 'utf8');
  if (proxyBytes.length > MAX_TRACE_BYTES || relayBytes.length > MAX_TRACE_BYTES || CREDENTIAL_PATTERN.test(proxyBytes.toString('utf8')) || CREDENTIAL_PATTERN.test(relayBytes.toString('utf8'))) {
    reject('RC5_AUTHORITY_TRACE', 'Authority trace exceeded its content-safe bound.', 2);
  }
  return Object.freeze({ proxy, proxyEvents, relay, relayEvents });
}

function persistAuthorityTraces(layout, traces, deadlineMs = Number.POSITIVE_INFINITY) {
  assertBeforeDeadline(deadlineMs, 'Authority trace persistence');
  const proxyBytes = Buffer.from(canonicalJsonV1(traces.proxyEvents), 'utf8');
  const relayBytes = Buffer.from(canonicalJsonV1(traces.relayEvents), 'utf8');
  writeFileSync(join(layout.root, 'authority-proxy-events.json'), proxyBytes, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(layout.root, 'authority-relay-events.json'), relayBytes, { flag: 'wx', mode: 0o600 });
  assertBeforeDeadline(deadlineMs, 'Authority trace persistence');
  return Object.freeze({ proxyBytes, relayBytes });
}

function readBoundedNativeFile(directory, name, maximum, required = true) {
  const target = join(directory, name);
  if (!existsSync(target)) {
    if (!required) return null;
    reject('RC5_WORKER_OUTPUT', `${name} is missing.`, 2);
  }
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || portablePath(realpathSync.native(target)) !== portablePath(target) || info.size > maximum) {
    reject('RC5_WORKER_OUTPUT', `${name} is not a bounded single-link native file.`, 2);
  }
  return readFileSync(target);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateWorkerResult(bytes, request) {
  if (CREDENTIAL_PATTERN.test(bytes.toString('utf8'))) reject('RC5_CREDENTIAL_LEAK', 'Credential-shaped worker output was blocked.', 2);
  const result = parseJson(bytes.toString('utf8'), 'RC5_WORKER_OUTPUT', 'Worker result');
  const keys = ['schema_version', 'completion', 'trusted_completed', 'finish_reason', 'input_tokens', 'output_tokens', 'wall_ms',
    'direct_adapter_invocations', 'provider_request_count', 'oauth_refresh_count', 'responses_endpoint', 'external_mutations'];
  if (!exactKeys(result, keys) || !bytes.equals(Buffer.from(canonicalJsonV1(result), 'utf8')) || result.schema_version !== '1.0.0' ||
      !['completed', 'failed', 'timed_out'].includes(result.completion) || result.trusted_completed !== (result.completion === 'completed') ||
      !['stop', 'max_tokens', 'aborted', 'error', 'malformed'].includes(result.finish_reason) ||
      !(result.input_tokens === 'not_reported' || (Number.isInteger(result.input_tokens) && result.input_tokens >= 0)) ||
      !(result.output_tokens === 'not_reported' || (Number.isInteger(result.output_tokens) && result.output_tokens >= 0 && result.output_tokens <= 4_000)) ||
      !Number.isInteger(result.wall_ms) || result.wall_ms < 0 || result.wall_ms > MAX_TIMEOUT_MS ||
      result.direct_adapter_invocations !== 1 || ![0, 1].includes(result.provider_request_count) || ![0, 1].includes(result.oauth_refresh_count) ||
      result.responses_endpoint !== RESPONSES_ENDPOINT || !Array.isArray(result.external_mutations) || result.external_mutations.length !== 0 ||
      (result.completion === 'completed' && (result.provider_request_count !== 1 || result.finish_reason !== 'stop')) ||
      request.execution.max_output_tokens !== 4_000) {
    reject('RC5_WORKER_OUTPUT', 'Worker result violates the bounded result contract.', 2);
  }
  return Object.freeze(result);
}

function validateExternalTopology(layout, credentialHome, expectedInput, expectedTraces, deadlineMs = Number.POSITIVE_INFINITY) {
  assertBeforeDeadline(deadlineMs, 'External topology validation');
  const rootNames = readdirSync(layout.root).sort();
  if (canonicalJsonV1(rootNames) !== canonicalJsonV1(['authority-proxy-events.json', 'authority-relay-events.json', 'input', 'locks', 'output']) ||
      canonicalJsonV1(readdirSync(layout.input).sort()) !== canonicalJsonV1(['worker-input.json']) ||
      readdirSync(layout.locks).length !== 0 || canonicalJsonV1(readdirSync(credentialHome).sort()) !== canonicalJsonV1(['.credentials.yaml'])) {
    reject('RC5_EXTERNAL_TOPOLOGY', 'External runtime or credential topology contains an unexpected entry.', 2);
  }
  for (const directory of [layout.input, layout.locks, layout.output]) {
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || portablePath(realpathSync.native(directory)) !== portablePath(directory)) {
      reject('RC5_EXTERNAL_TOPOLOGY', 'External runtime topology contains an aliased directory.', 2);
    }
  }
  const input = readBoundedNativeFile(layout.input, 'worker-input.json', 512 * 1024);
  const proxy = readBoundedNativeFile(layout.root, 'authority-proxy-events.json', MAX_TRACE_BYTES);
  const relay = readBoundedNativeFile(layout.root, 'authority-relay-events.json', MAX_TRACE_BYTES);
  if (!input.equals(expectedInput) || !proxy.equals(expectedTraces.proxyBytes) || !relay.equals(expectedTraces.relayBytes)) {
    reject('RC5_EXTERNAL_TOPOLOGY', 'External runtime inputs or traces changed during execution.', 2);
  }
  assertBeforeDeadline(deadlineMs, 'External topology validation');
  return true;
}

function collectResult(layout, request, exitCode, state, traces, credentialProtected, cleanup, hostWallMs) {
  const names = readdirSync(layout.output).sort();
  if (names.some((name) => !['assistant-output.md', 'worker-result.json'].includes(name)) || !names.includes('worker-result.json')) {
    reject('RC5_WORKER_OUTPUT', 'Worker output topology differs from the bounded contract.', 2);
  }
  const resultBytes = readBoundedNativeFile(layout.output, 'worker-result.json', MAX_RESULT_BYTES);
  const result = validateWorkerResult(resultBytes, request);
  const artifactBytes = readBoundedNativeFile(layout.output, 'assistant-output.md', MAX_ARTIFACT_BYTES, false);
  if ((result.completion === 'completed') !== (artifactBytes !== null && artifactBytes.length > 0) ||
      (artifactBytes !== null && CREDENTIAL_PATTERN.test(artifactBytes.toString('utf8')))) {
    reject('RC5_WORKER_OUTPUT', 'Worker artifact differs from the trusted completion state.', 2);
  }
  if (traces.proxy.responses_admitted !== result.provider_request_count || traces.proxy.oauth_admitted !== result.oauth_refresh_count ||
      traces.relay.accepted_connections !== traces.proxy.responses_admitted + traces.proxy.oauth_admitted ||
      state?.OOMKilled !== false || state?.Running !== false || !credentialProtected || !cleanup.cleaned ||
      (result.completion === 'completed' && exitCode !== 0)) {
    reject('RC5_EXECUTOR_RECONCILIATION', 'Worker, authority, credential, or cleanup observations do not reconcile.', 2);
  }
  return Object.freeze({
    artifact: artifactBytes === null ? null : artifactBytes.toString('utf8'),
    completion: result.completion,
    direct_adapter_invocations: result.direct_adapter_invocations,
    external_mutations: result.external_mutations,
    finish_reason: result.finish_reason,
    input_tokens: result.input_tokens,
    oauth_refresh_count: result.oauth_refresh_count,
    output_tokens: result.output_tokens,
    provider_request_count: result.provider_request_count,
    responses_endpoint: result.responses_endpoint,
    schema_version: result.schema_version,
    trusted_completed: result.trusted_completed,
    wall_ms: hostWallMs,
  });
}

export async function prepareDockerProviderExecution(options = {}) {
  if (process.platform !== 'win32') reject('RC5_EXECUTOR_PLATFORM', 'The bounded executor requires Windows Docker Desktop.', 2);
  if (options.providerAuthority !== RC5_PROVIDER_AUTHORITY) reject('RC5_PROVIDER_AUTHORITY', 'The exact RC-5 provider authority is required.', 2);
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const credentialHome = ensureClosedCredentialHome(options.credentialHome);
  const runtimeRoot = ensureEmptyRuntimeRoot(options.runtimeRoot);
  assertDisjointRoots(runtimeRoot, credentialHome);
  const stateRoot = validateStateRoot(options.stateRoot, runtimeRoot, credentialHome);
  const request = validateRequest(options.request);
  const runtimeId = options.runtimeId;
  const reservation = validateReservationBinding(options.reservation, request, runtimeId);
  const timeoutMs = options.timeoutMs ?? MAX_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS || timeoutMs !== request.execution.timeout_ms) {
    reject('RC5_EXECUTOR_TIMEOUT', 'Executor timeout must equal the registered per-case wall bound.', 2);
  }
  let resources;
  let invoked = false;
  let cleaned = false;
  let cleanupInProgress = false;
  let hardDeadlineMs = Number.POSITIVE_INFINITY;
  let interruptedSignal = null;
  let handlersInstalled = false;

  const cleanup = () => {
    if (cleaned) return Object.freeze({ cleaned: true, inspection_error_count: 0 });
    if (cleanupInProgress) return Object.freeze({ cleaned: false, inspection_error_count: 1 });
    cleanupInProgress = true;
    let observation;
    const describedResources = resources;
    try {
      observation = cleanupAuthority(executable, resources, hardDeadlineMs);
    } finally {
      cleanupInProgress = false;
    }
    const creationReconciled = authorityCreationReconciled(describedResources);
    cleaned = containmentMayRelease(observation, describedResources);
    if (observation.cleaned && !creationReconciled) {
      observation = Object.freeze({ cleaned: false, inspection_error_count: observation.inspection_error_count + 1 });
    }
    if (observation.cleaned) {
      resources = undefined;
      if (handlersInstalled) {
        process.removeListener('SIGINT', containSigint);
        process.removeListener('SIGTERM', containSigterm);
        handlersInstalled = false;
      }
    } else {
      reject('RC5_CLEANUP_INCOMPLETE', 'The bounded executor could not prove complete resource cleanup.', 2);
    }
    return observation;
  };

  const containSignal = (signal) => {
    interruptedSignal ??= signal;
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    if (!cleaned && !cleanupInProgress) {
      try { cleanup(); } catch {}
    }
  };
  const containSigint = () => containSignal('SIGINT');
  const containSigterm = () => containSignal('SIGTERM');

  process.on('SIGINT', containSigint);
  process.on('SIGTERM', containSigterm);
  handlersInstalled = true;
  let layout;
  try {
    verifyDockerHost(executable);
    verifyImage(executable);
    secureCredential(executable, credentialHome);
    if (interruptedSignal !== null) reject('RC5_HOST_INTERRUPTED', 'The bounded runtime was interrupted during provider-free preparation.', 2);
    layout = createLayout(runtimeRoot);
  } catch (error) {
    try { cleanup(); } catch {}
    throw error;
  }

  const invoke = async (context = {}) => {
    if (invoked) reject('RC5_RETRY_FORBIDDEN', 'The bounded worker may be invoked only once.', 2);
    if (cleaned) reject('RC5_EXECUTOR_CLOSED', 'The bounded runtime was already cleaned.', 2);
    invoked = true;
    const invocationStartedAt = Date.now();
    hardDeadlineMs = invocationStartedAt + timeoutMs;
    let hardDeadlineExpired = false;
    const hardDeadlineTimer = setTimeout(() => {
      hardDeadlineExpired = true;
      if (!cleanupInProgress && !cleaned) {
        try { cleanup(); } catch {}
      }
    }, timeoutMs);
    let traces;
    let ended;
    let exitCode;
    try {
      const dispatch = validateDispatchBinding(context.dispatch, reservation);
      validateDurableLedgerFiles(stateRoot, reservation, dispatch);
      if (interruptedSignal !== null) reject('RC5_HOST_INTERRUPTED', 'The bounded worker was interrupted after dispatch.', 2);
      const nonce = runtimeId.split('-').at(-1).toLocaleLowerCase('en-US');
      assertBeforeDeadline(hardDeadlineMs, 'Authority descriptor publication');
      resources = allocateAuthorityResources(nonce);
      createAuthority(executable, resources, hardDeadlineMs);
      if (Date.now() >= hardDeadlineMs || interruptedSignal !== null) {
        reject(interruptedSignal === null ? 'RC5_WORKER_TIMEOUT' : 'RC5_HOST_INTERRUPTED',
          interruptedSignal === null ? 'Authority creation exhausted the hard case deadline.' : 'The bounded worker was interrupted during authority creation.', 2);
      }
      createStoppedWorker(executable, resources, { credentialHome, layout }, hardDeadlineMs);
      const workerTimeoutMs = hardDeadlineMs - Date.now() - CLEANUP_HEADROOM_MS - WORKER_EXIT_GRACE_MS;
      if (!Number.isInteger(workerTimeoutMs) || workerTimeoutMs < 1_000) {
        reject('RC5_WORKER_TIMEOUT', 'Insufficient bounded time remained for a provider handoff with cleanup headroom.', 2);
      }
      writeCanonicalExclusive(join(layout.input, 'worker-input.json'), {
        credentialPath: '/credentials/.credentials.yaml',
        dispatch,
        lockDirectory: '/locks',
        profileDirectory: '/opt/recursus-profile',
        request,
        reservation,
        timeoutMs: workerTimeoutMs,
      });
      assertBeforeDeadline(hardDeadlineMs, 'Worker input persistence');
      const workerInputBytes = readFileSync(join(layout.input, 'worker-input.json'));
      assertBeforeDeadline(hardDeadlineMs, 'Worker input validation');
      docker(executable, ['start', resources.names.worker], { code: 'RC5_WORKER_START', deadlineMs: hardDeadlineMs });
      const remainingWaitMs = Math.min(workerTimeoutMs + WORKER_EXIT_GRACE_MS,
        hardDeadlineMs - Date.now() - CLEANUP_HEADROOM_MS);
      if (remainingWaitMs <= 0) {
        dockerBestEffort(executable, ['rm', '--force', resources.names.worker], Math.max(1, boundedDeadlineTimeout(hardDeadlineMs, 5_000)), hardDeadlineMs);
        reject('RC5_WORKER_TIMEOUT', 'The bounded worker reached its host deadline.', 2);
      }
      exitCode = await waitForWorker(executable, resources.names.worker, remainingWaitMs, hardDeadlineMs);
      if (interruptedSignal !== null) reject('RC5_HOST_INTERRUPTED', 'The bounded worker was interrupted after dispatch.', 2);
      if (hardDeadlineExpired || Date.now() >= hardDeadlineMs) reject('RC5_WORKER_TIMEOUT', 'The bounded worker reached its hard host deadline.', 2);
      ended = inspectContainer(executable, resources.names.worker, hardDeadlineMs);
      traces = stopAndReadAuthority(executable, resources, hardDeadlineMs);
      const traceBytes = persistAuthorityTraces(layout, traces, hardDeadlineMs);
      const credentialProtected = verifyCredentialProtection(executable, credentialHome, hardDeadlineMs);
      validateExternalTopology(layout, credentialHome, workerInputBytes, traceBytes, hardDeadlineMs);
      const cleanupObservation = cleanup();
      const hostWallMs = Date.now() - invocationStartedAt;
      if (hostWallMs < 0 || hostWallMs > timeoutMs || hardDeadlineExpired) {
        reject('RC5_WORKER_TIMEOUT', 'The bounded execution and verified cleanup exceeded the hard case deadline.', 2);
      }
      const normalized = collectResult(layout, request, exitCode, ended.State, traces, credentialProtected, cleanupObservation, hostWallMs);
      return normalized;
    } finally {
      clearTimeout(hardDeadlineTimer);
      if (ended === undefined && resources?.names?.worker) {
        dockerBestEffort(executable, ['stop', '--time=5', resources.names.worker], Math.max(1, boundedDeadlineTimeout(hardDeadlineMs, 10_000)), hardDeadlineMs);
      }
      cleanup();
    }
  };

  return Object.freeze({ cleanup, invoke, runtime_id: runtimeId });
}

export const RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS = Object.freeze({
  allocateAuthorityResources,
  authorityCreationReconciled,
  boundedDeadlineTimeout,
  containmentMayRelease,
  CONTRACT_ID,
  CONTRACT_LABEL,
  CLEANUP_HEADROOM_MS,
  DOCKER_CLI_BYTE_COUNT,
  DOCKER_CLI_SHA256,
  DOCKER_CONTEXT,
  deadlineRemainingMs,
  MAX_ARTIFACT_BYTES,
  MAX_TIMEOUT_MS,
  RESPONSES_ENDPOINT,
  WORKER_ARGUMENTS: Object.freeze(workerArguments()),
  PROVIDER_FREE_WORKER_ARGUMENTS: Object.freeze(providerFreeWorkerArguments()),
  WORKER_HASH_LABEL,
  WORKER_EXIT_GRACE_MS,
  WORKER_PATH_LABEL,
  cleanupAuthority,
  exactMounts,
  parseEvents,
  strictNotFound,
  waitForWorker,
  validateExternalTopology,
  validateDispatchBinding,
  validateDurableLedgerFiles,
  validateRequest,
  validateReservationBinding,
  validateProviderFreeProbeResult,
  validateWorkerResult,
});
