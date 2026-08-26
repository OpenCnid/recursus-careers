import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { canonicalJsonV1 } from './prompt-context-v1.mjs';
import {
  RC5_CONTAINER_RUN_AUTHORITY_V1,
  RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256,
} from './rc5-provider-worker.mjs';
import { RC5_PROVIDER_AUTHORITY, RC5SliceError } from './rc5-slice.mjs';

export const RC5_EXECUTOR_IMAGE = 'recursus-rc5-bounded-executor:2fc0209';
export const RC5_EXECUTOR_IMAGE_ID = 'sha256:f6ebef6ba4017ed84bd24e869449563fc7d77e7969ad581efef2a068cdd3b527';
export const RC5_EXECUTOR_PARENT_IMAGE_ID = 'sha256:11f4d4b9777b13ec29430bd682e0cb6b46f715e3ead28736c87a94f89f89aa01';
export const RC5_PROVIDER_WORKER_SOURCE = Object.freeze({
  byte_count: 56_988,
  path: '/opt/rc5/rc5-provider-worker.mjs',
  sha256: 'df7aed70c3fa72de0ecd8c973c0dab24b7ca414053918c6a144462377a039c8a',
});
export const RC5_PROXY_SOURCE = Object.freeze({
  byte_count: 9_399,
  path: '/opt/rc5/rc5-route-proxy.mjs',
  sha256: '0f4348017e62663a69f388a6b3862e64ce3c9a8dc236f221a56684029f8be470',
});
export const RC5_PROVIDER_FREE_SIMULATOR_SOURCE = Object.freeze({
  byte_count: 22_678,
  path: '/opt/rc5/rc5-provider-free-payload-probe.cjs',
  sha256: '933bf6767b5a44a97960d049ed9ba62361b2ef15442db6af5bbf61602e48f8db',
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
const ERROR_CATEGORIES = new Set([
  'ABORTED', 'AUTH', 'INTEGRATION', 'INVALID_REQUEST', 'MALFORMED_RESPONSE', 'PERMISSION', 'RATE_LIMIT', 'TIMEOUT', 'UNAVAILABLE',
]);
const FAILURE_STAGES = new Set(['adapter_terminal', 'adapter_throw', 'fetch_transport', 'worker_timeout', 'worker_validation']);
const CONTRACT_LABEL = RC5_CONTAINER_RUN_AUTHORITY_V1.docker.contract_label.name;
const CONTRACT_ID = RC5_CONTAINER_RUN_AUTHORITY_V1.docker.contract_label.value;
const WORKER_HASH_LABEL = 'io.opencnid.recursus.rc5-provider-worker.sha256';
const WORKER_BYTES_LABEL = 'io.opencnid.recursus.rc5-provider-worker.byte-count';
const WORKER_PATH_LABEL = 'io.opencnid.recursus.rc5-provider-worker.path';
const PROXY_HASH_LABEL = 'io.opencnid.recursus.rc5-proxy.sha256';
const PROXY_BYTES_LABEL = 'io.opencnid.recursus.rc5-proxy.byte-count';
const PROXY_PATH_LABEL = 'io.opencnid.recursus.rc5-proxy.path';
const SIMULATOR_HASH_LABEL = 'io.opencnid.recursus.rc5-provider-free-simulator.sha256';
const SIMULATOR_BYTES_LABEL = 'io.opencnid.recursus.rc5-provider-free-simulator.byte-count';
const SIMULATOR_PATH_LABEL = 'io.opencnid.recursus.rc5-provider-free-simulator.path';
const AUTHORITY_MANIFEST_LABEL = 'io.opencnid.recursus.rc5-container-run-authority.sha256';
const IMAGE_PARENT_LABEL = 'io.opencnid.recursus.parent-image';

const WORKER_SCRIPT = '/opt/rc5/rc5-provider-worker.mjs';
const PROXY_SCRIPT = '/opt/rc5/rc5-route-proxy.mjs';
const SIMULATOR_SCRIPT = '/opt/rc5/rc5-provider-free-payload-probe.cjs';
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

function ensureStagedRuntimeRoot(value) {
  const root = absoluteNativePath(value, 'runtime root');
  const entries = readdirSync(root).sort();
  if (entries.length === 0) return root;
  if (canonicalJsonV1(entries) !== canonicalJsonV1(['input', 'output'])) {
    reject('RC5_EXECUTOR_ROOT_NOT_EMPTY', 'Runtime root differs from the empty staged layout.', 2);
  }
  for (const name of entries) {
    const directory = join(root, name);
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || portablePath(realpathSync.native(directory)) !== portablePath(directory) ||
        readdirSync(directory).length !== 0) {
      reject('RC5_EXECUTOR_ROOT_NOT_EMPTY', 'Runtime staging directory is aliased or not empty.', 2);
    }
  }
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

function ensureCredentialLockHome(value) {
  const root = absoluteNativePath(value, 'credential lock home');
  for (const entry of readdirSync(root)) {
    const target = join(root, entry);
    const info = lstatSync(target);
    if (info.isSymbolicLink() || portablePath(realpathSync.native(target)) !== portablePath(target)) {
      reject('RC5_CREDENTIAL_LOCK_BOUNDARY', 'Credential lock home contains an aliased entry.', 2);
    }
  }
  return root;
}

export function deriveCredentialLockHome(value) {
  return `${ensureClosedCredentialHome(value)}-locks`;
}

function assertExecutionRoots(runtimeRoot, credentialHome, lockHome) {
  assertDisjointRoots(runtimeRoot, credentialHome);
  for (const [left, right] of [[REPOSITORY_ROOT, lockHome], [runtimeRoot, lockHome], [credentialHome, lockHome]]) {
    if (overlaps(left, right) || overlaps(right, left)) {
      reject('RC5_EXECUTOR_ROOT_OVERLAP', 'Repository, runtime, credential, and lock roots must be disjoint.', 2);
    }
  }
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

function executionCutoffDeadline(hardDeadlineMs) {
  if (hardDeadlineMs === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(hardDeadlineMs)) return 0;
  return Math.max(0, hardDeadlineMs - CLEANUP_HEADROOM_MS);
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
    '--permission', `--allow-fs-read=${WORKER_SCRIPT}`, `--allow-fs-read=${PROXY_SCRIPT}`, `--allow-fs-read=${SIMULATOR_SCRIPT}`,
    '--eval', source, WORKER_SCRIPT, PROXY_SCRIPT, SIMULATOR_SCRIPT,
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
      labels[PROXY_BYTES_LABEL] !== String(RC5_PROXY_SOURCE.byte_count) || labels[SIMULATOR_PATH_LABEL] !== SIMULATOR_SCRIPT ||
      labels[SIMULATOR_HASH_LABEL] !== RC5_PROVIDER_FREE_SIMULATOR_SOURCE.sha256 ||
      labels[SIMULATOR_BYTES_LABEL] !== String(RC5_PROVIDER_FREE_SIMULATOR_SOURCE.byte_count) ||
      labels[AUTHORITY_MANIFEST_LABEL] !== RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256) {
    reject('RC5_IMAGE_IDENTITY', 'Executor image differs from the pinned materialization.', 2);
  }
  const observedSource = imageSourceProbe(executable);
  if (canonicalJsonV1(observedSource) !== canonicalJsonV1([RC5_PROVIDER_WORKER_SOURCE, RC5_PROXY_SOURCE, RC5_PROVIDER_FREE_SIMULATOR_SOURCE])) {
    reject('RC5_IMAGE_IDENTITY', 'Executor worker or proxy source differs from the pinned source identity.', 2);
  }
  return Object.freeze({ id: image.Id, reference: RC5_EXECUTOR_IMAGE, worker_source: RC5_PROVIDER_WORKER_SOURCE });
}

function mount(source, target, readOnly = false, type = 'bind') {
  return ['--mount', `type=${type},source=${source},target=${target}${readOnly ? ',readonly' : ''}`];
}

function commonContainerArgs(name, networkMode, logDriver = 'none') {
  const authority = RC5_CONTAINER_RUN_AUTHORITY_V1.docker;
  const nofile = authority.ulimits.find((item) => item.Name === 'nofile');
  const args = [
    'create', '--name', name, `--pull=${authority.pull_policy}`,
    ...(authority.read_only_rootfs ? ['--read-only'] : []),
    ...authority.capability_drops.flatMap((value) => [`--cap-drop=${value}`]),
    ...authority.security_options.flatMap((value) => [`--security-opt=${value}`]),
    `--pids-limit=${authority.pid_limit}`, `--memory=${authority.memory_limit_bytes}`,
    `--cpus=${authority.cpu_limit_nanos / 1_000_000_000}`,
    `--ulimit=${nofile.Name}=${nofile.Soft}:${nofile.Hard}`, `--ipc=${authority.ipc_mode}`,
    `--user=${authority.container_user}`, '--network', networkMode,
    '--tmpfs', `${authority.tmpfs.destination}:${authority.tmpfs.options}`,
    '--label', `${authority.contract_label.name}=${authority.contract_label.value}`,
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

function projectUniqueRawEnvironment(entries) {
  if (!Array.isArray(entries)) reject('RC5_RUNTIME_AUTHORITY', 'Worker raw environment is unavailable.', 2);
  const values = {};
  const keys = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') reject('RC5_RUNTIME_AUTHORITY', 'Worker raw environment contains a non-string entry.', 2);
    const boundary = entry.indexOf('=');
    const key = boundary > 0 ? entry.slice(0, boundary) : '';
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) || Object.hasOwn(values, key)) {
      reject('RC5_RUNTIME_AUTHORITY', 'Worker raw environment contains an invalid or duplicate key.', 2);
    }
    keys.push(key);
    values[key] = entry.slice(boundary + 1);
  }
  return Object.freeze({ keys: Object.freeze(keys), values: Object.freeze(values) });
}

function validateContainerRunInspectObservation(inspect, options = {}) {
  const manifest = RC5_CONTAINER_RUN_AUTHORITY_V1;
  const authority = manifest.docker;
  const expectedNetwork = options.expectedNetwork;
  const sources = options.mountSources;
  if (typeof expectedNetwork !== 'string' || !expectedNetwork.startsWith('container:') ||
      sources === null || typeof sources !== 'object' || Array.isArray(sources) ||
      canonicalJsonV1(Object.keys(sources).sort()) !== canonicalJsonV1(manifest.mounts.map((item) => item.source_key).sort())) {
    reject('RC5_RUNTIME_AUTHORITY', 'Worker inspect validation inputs differ from the authority manifest.', 2);
  }
  const rawEnvironment = projectUniqueRawEnvironment(inspect?.Config?.Env);
  const exactEnvironment = manifest.environment.exact;
  const allowedEnvironment = new Set([...Object.keys(exactEnvironment), ...manifest.environment.allowed_additional_keys]);
  if (rawEnvironment.keys.some((key) => !allowedEnvironment.has(key)) ||
      Object.entries(exactEnvironment).some(([key, value]) => rawEnvironment.values[key] !== value) ||
      rawEnvironment.keys.some((key) => manifest.environment.allowed_additional_keys.includes(key) &&
        (typeof rawEnvironment.values[key] !== 'string' || rawEnvironment.values[key].length === 0))) {
    reject('RC5_RUNTIME_AUTHORITY', 'Worker environment differs from the authority manifest.', 2);
  }
  const observedNetworks = Object.keys(inspect?.NetworkSettings?.Networks ?? {}).sort();
  const expectedMounts = manifest.mounts.map((item) => ({
    destination: item.destination,
    mode: item.mode,
    source: sources[item.source_key],
    type: item.type,
  }));
  const exactDockerKeys = (value, defaults, dynamicFields) => value !== null && typeof value === 'object' &&
    canonicalJsonV1(Object.keys(value).sort()) === canonicalJsonV1([...Object.keys(defaults), ...dynamicFields].sort());
  if (!exactDockerKeys(inspect?.Config, authority.config_defaults, authority.config_dynamic_fields) ||
      !exactDockerKeys(inspect?.HostConfig, authority.host_config_defaults, authority.host_config_dynamic_fields)) {
    reject('RC5_RUNTIME_AUTHORITY', 'Worker Docker inspection contains an unknown or omitted authority field.', 2);
  }
  const configDefaultChecks = Object.fromEntries(Object.entries(authority.config_defaults).map(([field, expected]) => [
    `config_default:${field}`,
    inspect?.Config !== null && typeof inspect?.Config === 'object' && Object.hasOwn(inspect.Config, field) &&
      canonicalJsonV1(inspect.Config[field]) === canonicalJsonV1(expected),
  ]));
  const configAbsentChecks = Object.fromEntries(authority.config_absent_fields.map((field) => [
    `config_absent:${field}`,
    inspect?.Config !== null && typeof inspect?.Config === 'object' && !Object.hasOwn(inspect.Config, field),
  ]));
  const hostConfigDefaultChecks = Object.fromEntries(Object.entries(authority.host_config_defaults).map(([field, expected]) => [
    `host_config_default:${field}`,
    inspect?.HostConfig !== null && typeof inspect?.HostConfig === 'object' && Object.hasOwn(inspect.HostConfig, field) &&
      canonicalJsonV1(inspect.HostConfig[field]) === canonicalJsonV1(expected),
  ]));
  const hostConfigAbsentChecks = Object.fromEntries(authority.host_config_absent_fields.map((field) => [
    `host_config_absent:${field}`,
    inspect?.HostConfig !== null && typeof inspect?.HostConfig === 'object' && !Object.hasOwn(inspect.HostConfig, field),
  ]));
  const checks = {
    ...configAbsentChecks,
    ...configDefaultChecks,
    ...hostConfigAbsentChecks,
    ...hostConfigDefaultChecks,
    image: inspect?.Config?.Image === RC5_EXECUTOR_IMAGE_ID && inspect?.Image === RC5_EXECUTOR_IMAGE_ID,
    hostname: typeof inspect?.Config?.Hostname === 'string' && new RegExp(authority.hostname_pattern, 'u').test(inspect.Config.Hostname),
    user: inspect?.Config?.User === authority.container_user,
    working_directory: inspect?.Config?.WorkingDir === manifest.identity.working_directory,
    entrypoint: JSON.stringify(inspect?.Config?.Entrypoint) === JSON.stringify([manifest.entrypoint]),
    command: JSON.stringify(inspect?.Config?.Cmd) === JSON.stringify(workerArguments()),
    contract_label: inspect?.Config?.Labels?.[authority.contract_label.name] === authority.contract_label.value,
    readonly_rootfs: inspect?.HostConfig?.ReadonlyRootfs === authority.read_only_rootfs,
    privileged: inspect?.HostConfig?.Privileged === authority.privileged,
    capability_additions: inspect?.HostConfig?.CapAdd === authority.capability_additions,
    capability_drops: JSON.stringify(inspect?.HostConfig?.CapDrop) === JSON.stringify(authority.capability_drops),
    binds: inspect?.HostConfig?.Binds === authority.binds,
    devices: JSON.stringify(inspect?.HostConfig?.Devices) === JSON.stringify(authority.devices),
    device_requests: inspect?.HostConfig?.DeviceRequests === authority.device_requests,
    volumes_from: inspect?.HostConfig?.VolumesFrom === authority.volumes_from,
    runtime: inspect?.HostConfig?.Runtime === authority.runtime,
    pid_namespace: inspect?.HostConfig?.PidMode === authority.pid_namespace_mode,
    uts_namespace: inspect?.HostConfig?.UTSMode === authority.uts_namespace_mode,
    user_namespace: inspect?.HostConfig?.UsernsMode === authority.user_namespace_mode,
    cgroup_namespace: inspect?.HostConfig?.CgroupnsMode === authority.cgroup_namespace_mode,
    restart_policy: canonicalJsonV1(inspect?.HostConfig?.RestartPolicy) === canonicalJsonV1(authority.restart_policy),
    ulimits: canonicalJsonV1(inspect?.HostConfig?.Ulimits) === canonicalJsonV1(authority.ulimits),
    log_config: canonicalJsonV1(inspect?.HostConfig?.LogConfig) === canonicalJsonV1(authority.log_config),
    security_options: JSON.stringify(inspect?.HostConfig?.SecurityOpt) === JSON.stringify(authority.security_options),
    pid_limit: inspect?.HostConfig?.PidsLimit === authority.pid_limit,
    ipc_mode: inspect?.HostConfig?.IpcMode === authority.ipc_mode,
    memory_limit: inspect?.HostConfig?.Memory === authority.memory_limit_bytes,
    cpu_limit: inspect?.HostConfig?.NanoCpus === authority.cpu_limit_nanos,
    tmpfs: canonicalJsonV1(inspect?.HostConfig?.Tmpfs) === canonicalJsonV1({
      [authority.tmpfs.destination]: authority.tmpfs.options,
    }),
    network_mode: inspect?.HostConfig?.NetworkMode === expectedNetwork,
    attached_networks: observedNetworks.length === manifest.network.worker_attached_network_count,
    exposed_ports: (inspect?.Config?.ExposedPorts ?? null) === authority.exposed_ports,
  };
  const mismatches = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => name);
  if (mismatches.length > 0) {
    reject('RC5_RUNTIME_AUTHORITY', `Worker Docker inspection differs at: ${mismatches.join(',')}.`, 2);
  }
  exactMounts(inspect, expectedMounts);
  return Object.freeze({
    manifest_id: manifest.manifest_id,
    manifest_sha256: RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256,
    raw_environment_keys: rawEnvironment.keys,
    valid: true,
  });
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

function createLayout(root, lockDirectory, providerFree = false) {
  const input = join(root, 'input');
  const output = join(root, 'output');
  const simulator = providerFree ? join(root, 'simulator') : null;
  for (const directory of [input, output]) {
    if (!existsSync(directory)) mkdirSync(directory);
  }
  if (simulator !== null) mkdirSync(simulator);
  return Object.freeze({ input, locks: lockDirectory, output, root, simulator });
}

function writeCanonicalExclusive(filePath, value) {
  writeFileSync(filePath, Buffer.from(canonicalJsonV1(value), 'utf8'), { flag: 'wx', mode: 0o600 });
}

function workerArguments() {
  return [
    ...RC5_CONTAINER_RUN_AUTHORITY_V1.exec_argv,
    RC5_CONTAINER_RUN_AUTHORITY_V1.identity.script_path,
    ...RC5_CONTAINER_RUN_AUTHORITY_V1.application_argv,
  ];
}

function supportingWorkerArguments(command) {
  const authority = RC5_CONTAINER_RUN_AUTHORITY_V1.supporting_invocations[command];
  if (authority === undefined) reject('RC5_RUNTIME_AUTHORITY', 'A supporting worker invocation is not registered.', 2);
  return [...authority.exec_argv, RC5_CONTAINER_RUN_AUTHORITY_V1.identity.script_path, ...authority.application_argv];
}

export async function preflightDockerProviderCredential(options = {}) {
  if (process.platform !== 'win32') reject('RC5_EXECUTOR_PLATFORM', 'The credential preflight requires Windows Docker Desktop.', 2);
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const credentialHome = ensureClosedCredentialHome(options.credentialHome);
  const credentialLockHome = ensureCredentialLockHome(options.credentialLockHome);
  const output = ensureEmptyRuntimeRoot(options.outputRoot);
  assertExecutionRoots(output, credentialHome, credentialLockHome);
  verifyDockerHost(executable);
  verifyImage(executable);
  secureCredential(executable, credentialHome);
  const authority = RC5_CONTAINER_RUN_AUTHORITY_V1.supporting_invocations['container-auth-status'];
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=268435456', '--cpus=1', '--user=65532:65532', '--log-driver=none',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
    ...Object.entries(authority.environment.exact).map(([key, value]) => `--env=${key}=${value}`),
    ...mount(credentialHome, '/credentials'), ...mount(credentialLockHome, '/locks'), ...mount(output, '/output'),
    `--entrypoint=${RC5_CONTAINER_RUN_AUTHORITY_V1.entrypoint}`,
    `--workdir=${RC5_CONTAINER_RUN_AUTHORITY_V1.identity.working_directory}`,
    RC5_EXECUTOR_IMAGE_ID, ...supportingWorkerArguments('container-auth-status'),
  ], { code: 'RC5_CREDENTIAL_PREFLIGHT', timeoutMs: 60_000 });
  if (canonicalJsonV1(readdirSync(output).sort()) !== canonicalJsonV1(['authentication-status.json'])) {
    reject('RC5_CREDENTIAL_PREFLIGHT', 'Credential preflight output topology differs from the closed contract.', 2);
  }
  const bytes = readBoundedNativeFile(output, 'authentication-status.json', MAX_RESULT_BYTES);
  const value = parseJson(bytes.toString('utf8'), 'RC5_CREDENTIAL_PREFLIGHT', 'Credential preflight result');
  if (!bytes.equals(Buffer.from(canonicalJsonV1(value), 'utf8')) ||
      !exactKeys(value, ['configured', 'durable_decoded', 'lock_acquired', 'selected_reference_present', 'source', 'unexpected_reference_count', 'writable']) ||
      value.configured !== true || value.selected_reference_present !== true || value.unexpected_reference_count !== 0 ||
      value.durable_decoded !== true || value.lock_acquired !== true || value.writable !== true ||
      typeof value.source !== 'string' || value.source.length === 0 || readdirSync(credentialLockHome).length !== 0) {
    reject('RC5_CREDENTIAL_PREFLIGHT', 'The reusable OAuth store is unavailable, shadowed, or not writable.', 2);
  }
  return Object.freeze({
    configured: true,
    credential_bytes_read_by_host: 0,
    credential_copied: false,
    credential_mounted: 'read_write',
    durable_decoded: true,
    lock_acquired: true,
    lock_home: 'external_durable_sibling',
    provider_calls: 0,
    source: value.source,
    writable: true,
  });
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

function syntheticOauthYaml() {
  const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const accountId = 'acct_rc5_exact_path_provider_free';
  const access = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    'https://api.openai.com/auth': { chatgpt_account_id: accountId },
  })}.provider-free-signature`;
  const credential = JSON.stringify({
    access,
    accountId,
    expires: 4_102_444_800_000,
    refresh: 'rc5-exact-path-provider-free-refresh',
    type: 'oauth',
  });
  return `OPENAI_CODEX_OAUTH: '${credential.replaceAll("'", "''")}'\n`;
}

function createProviderFreeState(probeRoot, request, ordinal, transportMode) {
  const id = `${request.scenario_id}-${transportMode}`;
  const credentials = join(probeRoot, 'synthetic-credentials', id);
  const locks = join(probeRoot, 'synthetic-locks', id);
  const stateRoot = join(probeRoot, 'exact-container-run', id);
  const runtimeParent = join(stateRoot, 'runtime');
  const ledger = probeLedger(request, ordinal);
  const runtimeRoot = join(runtimeParent, ledger.reservation.runtime_id);
  for (const directory of [credentials, locks, stateRoot, runtimeParent, runtimeRoot, join(stateRoot, 'reservations'), join(stateRoot, 'dispatches')]) {
    mkdirSync(directory, { recursive: false });
  }
  writeFileSync(join(credentials, '.credentials.yaml'), syntheticOauthYaml(), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  writeCanonicalExclusive(join(stateRoot, 'reservations', `${request.scenario_id}.json`), ledger.reservation);
  writeCanonicalExclusive(join(stateRoot, 'dispatches', `${request.scenario_id}.json`), ledger.dispatch);
  return Object.freeze({ credentials, ledger, locks, runtimeRoot, stateRoot });
}

function removeProviderFreeState(probeRoot, state) {
  const root = resolve(probeRoot);
  const lockWasEmpty = readdirSync(state.locks).length === 0;
  for (const candidate of [state.credentials, state.locks, state.stateRoot]) {
    const target = resolve(candidate);
    const relation = relative(root, target);
    if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
      reject('RC5_EXECUTOR_PROBE_CLEANUP', 'A provider-free cleanup target escaped the disposable probe root.', 2);
    }
    const info = lstatSync(target);
    if (!info.isDirectory() || info.isSymbolicLink() || portablePath(realpathSync.native(target)) !== portablePath(target)) {
      reject('RC5_EXECUTOR_PROBE_CLEANUP', 'A provider-free cleanup target is not a resolved disposable directory.', 2);
    }
    rmSync(target, { force: false, recursive: true });
  }
  if (!lockWasEmpty) reject('RC5_EXECUTOR_PROBE_CLEANUP', 'The synthetic credential lock directory was not empty after execution.', 2);
}

function validateExactProviderFreeResult(value, request, transportMode) {
  const expectedCompletion = transportMode === 'provider_free_success' ? 'completed' : 'failed';
  const expectedFinish = transportMode === 'provider_free_success' ? 'stop' : 'error';
  const expectedStatus = transportMode === 'provider_free_success' ? 200 : 503;
  const expectedCategory = transportMode === 'provider_free_success' ? null : 'UNAVAILABLE';
  const expectedStage = transportMode === 'provider_free_success' ? null : 'adapter_terminal';
  if (value?.schema_version !== '1.0.0' || value?.transport_mode !== transportMode || value?.completion !== expectedCompletion ||
      value?.trusted_completed !== (expectedCompletion === 'completed') || value?.finish_reason !== expectedFinish ||
      value?.response_http_status !== expectedStatus || value?.error_category !== expectedCategory || value?.failure_stage !== expectedStage ||
      value?.direct_adapter_invocations !== 1 || value?.provider_request_count !== 1 || value?.oauth_refresh_count !== 0 ||
      value?.responses_endpoint !== RESPONSES_ENDPOINT || !Array.isArray(value?.external_mutations) || value.external_mutations.length !== 0 ||
      (expectedCompletion === 'completed' && (typeof value.artifact !== 'string' || value.artifact.length === 0)) ||
      (expectedCompletion === 'failed' && value.artifact !== null) || value?.simulator_observation?.provider_calls !== 0 ||
      value.simulator_observation?.request_count !== 1 || value.simulator_observation?.body_sha256 === undefined ||
      request.execution.max_output_tokens !== 4_000) {
    reject('RC5_EXECUTOR_PROBE', 'The exact container-run provider-free result differs from the bounded contract.', 2);
  }
  return Object.freeze({
    completion: value.completion,
    direct_adapter_invocations: value.direct_adapter_invocations,
    error_category: value.error_category,
    failure_stage: value.failure_stage,
    finish_reason: value.finish_reason,
    oauth_refresh_count: value.oauth_refresh_count,
    payload_sha256: value.simulator_observation.body_sha256,
    provider_request_count: value.provider_request_count,
    response_http_status: value.response_http_status,
    simulator_response_status: value.simulator_observation.response_status,
    transport_mode: value.transport_mode,
  });
}

export async function probeDockerProviderExecutor(options = {}) {
  if (process.platform !== 'win32') reject('RC5_EXECUTOR_PLATFORM', 'The provider-free executor probe requires Windows Docker Desktop.', 2);
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const probeRoot = ensureEmptyRuntimeRoot(options.probeRoot);
  if (!Array.isArray(options.requests) || options.requests.length !== 3) reject('RC5_EXECUTOR_PROBE', 'The executor probe requires all three RC-5 requests.', 2);
  verifyDockerHost(executable);
  const image = verifyImage(executable);
  mkdirSync(join(probeRoot, 'synthetic-credentials'));
  mkdirSync(join(probeRoot, 'synthetic-locks'));
  mkdirSync(join(probeRoot, 'exact-container-run'));
  const captures = [];
  for (let ordinal = 0; ordinal < options.requests.length; ordinal += 1) {
    const request = validateRequest(options.requests[ordinal]);
    for (const transportMode of RC5_CONTAINER_RUN_AUTHORITY_V1.transport_modes.provider_free) {
      const state = createProviderFreeState(probeRoot, request, ordinal, transportMode);
      let capture;
      let prepared;
      let primaryError;
      try {
        prepared = await prepareDockerExecution({
          credentialHome: state.credentials,
          credentialLockHome: state.locks,
          dockerExecutable: executable,
          providerAuthority: RC5_PROVIDER_AUTHORITY,
          request,
          reservation: state.ledger.reservation,
          runtimeId: state.ledger.reservation.runtime_id,
          runtimeRoot: state.runtimeRoot,
          stateRoot: state.stateRoot,
          timeoutMs: MAX_TIMEOUT_MS,
        }, Object.freeze({ authorityMode: 'provider_free', transportMode }));
        const result = await prepared.invoke({ dispatch: state.ledger.dispatch });
        capture = Object.freeze({
          ...validateExactProviderFreeResult(result, request, transportMode),
          scenario_id: request.scenario_id,
        });
      } catch (error) {
        primaryError = error;
      }
      try { prepared?.cleanup(); } catch (error) { primaryError ??= error; }
      try { removeProviderFreeState(probeRoot, state); } catch (error) { primaryError ??= error; }
      if (primaryError !== undefined) throw primaryError;
      captures.push(capture);
    }
  }
  return Object.freeze({
    captures: Object.freeze(captures),
    authority_manifest: Object.freeze({ id: RC5_CONTAINER_RUN_AUTHORITY_V1.manifest_id, sha256: RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256 }),
    credential_mounted: 'synthetic_only',
    exact_container_run: true,
    image,
    network: 'docker_internal_simulator',
    production_fetch_tls_leg_exercised: false,
    provider_calls: 0,
    proxy_source: RC5_PROXY_SOURCE,
    simulator_source: RC5_PROVIDER_FREE_SIMULATOR_SOURCE,
    schema_version: '1.0.0',
    status: 'validated_provider_free',
    tls_validation_exercised: false,
    worker_source: RC5_PROVIDER_WORKER_SOURCE,
  });
}

function allocateAuthorityResources(nonce) {
  if (typeof nonce !== 'string' || !/^[a-f0-9]{16}$/u.test(nonce)) reject('RC5_RUNTIME_AUTHORITY', 'Authority resource nonce is invalid.', 2);
  const names = Object.freeze({
    network: `rc5-exec-net-${nonce}`,
    proxy: `rc5-exec-proxy-${nonce}`,
    relay: `rc5-exec-relay-${nonce}`,
    simulator: `rc5-exec-simulator-${nonce}`,
    socket: `rc5-exec-socket-${nonce}`,
    worker: `rc5-exec-worker-${nonce}`,
  });
  return Object.seal({
    creation: {
      network: 'pending',
      proxy: 'pending',
      relay: 'pending',
      simulator: 'pending',
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
    ['network', 'proxy', 'relay', 'simulator', 'socket', 'worker'].every((key) => resources.creation[key] === 'absent'));
}

function containmentMayRelease(cleanupObservation, resources) {
  return cleanupObservation?.cleaned === true && authorityCreationReconciled(resources);
}

function createAuthority(executable, resources, deadlineMs, providerFree = null) {
  const { names } = resources;
  resources.creation.state = 'creating';
  resources.creation.socket = 'creating';
  docker(executable, ['volume', 'create', '--label', `${CONTRACT_LABEL}=${CONTRACT_ID}`, names.socket], { code: 'RC5_AUTHORITY_VOLUME', deadlineMs });
  resources.creation.socket = 'created';
  resources.creation.network = 'creating';
  const networkArgs = ['network', 'create', '--driver', 'bridge', '--label', `${CONTRACT_LABEL}=${CONTRACT_ID}`];
  if (providerFree !== null) networkArgs.push('--internal', '--subnet=11.254.250.0/29');
  networkArgs.push(names.network);
  docker(executable, networkArgs, { code: 'RC5_AUTHORITY_NETWORK', deadlineMs });
  resources.creation.network = 'created';
  if (providerFree !== null) {
    const network = dockerJson(executable, ['network', 'inspect', names.network], 'RC5_SIMULATOR_NETWORK', 'Simulator network inspection', { deadlineMs });
    const ipam = network?.[0]?.IPAM?.Config;
    if (!Array.isArray(network) || network.length !== 1 || network[0]?.Internal !== true || network[0]?.Driver !== 'bridge' ||
        !Array.isArray(ipam) || ipam.length !== 1 || ipam[0]?.Subnet !== '11.254.250.0/29' ||
        ipam[0]?.Gateway !== '11.254.250.1') {
      reject('RC5_SIMULATOR_NETWORK', 'The provider-free network is not the sealed internal subnet.', 2);
    }
  }
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--cap-add=CHOWN', '--cap-add=FOWNER',
    '--security-opt=no-new-privileges', '--user=0:0', ...mount(names.socket, '/run/rc3-socket', false, 'volume'),
    '--entrypoint=/usr/local/bin/node', RC5_EXECUTOR_IMAGE_ID, SOCKET_INIT_SCRIPT,
  ], { code: 'RC5_AUTHORITY_SOCKET_INIT', deadlineMs });
  if (providerFree !== null) {
    resources.creation.simulator = 'creating';
    const simulatorArgs = [
      ...commonContainerArgs(names.simulator, names.network, 'local'), '--network-alias=chatgpt.com', '--ip=11.254.250.2',
      ...mount(providerFree.outputDirectory, '/output'), `--entrypoint=${RC5_CONTAINER_RUN_AUTHORITY_V1.entrypoint}`,
      RC5_EXECUTOR_IMAGE_ID, SIMULATOR_SCRIPT, 'simulator', '--mode', providerFree.mode,
      '--output', '/output/simulator-observation.json',
    ];
    docker(executable, simulatorArgs, { code: 'RC5_SIMULATOR_CREATE', deadlineMs });
    resources.creation.simulator = 'created';
    const simulator = inspectContainer(executable, names.simulator, deadlineMs);
    verifyBaseAuthority(simulator, names.network,
      [SIMULATOR_SCRIPT, 'simulator', '--mode', providerFree.mode, '--output', '/output/simulator-observation.json'],
      { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '1m' } });
    exactMounts(simulator, [{ destination: '/output', mode: 'rw', source: providerFree.outputDirectory, type: 'bind' }]);
    if (JSON.stringify(simulator.Config?.Entrypoint) !== JSON.stringify([RC5_CONTAINER_RUN_AUTHORITY_V1.entrypoint]) ||
        simulator.Config?.WorkingDir !== RC5_CONTAINER_RUN_AUTHORITY_V1.identity.working_directory) {
      reject('RC5_SIMULATOR_AUTHORITY', 'The provider-free simulator differs from its closed network identity.', 2);
    }
    docker(executable, ['start', names.simulator], { code: 'RC5_SIMULATOR_START', deadlineMs });
    waitForLog(executable, names.simulator, 'simulator_ready', deadlineMs);
    const runningSimulator = inspectContainer(executable, names.simulator, deadlineMs);
    const simulatorNetwork = runningSimulator.NetworkSettings?.Networks?.[names.network];
    if (runningSimulator.State?.Running !== true || simulatorNetwork?.IPAddress !== '11.254.250.2' ||
        !Array.isArray(simulatorNetwork?.Aliases) ||
        !simulatorNetwork.Aliases.some((alias) => alias === 'chatgpt.com')) {
      reject('RC5_SIMULATOR_AUTHORITY', 'The provider-free simulator did not enter its closed network identity.', 2);
    }
    resources.creation.simulator = 'ready';
  }
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
  const manifest = RC5_CONTAINER_RUN_AUTHORITY_V1;
  const mountSources = {
    credential_home: paths.credentialHome,
    input_directory: paths.layout.input,
    lock_directory: paths.layout.locks,
    output_directory: paths.layout.output,
  };
  const args = [
    ...commonContainerArgs(resources.names.worker, `container:${resources.relayId}`),
    ...Object.entries(manifest.environment.exact).map(([key, value]) => `--env=${key}=${value}`),
    ...manifest.mounts.flatMap((item) => mount(mountSources[item.source_key], item.destination, item.mode === 'ro', item.type)),
    `--entrypoint=${manifest.entrypoint}`, `--workdir=${manifest.identity.working_directory}`,
    RC5_EXECUTOR_IMAGE_ID, ...workerArguments(),
  ];
  docker(executable, args, { code: 'RC5_WORKER_CREATE', deadlineMs });
  resources.creation.worker = 'created';
  const inspect = inspectContainer(executable, resources.names.worker, deadlineMs);
  validateContainerRunInspectObservation(inspect, { expectedNetwork: `container:${resources.relayId}`, mountSources });
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

function cleanupAuthority(executable, resources, deadlineMs = Number.POSITIVE_INFINITY, runBestEffort = dockerBestEffort) {
  if (!resources?.names) return Object.freeze({ cleaned: true, inspection_error_count: 0 });
  if (typeof runBestEffort !== 'function') reject('RC5_CLEANUP_INCOMPLETE', 'The cleanup authority runner is invalid.', 2);
  resources.creation.state = 'cleanup_in_progress';
  const remainingTimeout = () => boundedDeadlineTimeout(deadlineMs, 5_000);
  for (const name of [resources.names.worker, resources.names.relay, resources.names.proxy, resources.names.simulator]) {
    runBestEffort(executable, ['rm', '--force', name], Math.max(1, remainingTimeout()), deadlineMs);
  }
  runBestEffort(executable, ['network', 'rm', resources.names.network], Math.max(1, remainingTimeout()), deadlineMs);
  runBestEffort(executable, ['volume', 'rm', resources.names.socket], Math.max(1, remainingTimeout()), deadlineMs);
  const inspections = [
    ['container', resources.names.worker], ['container', resources.names.relay], ['container', resources.names.proxy], ['container', resources.names.simulator],
    ['network', resources.names.network], ['volume', resources.names.socket],
  ].map(([kind, name]) => ({ kind, name, result: runBestEffort(executable, [kind, 'inspect', name], Math.max(1, remainingTimeout()), deadlineMs) }));
  const errors = inspections.filter((entry) => !strictNotFound(entry.kind, entry.name, entry.result)).length;
  resources.creation.state = errors === 0 ? 'reconciled_absent' : 'cleanup_incomplete';
  if (errors === 0) {
    for (const key of ['network', 'proxy', 'relay', 'simulator', 'socket', 'worker']) resources.creation[key] = 'absent';
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

function readProviderFreeSimulatorObservation(layout, mode, deadlineMs = Number.POSITIVE_INFINITY) {
  assertBeforeDeadline(deadlineMs, 'Provider-free simulator observation');
  if (layout.simulator === null) reject('RC5_SIMULATOR_OBSERVATION', 'The simulator output directory is unavailable.', 2);
  if (canonicalJsonV1(readdirSync(layout.simulator).sort()) !== canonicalJsonV1(['simulator-observation.json'])) {
    reject('RC5_SIMULATOR_OBSERVATION', 'The simulator output topology differs from the sealed contract.', 2);
  }
  const bytes = readBoundedNativeFile(layout.simulator, 'simulator-observation.json', MAX_RESULT_BYTES);
  const value = parseJson(bytes.toString('utf8'), 'RC5_SIMULATOR_OBSERVATION', 'Simulator observation');
  const keys = ['body_byte_count', 'body_sha256', 'failure_code', 'header_count', 'header_names', 'mode', 'provider_calls',
    'request_count', 'response_status', 'schema_version', 'status'];
  const expectedMode = mode === 'provider_free_success' ? 'success' : 'failure';
  if (!exactKeys(value, keys) || !bytes.equals(Buffer.from(canonicalJsonV1(value), 'utf8')) ||
      value.schema_version !== '1.0.0' || value.mode !== expectedMode || value.status !== 'completed' ||
      value.failure_code !== null || value.provider_calls !== 0 || value.request_count !== 1 ||
      value.response_status !== (expectedMode === 'success' ? 200 : 503) ||
      !Number.isInteger(value.body_byte_count) || value.body_byte_count < 1 || value.body_byte_count > 1_048_576 ||
      !/^[a-f0-9]{64}$/u.test(value.body_sha256 || '') || !Array.isArray(value.header_names) ||
      value.header_count !== value.header_names.length || value.header_names.some((name) => typeof name !== 'string') ||
      !value.header_names.includes('content-length') || !value.header_names.includes('content-type') || !value.header_names.includes('host')) {
    reject('RC5_SIMULATOR_OBSERVATION', 'The simulator observation differs from one bounded request.', 2);
  }
  if (value.header_names.filter((name) => name === 'authorization').length !== 1) {
    reject('RC5_SIMULATOR_OBSERVATION', 'The simulator did not observe exactly one credential-populated authorization header name.', 2);
  }
  assertBeforeDeadline(deadlineMs, 'Provider-free simulator observation');
  return Object.freeze(value);
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateWorkerResult(bytes, request, transportMode = 'live') {
  if (CREDENTIAL_PATTERN.test(bytes.toString('utf8'))) reject('RC5_CREDENTIAL_LEAK', 'Credential-shaped worker output was blocked.', 2);
  const result = parseJson(bytes.toString('utf8'), 'RC5_WORKER_OUTPUT', 'Worker result');
  const keys = ['schema_version', 'completion', 'trusted_completed', 'finish_reason', 'input_tokens', 'output_tokens', 'wall_ms',
    'direct_adapter_invocations', 'provider_request_count', 'oauth_refresh_count', 'response_http_status', 'responses_endpoint',
    'error_category', 'external_mutations', 'failure_stage', 'transport_mode'];
  if (!exactKeys(result, keys) || !bytes.equals(Buffer.from(canonicalJsonV1(result), 'utf8')) || result.schema_version !== '1.0.0' ||
      !['completed', 'failed', 'timed_out'].includes(result.completion) || result.trusted_completed !== (result.completion === 'completed') ||
      !['stop', 'max_tokens', 'aborted', 'error', 'malformed'].includes(result.finish_reason) ||
      !(result.input_tokens === 'not_reported' || (Number.isInteger(result.input_tokens) && result.input_tokens >= 0)) ||
      !(result.output_tokens === 'not_reported' || (Number.isInteger(result.output_tokens) && result.output_tokens >= 0 && result.output_tokens <= 4_000)) ||
      !Number.isInteger(result.wall_ms) || result.wall_ms < 0 || result.wall_ms > MAX_TIMEOUT_MS ||
      result.direct_adapter_invocations !== 1 || ![0, 1].includes(result.provider_request_count) || ![0, 1].includes(result.oauth_refresh_count) ||
      !(result.response_http_status === null || (Number.isInteger(result.response_http_status) && result.response_http_status >= 100 && result.response_http_status <= 599)) ||
      !(result.error_category === null || ERROR_CATEGORIES.has(result.error_category)) ||
      !(result.failure_stage === null || FAILURE_STAGES.has(result.failure_stage)) ||
      result.responses_endpoint !== RESPONSES_ENDPOINT || !Array.isArray(result.external_mutations) || result.external_mutations.length !== 0 ||
      result.transport_mode !== transportMode ||
      (result.completion === 'completed' && (result.provider_request_count !== 1 || result.finish_reason !== 'stop' ||
        result.response_http_status === null || result.response_http_status < 200 || result.response_http_status > 299 ||
        result.error_category !== null || result.failure_stage !== null)) ||
      (result.finish_reason === 'error' && (result.error_category === null || result.failure_stage === null)) ||
      (result.failure_stage === 'fetch_transport' && result.response_http_status !== null) ||
      request.execution.max_output_tokens !== 4_000) {
    reject('RC5_WORKER_OUTPUT', 'Worker result violates the bounded result contract.', 2);
  }
  return Object.freeze(result);
}

function validateExternalTopology(layout, credentialHome, expectedInput, expectedTraces, deadlineMs = Number.POSITIVE_INFINITY) {
  assertBeforeDeadline(deadlineMs, 'External topology validation');
  const rootNames = readdirSync(layout.root).sort();
  const expectedRootNames = ['authority-proxy-events.json', 'authority-relay-events.json', 'input', 'output',
    ...(layout.simulator === null ? [] : ['simulator'])].sort();
  if (canonicalJsonV1(rootNames) !== canonicalJsonV1(expectedRootNames) ||
      canonicalJsonV1(readdirSync(layout.input).sort()) !== canonicalJsonV1(['worker-input.json']) ||
      canonicalJsonV1(readdirSync(credentialHome).sort()) !== canonicalJsonV1(['.credentials.yaml'])) {
    reject('RC5_EXTERNAL_TOPOLOGY', 'External runtime or credential topology contains an unexpected entry.', 2);
  }
  for (const directory of [layout.input, layout.locks, layout.output, ...(layout.simulator === null ? [] : [layout.simulator])]) {
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

function collectResultEvidence(layout, request, exitCode, state, traces, credentialProtected, transportMode = 'live',
  deadlineMs = Number.POSITIVE_INFINITY) {
  assertBeforeDeadline(deadlineMs, 'Worker result collection');
  const names = readdirSync(layout.output).sort();
  if (names.some((name) => !['assistant-output.md', 'worker-result.json'].includes(name)) || !names.includes('worker-result.json')) {
    reject('RC5_WORKER_OUTPUT', 'Worker output topology differs from the bounded contract.', 2);
  }
  const resultBytes = readBoundedNativeFile(layout.output, 'worker-result.json', MAX_RESULT_BYTES);
  const result = validateWorkerResult(resultBytes, request, transportMode);
  const artifactBytes = readBoundedNativeFile(layout.output, 'assistant-output.md', MAX_ARTIFACT_BYTES, false);
  if ((result.completion === 'completed') !== (artifactBytes !== null && artifactBytes.length > 0) ||
      (artifactBytes !== null && CREDENTIAL_PATTERN.test(artifactBytes.toString('utf8')))) {
    reject('RC5_WORKER_OUTPUT', 'Worker artifact differs from the trusted completion state.', 2);
  }
  if (traces.proxy.responses_admitted !== result.provider_request_count || traces.proxy.oauth_admitted !== result.oauth_refresh_count ||
      traces.relay.accepted_connections !== traces.proxy.responses_admitted + traces.proxy.oauth_admitted ||
      state?.OOMKilled !== false || state?.Running !== false || !credentialProtected || exitCode !== 0) {
    reject('RC5_EXECUTOR_RECONCILIATION', 'Worker, authority, credential, or exit observations do not reconcile.', 2);
  }
  assertBeforeDeadline(deadlineMs, 'Worker result collection');
  return Object.freeze({ artifact: artifactBytes === null ? null : artifactBytes.toString('utf8'), result });
}

function reconcileResultEvidence(evidence, cleanup, hostWallMs) {
  if (evidence === null || typeof evidence !== 'object' || evidence.result === null || typeof evidence.result !== 'object' ||
      cleanup?.cleaned !== true || !Number.isInteger(hostWallMs) || hostWallMs < 0 || hostWallMs > MAX_TIMEOUT_MS) {
    reject('RC5_EXECUTOR_RECONCILIATION', 'Worker evidence and verified cleanup do not reconcile.', 2);
  }
  const result = evidence.result;
  return Object.freeze({
    artifact: evidence.artifact,
    completion: result.completion,
    direct_adapter_invocations: result.direct_adapter_invocations,
    error_category: result.error_category,
    external_mutations: result.external_mutations,
    failure_stage: result.failure_stage,
    finish_reason: result.finish_reason,
    input_tokens: result.input_tokens,
    oauth_refresh_count: result.oauth_refresh_count,
    output_tokens: result.output_tokens,
    provider_request_count: result.provider_request_count,
    response_http_status: result.response_http_status,
    responses_endpoint: result.responses_endpoint,
    schema_version: result.schema_version,
    trusted_completed: result.trusted_completed,
    transport_mode: result.transport_mode,
    wall_ms: hostWallMs,
  });
}

async function prepareDockerExecution(options = {}, sealed = Object.freeze({ authorityMode: 'live', transportMode: 'live' })) {
  if (process.platform !== 'win32') reject('RC5_EXECUTOR_PLATFORM', 'The bounded executor requires Windows Docker Desktop.', 2);
  if (options.providerAuthority !== RC5_PROVIDER_AUTHORITY) reject('RC5_PROVIDER_AUTHORITY', 'The exact RC-5 provider authority is required.', 2);
  if (!['live', 'provider_free'].includes(sealed.authorityMode) ||
      !['live', 'provider_free_success', 'provider_free_failure'].includes(sealed.transportMode) ||
      (sealed.authorityMode === 'live') !== (sealed.transportMode === 'live')) {
    reject('RC5_EXECUTOR_MODE', 'The sealed executor mode is invalid.', 2);
  }
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const credentialHome = ensureClosedCredentialHome(options.credentialHome);
  const credentialLockHome = ensureCredentialLockHome(options.credentialLockHome);
  const runtimeRoot = ensureStagedRuntimeRoot(options.runtimeRoot);
  assertExecutionRoots(runtimeRoot, credentialHome, credentialLockHome);
  const stateRoot = validateStateRoot(options.stateRoot, runtimeRoot, credentialHome);
  if (overlaps(stateRoot, credentialLockHome) || overlaps(credentialLockHome, stateRoot)) {
    reject('RC5_EXECUTOR_ROOT_OVERLAP', 'The slice state and durable credential lock root must be disjoint.', 2);
  }
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
    layout = createLayout(runtimeRoot, credentialLockHome, sealed.authorityMode === 'provider_free');
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
    const executionDeadlineMs = executionCutoffDeadline(hardDeadlineMs);
    let executionDeadlineExpired = false;
    const executionDeadlineTimer = setTimeout(() => {
      executionDeadlineExpired = true;
      if (!cleanupInProgress && !cleaned) {
        try { cleanup(); } catch {}
      }
    }, Math.max(1, executionDeadlineMs - Date.now()));
    executionDeadlineTimer.unref?.();
    let traces;
    let ended;
    let exitCode;
    try {
      const dispatch = validateDispatchBinding(context.dispatch, reservation);
      validateDurableLedgerFiles(stateRoot, reservation, dispatch);
      if (interruptedSignal !== null) reject('RC5_HOST_INTERRUPTED', 'The bounded worker was interrupted after dispatch.', 2);
      const nonce = runtimeId.split('-').at(-1).toLocaleLowerCase('en-US');
      assertBeforeDeadline(executionDeadlineMs, 'Authority descriptor publication');
      resources = allocateAuthorityResources(nonce);
      createAuthority(executable, resources, executionDeadlineMs, sealed.authorityMode === 'provider_free'
        ? { mode: sealed.transportMode === 'provider_free_success' ? 'success' : 'failure', outputDirectory: layout.simulator }
        : null);
      if (Date.now() >= executionDeadlineMs || interruptedSignal !== null) {
        reject(interruptedSignal === null ? 'RC5_WORKER_TIMEOUT' : 'RC5_HOST_INTERRUPTED',
          interruptedSignal === null ? 'Authority creation exhausted the execution interval reserved ahead of cleanup.' : 'The bounded worker was interrupted during authority creation.', 2);
      }
      createStoppedWorker(executable, resources, { credentialHome, layout }, executionDeadlineMs);
      const workerTimeoutMs = executionDeadlineMs - Date.now() - WORKER_EXIT_GRACE_MS;
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
        transportMode: sealed.transportMode,
      });
      assertBeforeDeadline(executionDeadlineMs, 'Worker input persistence');
      const workerInputBytes = readFileSync(join(layout.input, 'worker-input.json'));
      assertBeforeDeadline(executionDeadlineMs, 'Worker input validation');
      docker(executable, ['start', resources.names.worker], { code: 'RC5_WORKER_START', deadlineMs: executionDeadlineMs });
      const remainingWaitMs = Math.min(workerTimeoutMs + WORKER_EXIT_GRACE_MS,
        executionDeadlineMs - Date.now());
      if (remainingWaitMs <= 0) {
        dockerBestEffort(executable, ['rm', '--force', resources.names.worker], Math.max(1, boundedDeadlineTimeout(hardDeadlineMs, 5_000)), hardDeadlineMs);
        reject('RC5_WORKER_TIMEOUT', 'The bounded worker reached its host deadline.', 2);
      }
      exitCode = await waitForWorker(executable, resources.names.worker, remainingWaitMs, executionDeadlineMs);
      if (interruptedSignal !== null) reject('RC5_HOST_INTERRUPTED', 'The bounded worker was interrupted after dispatch.', 2);
      if (executionDeadlineExpired || Date.now() >= executionDeadlineMs) reject('RC5_WORKER_TIMEOUT', 'The bounded worker reached the execution cutoff reserved ahead of cleanup.', 2);
      ended = inspectContainer(executable, resources.names.worker, executionDeadlineMs);
      if (sealed.authorityMode === 'provider_free') {
        const simulatorExitCode = await waitForWorker(executable, resources.names.simulator, 5_000, executionDeadlineMs);
        const simulatorEnded = inspectContainer(executable, resources.names.simulator, executionDeadlineMs);
        if (simulatorExitCode !== 0 || simulatorEnded.State?.Running !== false || simulatorEnded.State?.OOMKilled !== false ||
            simulatorEnded.State?.ExitCode !== 0) {
          reject('RC5_SIMULATOR_OBSERVATION', 'The provider-free simulator did not terminate cleanly after one request.', 2);
        }
      }
      traces = stopAndReadAuthority(executable, resources, executionDeadlineMs);
      const simulatorObservation = sealed.authorityMode === 'provider_free'
        ? readProviderFreeSimulatorObservation(layout, sealed.transportMode, executionDeadlineMs)
        : null;
      const traceBytes = persistAuthorityTraces(layout, traces, executionDeadlineMs);
      const credentialProtected = verifyCredentialProtection(executable, credentialHome, executionDeadlineMs);
      validateExternalTopology(layout, credentialHome, workerInputBytes, traceBytes, executionDeadlineMs);
      const resultEvidence = collectResultEvidence(layout, request, exitCode, ended.State, traces, credentialProtected,
        sealed.transportMode, executionDeadlineMs);
      const cleanupObservation = cleanup();
      const hostWallMs = Date.now() - invocationStartedAt;
      if (hostWallMs < 0 || hostWallMs > timeoutMs || Date.now() >= hardDeadlineMs || executionDeadlineExpired) {
        reject('RC5_WORKER_TIMEOUT', 'The bounded execution and verified cleanup exceeded the hard case deadline.', 2);
      }
      const normalized = reconcileResultEvidence(resultEvidence, cleanupObservation, hostWallMs);
      if (simulatorObservation === null) {
        const { transport_mode: _transportMode, ...publicResult } = normalized;
        return Object.freeze(publicResult);
      }
      return Object.freeze({ ...normalized, simulator_observation: simulatorObservation });
    } finally {
      clearTimeout(executionDeadlineTimer);
      if (ended === undefined && resources?.names?.worker) {
        dockerBestEffort(executable, ['stop', '--time=5', resources.names.worker], Math.max(1, boundedDeadlineTimeout(hardDeadlineMs, 10_000)), hardDeadlineMs);
      }
      cleanup();
    }
  };

  return Object.freeze({ cleanup, invoke, runtime_id: runtimeId });
}

export async function prepareDockerProviderExecution(options = {}) {
  return prepareDockerExecution(options, Object.freeze({ authorityMode: 'live', transportMode: 'live' }));
}

export const RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS = Object.freeze({
  allocateAuthorityResources,
  authorityCreationReconciled,
  boundedDeadlineTimeout,
  cleanupAuthority,
  CONTAINER_RUN_AUTHORITY: RC5_CONTAINER_RUN_AUTHORITY_V1,
  CONTAINER_RUN_AUTHORITY_SHA256: RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256,
  containmentMayRelease,
  CONTRACT_ID,
  CONTRACT_LABEL,
  CLEANUP_HEADROOM_MS,
  DOCKER_CLI_BYTE_COUNT,
  DOCKER_CLI_SHA256,
  DOCKER_CONTEXT,
  deadlineRemainingMs,
  executionCutoffDeadline,
  MAX_ARTIFACT_BYTES,
  MAX_TIMEOUT_MS,
  RESPONSES_ENDPOINT,
  WORKER_ARGUMENTS: Object.freeze(workerArguments()),
  WORKER_HASH_LABEL,
  WORKER_EXIT_GRACE_MS,
  WORKER_PATH_LABEL,
  exactMounts,
  parseEvents,
  projectUniqueRawEnvironment,
  strictNotFound,
  waitForWorker,
  validateExternalTopology,
  validateContainerRunInspectObservation,
  validateDispatchBinding,
  validateDurableLedgerFiles,
  validateRequest,
  validateReservationBinding,
  validateWorkerResult,
});
