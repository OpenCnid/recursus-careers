import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  RC3_ACTUAL_ID,
  RouteError,
  actualFailureObservation,
  assertRouteContentSafe,
  loadRouteContract,
  prepareActualWorkspace,
  recordActual,
  reserveActualAttempt,
  validateRouteEvidence,
} from './recursus-route-v17.mjs';
import { isRegisteredCaptureEntrypointCapability } from '../../scripts/recursus/capture-recursus-route-v17.mjs';
import { validateCorpus } from '../recursus-benchmark.mjs';

export const RC3_IMAGE = 'recursus-rc3-v17@sha256:2338e4b828a094194ba7a20562bc20a97410f95112773e53fd3807def9979ecf';
export const RC3_IMAGE_ID = 'sha256:2338e4b828a094194ba7a20562bc20a97410f95112773e53fd3807def9979ecf';
const MAX_DOCKER_OUTPUT = 2 * 1024 * 1024;
const WORKER_SCRIPT = '/opt/rc3/recursus-route-worker-v17.mjs';
const CONTENT_GATE_SCRIPT = '/opt/rc3/recursus-route-content-gate-v17.mjs';
const HTML_ENTITIES_SCRIPT = '/opt/rc3/recursus-route-html-entities-v17.mjs';
const PROXY_SCRIPT = '/opt/rc3/recursus-route-proxy-v17.mjs';
const RELAY_SCRIPT = '/opt/rc3/recursus-route-relay-v17.mjs';
const SOCKET_INIT_SCRIPT = '/opt/rc3/recursus-route-socket-init-v17.mjs';
const CREDENTIAL_PERMISSION_SCRIPT = '/opt/rc3/recursus-route-credential-permission-v17.mjs';
const DENIAL_PROBE_SCRIPT = '/opt/rc3/recursus-route-denial-probe-v17.mjs';
const DOCKER_CLI_BYTE_COUNT = 42_748_848;
const DOCKER_CLI_SHA256 = '7bc66b018b9da43fea986f893288bb93970d3d1217f5063201fd97c827f20732';
const DOCKER_CONTEXT = 'desktop-linux';
const MODULE_ROOT = resolve(import.meta.dirname, '..', '..');
const ACTUAL_PUBLICATION_CAPABILITY = Object.freeze({});

export function isActualPublicationCapability(value) {
  return value === ACTUAL_PUBLICATION_CAPABILITY;
}

function reject(code, message, exitCode = 1) {
  throw new RouteError(code, message, exitCode);
}

function absoluteNativePath(pathValue, label, kind = 'directory') {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('CAPTURE_PATH', `${label} must be an explicit absolute path.`, 2);
  const target = resolve(pathValue);
  if (target.includes(',')) reject('CAPTURE_PATH', `${label} may not contain a comma.`, 2);
  if (/^(?:\\\\|\\[.?]\\)/u.test(target)) reject('CAPTURE_PATH', `${label} may not be a UNC or device path.`, 2);
  if (!existsSync(target)) reject('CAPTURE_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  const matches = kind === 'file' ? stat.isFile() : stat.isDirectory();
  if (!matches || stat.isSymbolicLink() || realpathSync.native(target) !== target) reject('CAPTURE_PATH', `${label} must be a resolved native ${kind}.`);
  return target;
}

function boundaryPath(pathValue, label) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('CAPTURE_PATH', `${label} must be an explicit absolute path.`, 2);
  const target = resolve(pathValue);
  if (target.includes(',')) reject('CAPTURE_PATH', `${label} may not contain a comma.`, 2);
  if (/^(?:\\\\|\\[.?]\\)/u.test(target)) reject('CAPTURE_PATH', `${label} may not be a UNC or device path.`, 2);
  const existing = existsSync(target) ? target : dirname(target);
  if (!existsSync(existing)) reject('CAPTURE_PATH', `${label} requires an existing native parent directory.`, 2);
  const stat = lstatSync(existing);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(existing) !== existing) reject('CAPTURE_PATH', `${label} must use a resolved native path.`, 2);
  return target;
}

function overlaps(left, right) {
  const rel = relative(left, right);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

export function assertCaptureRootsDisjoint(options = {}) {
  const roots = [
    ['Career Ops repository', options.repoRoot],
    ['credential home', options.credentialHome],
    ['evidence root', options.evidenceDir],
    ['seed workspace', options.runRoot],
    ['attempt root', options.attemptRoot],
  ].map(([label, value]) => [label, boundaryPath(value, label)]);
  for (let left = 0; left < roots.length; left++) {
    for (let right = left + 1; right < roots.length; right++) {
      if (overlaps(roots[left][1], roots[right][1]) || overlaps(roots[right][1], roots[left][1])) reject('CAPTURE_ROOT_OVERLAP', `${roots[left][0]} overlaps ${roots[right][0]}.`, 2);
    }
  }
  return Object.freeze(Object.fromEntries(roots.map(([label, value]) => [label, value])));
}

function docker(executable, args, options = {}) {
  const environment = Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'PATH', 'ProgramData', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR']
    .filter((key) => typeof process.env[key] === 'string')
    .map((key) => [key, process.env[key]]));
  const result = spawnSync(executable, ['--context', DOCKER_CONTEXT, ...args], {
    encoding: 'utf8',
    env: environment,
    maxBuffer: MAX_DOCKER_OUTPUT,
    shell: false,
    timeout: options.timeoutMs || 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) reject(options.code || 'DOCKER_COMMAND', options.message || 'The registered container operation failed.');
  return result.stdout.trim();
}

function dockerBestEffort(executable, args) {
  const environment = Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'PATH', 'ProgramData', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR']
    .filter((key) => typeof process.env[key] === 'string')
    .map((key) => [key, process.env[key]]));
  return spawnSync(executable, ['--context', DOCKER_CONTEXT, ...args], { encoding: 'utf8', env: environment, maxBuffer: MAX_DOCKER_OUTPUT, shell: false, timeout: 15_000, windowsHide: true });
}

function strictNotFoundInspection(entry) {
  if (!entry || !['container', 'network', 'volume'].includes(entry.kind) || typeof entry.name !== 'string') return false;
  const expectedError = entry.kind === 'container'
    ? `Error response from daemon: No such container: ${entry.name}`
    : entry.kind === 'network'
      ? `Error response from daemon: network ${entry.name} not found`
      : `Error response from daemon: get ${entry.name}: no such volume`;
  return entry.result?.error === undefined
    && entry.result?.status === 1
    && entry.result?.signal === null
    && entry.result?.stdout?.trim() === '[]'
    && entry.result?.stderr?.trim() === expectedError;
}

export function interpretCleanupInspections(entries) {
  const counts = { container: 0, network: 0, volume: 0 };
  let inspectionErrorCount = 0;
  for (const entry of entries || []) {
    if (strictNotFoundInspection(entry)) counts[entry.kind]++;
    else inspectionErrorCount++;
  }
  return Object.freeze({
    container_inspect_not_found_count: counts.container,
    inspection_error_count: inspectionErrorCount,
    network_inspect_not_found_count: counts.network,
    outcome: inspectionErrorCount === 0 ? 'strict_not_found' : 'inspection_error',
    volume_inspect_not_found_count: counts.volume,
  });
}

function dockerJson(executable, args, code) {
  try {
    return JSON.parse(docker(executable, args, { code }));
  } catch (error) {
    if (error instanceof RouteError) throw error;
    reject(code, 'A registered container inspection was not valid JSON.');
  }
}

function ensureEmptyNativeDirectory(pathValue, label) {
  const target = boundaryPath(pathValue, label);
  if (!existsSync(target)) mkdirSync(target);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(target) !== target) reject('CAPTURE_PATH', `${label} must be a resolved native directory.`);
  if (readdirSync(target).length !== 0) reject('DIRECTORY_NOT_EMPTY', `${label} must be empty.`);
  return target;
}

function ensureClosedCredentialHome(pathValue) {
  const target = absoluteNativePath(pathValue, 'credential home');
  const entries = readdirSync(target).sort();
  if (entries.length !== 1 || entries[0] !== '.credentials.yaml') reject('CREDENTIAL_BOUNDARY', 'Credential home must expose only the registered credential document.');
  const credential = join(target, '.credentials.yaml');
  const stat = lstatSync(credential);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) reject('CREDENTIAL_BOUNDARY', 'Registered credential document must be a single-link native file.');
  return target;
}

function verifyImage(executable) {
  const images = dockerJson(executable, ['image', 'inspect', RC3_IMAGE], 'IMAGE_UNAVAILABLE');
  if (!Array.isArray(images) || images.length !== 1) reject('IMAGE_IDENTITY', 'Registered worker image inspection was ambiguous.');
  const image = images[0];
  if (image.Id !== RC3_IMAGE_ID
      || image.Os !== 'linux'
      || image.Architecture !== 'amd64'
      || image.Config?.User !== '65532:65532'
      || JSON.stringify(image.Config?.Entrypoint) !== JSON.stringify(['/usr/local/bin/node'])
      || !image.RepoDigests?.includes(RC3_IMAGE)) reject('IMAGE_IDENTITY', 'Worker image differs from the frozen materialization.');
  return true;
}

function verifyDockerHost(executable) {
  const bytes = readFileSync(executable);
  if (bytes.length !== DOCKER_CLI_BYTE_COUNT || createHash('sha256').update(bytes).digest('hex') !== DOCKER_CLI_SHA256) reject('DOCKER_IDENTITY', 'Docker CLI differs from the registered host orchestrator.');
  const version = dockerJson(executable, ['version', '--format', '{{json .}}'], 'DOCKER_IDENTITY');
  if (version.Client?.Version !== '29.5.3'
      || version.Client?.Os !== 'windows'
      || version.Client?.Arch !== 'amd64'
      || version.Client?.Context !== DOCKER_CONTEXT
      || version.Server?.Version !== '29.5.3'
      || version.Server?.Os !== 'linux'
      || version.Server?.Arch !== 'amd64'
      || version.Server?.Platform?.Name !== 'Docker Desktop 4.79.0 (230596)') reject('DOCKER_IDENTITY', 'Docker client or local daemon differs from registration.');
  const contexts = dockerJson(executable, ['context', 'inspect', DOCKER_CONTEXT, '--format', '{{json .}}'], 'DOCKER_IDENTITY');
  if (contexts?.Name !== DOCKER_CONTEXT
      || contexts.Metadata?.Description !== 'Docker Desktop'
      || contexts.Endpoints?.docker?.Host !== 'npipe:////./pipe/dockerDesktopLinuxEngine'
      || contexts.Endpoints?.docker?.SkipTLSVerify !== false
      || Object.keys(contexts.TLSMaterial || {}).length !== 0) reject('DOCKER_IDENTITY', 'Docker context endpoint differs from the registered local daemon.');
}

function commonContainerArgs(name, networkMode, user = '65532:65532') {
  return [
    'create', '--name', name, '--pull=never', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=1024m', '--cpus=2',
    '--ulimit=nofile=256:256', '--ipc=none', '--user', user, '--network', networkMode,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,size=16777216,uid=65532,gid=65532,mode=0700',
    '--label', 'org.opencnid.rc3.contract=rc3-recursus-direct-v17',
  ];
}

function mount(source, target, readOnly = false, type = 'bind') {
  return ['--mount', `type=${type},source=${source},target=${target}${readOnly ? ',readonly' : ''}`];
}

function inspectContainer(executable, name) {
  const values = dockerJson(executable, ['inspect', name], 'CONTAINER_INSPECTION');
  if (!Array.isArray(values) || values.length !== 1) reject('CONTAINER_INSPECTION', 'Container inspection was ambiguous.');
  return values[0];
}

function verifyBaseAuthority(inspect, expectedNetwork, expectedCommand, expectedLogConfig) {
  const network = String(inspect.HostConfig?.NetworkMode || '');
  const networkMatched = network === expectedNetwork;
  const expectedNetworkKeys = expectedNetwork.startsWith('container:') ? [] : [expectedNetwork];
  const observedNetworkKeys = Object.keys(inspect.NetworkSettings?.Networks || {}).sort();
  if (inspect.Config?.Image !== RC3_IMAGE
      || inspect.Config?.User !== '65532:65532'
      || inspect.HostConfig?.ReadonlyRootfs !== true
      || inspect.HostConfig?.Privileged !== false
      || inspect.HostConfig?.CapAdd !== null
      || JSON.stringify(inspect.HostConfig?.CapDrop) !== JSON.stringify(['ALL'])
      || inspect.HostConfig?.Binds !== null
      || JSON.stringify(inspect.HostConfig?.Devices) !== JSON.stringify([])
      || inspect.HostConfig?.DeviceRequests !== null
      || inspect.HostConfig?.VolumesFrom !== null
      || inspect.HostConfig?.Runtime !== 'runc'
      || inspect.HostConfig?.PidMode !== ''
      || inspect.HostConfig?.UTSMode !== ''
      || inspect.HostConfig?.UsernsMode !== ''
      || inspect.HostConfig?.CgroupnsMode !== 'private'
      || JSON.stringify(inspect.HostConfig?.RestartPolicy) !== JSON.stringify({ Name: 'no', MaximumRetryCount: 0 })
      || JSON.stringify(inspect.HostConfig?.Ulimits) !== JSON.stringify([{ Name: 'nofile', Hard: 256, Soft: 256 }])
      || JSON.stringify(inspect.HostConfig?.LogConfig) !== JSON.stringify(expectedLogConfig)
      || JSON.stringify(inspect.HostConfig?.SecurityOpt) !== JSON.stringify(['no-new-privileges'])
      || inspect.HostConfig?.PidsLimit !== 128
      || inspect.HostConfig?.IpcMode !== 'none'
      || inspect.HostConfig?.Memory !== 1_073_741_824
      || inspect.HostConfig?.NanoCpus !== 2_000_000_000
      || inspect.HostConfig?.Tmpfs?.['/tmp'] !== 'rw,noexec,nosuid,nodev,size=16777216,uid=65532,gid=65532,mode=0700'
      || !networkMatched
      || JSON.stringify(observedNetworkKeys) !== JSON.stringify(expectedNetworkKeys)
      || JSON.stringify(inspect.Config?.Cmd) !== JSON.stringify(expectedCommand)
      || JSON.stringify(inspect.Config?.Labels) !== JSON.stringify({ 'org.opencnid.rc3.contract': 'rc3-recursus-direct-v17' })
      || inspect.Config?.ExposedPorts != null) reject('RUNTIME_AUTHORITY', 'A container differs from the registered authority profile.');
}

function normalizedBindSource(value) {
  const normalized = String(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function exactMounts(inspect, expected) {
  const observed = (inspect.HostConfig?.Mounts || []).map((item) => ({ destination: item.Target, mode: item.ReadOnly ? 'ro' : 'rw', source: item.Source, type: item.Type })).sort((a, b) => a.destination.localeCompare(b.destination));
  const wanted = [...expected].sort((a, b) => a.destination.localeCompare(b.destination));
  if (observed.length !== wanted.length) reject('RUNTIME_AUTHORITY', 'A container mount set differs from the registered authority profile.');
  for (let index = 0; index < wanted.length; index++) {
    const left = observed[index];
    const right = wanted[index];
    const sourceMatched = right.type === 'bind'
      ? normalizedBindSource(left.source) === normalizedBindSource(right.source)
      : left.source === right.source;
    if (left.destination !== right.destination || left.mode !== right.mode || left.type !== right.type || !sourceMatched) reject('RUNTIME_AUTHORITY', 'A container mount set differs from the registered authority profile.');
  }
  const effective = (inspect.Mounts || []).map((item) => ({ destination: item.Destination, mode: item.RW ? 'rw' : 'ro', name: item.Name, source: item.Source, type: item.Type })).sort((a, b) => a.destination.localeCompare(b.destination));
  if (effective.length !== wanted.length) reject('RUNTIME_AUTHORITY', 'Effective container mounts differ from the registered authority profile.');
  for (let index = 0; index < wanted.length; index++) {
    const left = effective[index];
    const right = wanted[index];
    if (left.destination !== right.destination || left.mode !== right.mode || left.type !== right.type) reject('RUNTIME_AUTHORITY', 'Effective container mounts differ from the registered authority profile.');
    if (right.type === 'volume' && left.name !== right.source) reject('RUNTIME_AUTHORITY', 'Effective named volume identity differs from registration.');
    if (right.type === 'bind' && normalizedBindSource(left.source) !== normalizedBindSource(right.source)) reject('RUNTIME_AUTHORITY', 'Effective bind source identity differs from registration.');
  }
}

function waitForLog(executable, name, eventType) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const output = docker(executable, ['logs', name], { code: 'CONTAINER_READINESS', timeoutMs: 5_000 });
    if (output.split(/\r?\n/u).some((line) => line.includes(`\"type\":\"${eventType}\"`))) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  reject('CONTAINER_READINESS', 'A registered authority container did not become ready.');
}

function parseEvents(output, allowedTypes) {
  const events = [];
  for (const line of output.split(/\r?\n/u).filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); } catch { reject('AUTHORITY_TRACE', 'Authority trace contains malformed JSON.'); }
    if (!event || typeof event !== 'object' || Array.isArray(event) || !allowedTypes.has(event.type)) reject('AUTHORITY_TRACE', 'Authority trace contains an unexpected event.');
    events.push(event);
  }
  return events;
}

function onlyEvent(events, type) {
  const matches = events.filter((event) => event.type === type);
  if (matches.length !== 1) reject('AUTHORITY_TRACE', 'Authority trace lacks one required summary event.');
  return matches[0];
}

function exactEvent(event, keys, label) {
  if (JSON.stringify(Object.keys(event).sort()) !== JSON.stringify([...keys].sort())) reject('AUTHORITY_TRACE', `${label} fields differ from the registered content-safe shape.`);
}

function validateAuthorityEvents(proxyEvents, relayEvents) {
  const proxyReady = onlyEvent(proxyEvents, 'proxy_ready');
  const proxy = onlyEvent(proxyEvents, 'proxy_summary');
  const relayReady = onlyEvent(relayEvents, 'relay_ready');
  const relay = onlyEvent(relayEvents, 'relay_summary');
  const admitted = proxyEvents.filter((event) => event.type === 'connect_admitted');
  const denied = proxyEvents.filter((event) => event.type === 'connect_denied');
  const closed = proxyEvents.filter((event) => event.type === 'tunnel_closed');
  const reasons = new Set(['byte_limit', 'client_closed', 'client_error', 'idle_timeout', 'upstream_closed', 'upstream_error']);
  const denialReasons = new Set(['concurrency', 'destination', 'destination_cap', 'dns_failure', 'header_bytes', 'header_count', 'header_timeout', 'host_header', 'malformed_header', 'non_global_address', 'proxy_failure', 'request_line', 'sensitive_header']);
  exactEvent(proxyReady, ['policy_version', 'type'], 'Proxy ready event');
  exactEvent(proxy, ['clean_shutdown', 'denied', 'download_bytes', 'oauth_admitted', 'responses_admitted', 'type', 'unexpected', 'upload_bytes'], 'Proxy summary event');
  exactEvent(relayReady, ['policy_version', 'type'], 'Relay ready event');
  exactEvent(relay, ['accepted_connections', 'clean_shutdown', 'type', 'upstream_failures'], 'Relay summary event');
  for (const event of admitted) exactEvent(event, ['destination_id', 'ordinal', 'type'], 'Proxy admission event');
  for (const event of denied) exactEvent(event, ['reason_code', 'type'], 'Proxy denial event');
  for (const event of closed) exactEvent(event, ['close_reason', 'destination_id', 'download_bytes', 'ordinal', 'type', 'upload_bytes'], 'Proxy tunnel close event');
  const integerSummary = [proxy.denied, proxy.oauth_admitted, proxy.responses_admitted, proxy.unexpected, relay.accepted_connections, relay.upstream_failures];
  const unexpectedCloses = closed.filter((event) => !['client_closed', 'upstream_closed'].includes(event.close_reason)).length;
  if (denied.length !== proxy.denied
      || proxyEvents[0] !== proxyReady
      || proxyEvents.at(-1) !== proxy
      || relayEvents[0] !== relayReady
      || relayEvents.at(-1) !== relay
      || proxyReady.policy_version !== 'rc3-proxy-v17'
      || relayReady.policy_version !== 'rc3-relay-v17'
      || proxy.clean_shutdown !== true
      || relay.clean_shutdown !== true
      || integerSummary.some((value) => !Number.isInteger(value) || value < 0 || value > 16)
      || admitted.filter((event) => event.destination_id === 'responses').length !== proxy.responses_admitted
      || admitted.filter((event) => event.destination_id === 'oauth_refresh').length !== proxy.oauth_admitted
      || proxy.responses_admitted > 2
      || proxy.oauth_admitted > 2
      || relay.accepted_connections > 4
      || proxy.download_bytes > 12 * 1024 * 1024 + 1
      || proxy.upload_bytes > 12 * 1024 * 1024 + 1
      || proxy.unexpected !== unexpectedCloses
      || relay.accepted_connections !== admitted.length + denied.length
      || closed.length < admitted.length
      || closed.length > 4
      || Math.min(closed.reduce((total, event) => total + event.download_bytes, 0), 12 * 1024 * 1024 + 1) !== proxy.download_bytes
      || Math.min(closed.reduce((total, event) => total + event.upload_bytes, 0), 12 * 1024 * 1024 + 1) !== proxy.upload_bytes
      || admitted.some((event) => !['responses', 'oauth_refresh'].includes(event.destination_id)
        || !Number.isInteger(event.ordinal)
        || event.ordinal < 1
        || event.ordinal > 2)
      || new Set(admitted.map((event) => `${event.destination_id}:${event.ordinal}`)).size !== admitted.length
      || denied.some((event) => !denialReasons.has(event.reason_code))
      || closed.some((event) => !reasons.has(event.close_reason)
        || !['responses', 'oauth_refresh'].includes(event.destination_id)
        || !Number.isInteger(event.ordinal)
        || event.ordinal < 1
        || event.ordinal > 2
        || !Number.isInteger(event.upload_bytes)
        || !Number.isInteger(event.download_bytes)
        || event.upload_bytes < 0
        || event.download_bytes < 0
        || event.upload_bytes > 12 * 1024 * 1024 + 1
        || event.download_bytes > 12 * 1024 * 1024 + 1)
      || admitted.some((event) => !closed.some((closedEvent) => closedEvent.destination_id === event.destination_id && closedEvent.ordinal === event.ordinal))) reject('AUTHORITY_TRACE', 'Authority event counts or bounded fields do not reconcile.');
}

function writeJsonExclusive(pathValue, value) {
  writeFileSync(pathValue, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' });
}

function readNativeFileWithin(directory, name, maxBytes, label) {
  const root = absoluteNativePath(directory, `${label} directory`);
  const target = join(root, name);
  if (!existsSync(target)) reject('WORKER_OUTPUT', `${label} is missing.`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync.native(target) !== target || stat.size > maxBytes) reject('WORKER_OUTPUT', `${label} is not a bounded single-link native file.`);
  return readFileSync(target);
}

function createAuthorityResources(executable, nonce, proxyNetwork) {
  const names = {
    network: `rc3-v17-net-${nonce}`,
    proxy: `rc3-v17-proxy-${nonce}`,
    relay: `rc3-v17-relay-${nonce}`,
    socket: `rc3-v17-socket-${nonce}`,
    worker: `rc3-v17-worker-${nonce}`,
  };
  const actualProxyNetwork = proxyNetwork === 'none' ? 'none' : names.network;
  const resources = { names, proxyNetwork: actualProxyNetwork, relayId: null };
  try {
    docker(executable, ['volume', 'create', '--label', 'org.opencnid.rc3.contract=rc3-recursus-direct-v17', names.socket], { code: 'AUTHORITY_VOLUME' });
    if (proxyNetwork !== 'none') docker(executable, ['network', 'create', '--driver', 'bridge', '--label', 'org.opencnid.rc3.contract=rc3-recursus-direct-v17', names.network], { code: 'AUTHORITY_NETWORK' });
    docker(executable, [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
      '--cap-add=CHOWN', '--cap-add=FOWNER', '--security-opt=no-new-privileges', '--user=0:0',
      ...mount(names.socket, '/run/rc3-socket', false, 'volume'), '--entrypoint=/usr/local/bin/node', RC3_IMAGE, SOCKET_INIT_SCRIPT,
    ], { code: 'AUTHORITY_SOCKET_INIT' });
    const proxyArgs = [
      ...commonContainerArgs(names.proxy, actualProxyNetwork), '--log-driver=local', '--log-opt=max-size=1m', '--log-opt=max-file=1', '--log-opt=compress=false',
      ...mount(names.socket, '/run/rc3-socket', false, 'volume'), '--entrypoint=/usr/local/bin/node', RC3_IMAGE, PROXY_SCRIPT,
    ];
    docker(executable, proxyArgs, { code: 'AUTHORITY_PROXY_CREATE' });
    const proxyInspect = inspectContainer(executable, names.proxy);
    verifyBaseAuthority(proxyInspect, actualProxyNetwork, [PROXY_SCRIPT], { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '1m' } });
    exactMounts(proxyInspect, [{ destination: '/run/rc3-socket', mode: 'rw', source: names.socket, type: 'volume' }]);
    docker(executable, ['start', names.proxy], { code: 'AUTHORITY_PROXY_START' });
    waitForLog(executable, names.proxy, 'proxy_ready');
    const relayArgs = [
      ...commonContainerArgs(names.relay, 'none'), '--log-driver=local', '--log-opt=max-size=1m', '--log-opt=max-file=1', '--log-opt=compress=false',
      ...mount(names.socket, '/run/rc3-socket', true, 'volume'), '--entrypoint=/usr/local/bin/node', RC3_IMAGE, RELAY_SCRIPT,
    ];
    docker(executable, relayArgs, { code: 'AUTHORITY_RELAY_CREATE' });
    const relayInspect = inspectContainer(executable, names.relay);
    verifyBaseAuthority(relayInspect, 'none', [RELAY_SCRIPT], { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '1m' } });
    exactMounts(relayInspect, [{ destination: '/run/rc3-socket', mode: 'ro', source: names.socket, type: 'volume' }]);
    docker(executable, ['start', names.relay], { code: 'AUTHORITY_RELAY_START' });
    waitForLog(executable, names.relay, 'relay_ready');
    resources.relayId = relayInspect.Id;
    return resources;
  } catch (error) {
    cleanupAuthority(executable, resources);
    throw error;
  }
}

function stopAndReadAuthority(executable, resources, traceRoot, corpusContext) {
  dockerBestEffort(executable, ['stop', '--time=5', resources.names.relay]);
  dockerBestEffort(executable, ['stop', '--time=5', resources.names.proxy]);
  const proxyEvents = parseEvents(docker(executable, ['logs', resources.names.proxy], { code: 'AUTHORITY_TRACE' }), new Set(['proxy_ready', 'connect_denied', 'connect_admitted', 'tunnel_closed', 'proxy_summary']));
  const relayEvents = parseEvents(docker(executable, ['logs', resources.names.relay], { code: 'AUTHORITY_TRACE' }), new Set(['relay_ready', 'relay_summary']));
  validateAuthorityEvents(proxyEvents, relayEvents);
  const proxyBytes = Buffer.from(`${JSON.stringify(proxyEvents)}\n`, 'utf8');
  const relayBytes = Buffer.from(`${JSON.stringify(relayEvents)}\n`, 'utf8');
  assertRouteContentSafe(proxyBytes, corpusContext, 'authority proxy trace');
  assertRouteContentSafe(relayBytes, corpusContext, 'authority relay trace');
  writeFileSync(join(traceRoot, 'authority-proxy-events.json'), proxyBytes, { flag: 'wx' });
  writeFileSync(join(traceRoot, 'authority-relay-events.json'), relayBytes, { flag: 'wx' });
  return { proxyBytes, proxyEvents, proxySummary: onlyEvent(proxyEvents, 'proxy_summary'), relayBytes, relayEvents, relaySummary: onlyEvent(relayEvents, 'relay_summary') };
}

function cleanupAuthority(executable, resources) {
  if (!resources?.names) return Object.freeze({ cleaned: true, observation: null });
  for (const name of [resources.names.worker, resources.names.relay, resources.names.proxy]) dockerBestEffort(executable, ['rm', '--force', name]);
  if (resources.proxyNetwork !== 'none') dockerBestEffort(executable, ['network', 'rm', resources.names.network]);
  dockerBestEffort(executable, ['volume', 'rm', resources.names.socket]);
  const inspections = [resources.names.worker, resources.names.relay, resources.names.proxy]
    .map((name) => ({ kind: 'container', name, result: dockerBestEffort(executable, ['container', 'inspect', name]) }));
  if (resources.proxyNetwork !== 'none') inspections.push({ kind: 'network', name: resources.names.network, result: dockerBestEffort(executable, ['network', 'inspect', resources.names.network]) });
  inspections.push({ kind: 'volume', name: resources.names.socket, result: dockerBestEffort(executable, ['volume', 'inspect', resources.names.socket]) });
  const observation = interpretCleanupInspections(inspections);
  const cleaned = observation.inspection_error_count === 0
    && observation.container_inspect_not_found_count === 3
    && observation.network_inspect_not_found_count === (resources.proxyNetwork === 'none' ? 0 : 1)
    && observation.volume_inspect_not_found_count === 1;
  return Object.freeze({ cleaned, observation });
}

function secureCredential(executable, credentialHome) {
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--cap-add=CHOWN', '--cap-add=FOWNER', '--security-opt=no-new-privileges', '--user=0:0',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,mode=0700',
    ...mount(credentialHome, '/credentials'), '--entrypoint=/usr/local/bin/node', RC3_IMAGE,
    '--permission', `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials',
    '--allow-fs-write=/credentials', CREDENTIAL_PERMISSION_SCRIPT, 'initialize',
  ], { code: 'CREDENTIAL_PERMISSION' });
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--user=65532:65532',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
    ...mount(credentialHome, '/credentials'), '--entrypoint=/usr/local/bin/node', RC3_IMAGE,
    '--permission', `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials',
    '--allow-fs-write=/credentials', CREDENTIAL_PERMISSION_SCRIPT, 'probe',
  ], { code: 'CREDENTIAL_PERMISSION' });
}

function verifyCredentialProtection(executable, credentialHome) {
  try {
    docker(executable, [
      'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
      '--security-opt=no-new-privileges', '--user=65532:65532',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
      ...mount(credentialHome, '/credentials', true), '--entrypoint=/usr/local/bin/node', RC3_IMAGE,
      '--permission', `--allow-fs-read=${CREDENTIAL_PERMISSION_SCRIPT}`, '--allow-fs-read=/credentials',
      CREDENTIAL_PERMISSION_SCRIPT, 'verify',
    ], { code: 'CREDENTIAL_PERMISSION' });
    return true;
  } catch {
    return false;
  }
}

function inspectAuthentication(executable, credentialHome, outputDirectory, corpusContext) {
  docker(executable, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--user=65532:65532',
    '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=4194304,uid=65532,gid=65532,mode=0700',
    ...mount(credentialHome, '/credentials'), ...mount(outputDirectory, '/output'),
    '--entrypoint=/usr/local/bin/node', RC3_IMAGE, '--permission',
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', `--allow-fs-read=${CONTENT_GATE_SCRIPT}`, `--allow-fs-read=${HTML_ENTITIES_SCRIPT}`, `--allow-fs-read=${WORKER_SCRIPT}`,
    '--allow-fs-read=/credentials/.credentials.yaml', '--allow-fs-read=/output', '--allow-fs-write=/output',
    WORKER_SCRIPT, 'container-auth-status', '/output',
  ], { code: 'AUTHENTICATION_STATUS' });
  const bytes = readNativeFileWithin(outputDirectory, 'authentication-status.json', 4_096, 'authentication status');
  assertRouteContentSafe(bytes, corpusContext, 'authentication status');
  let status;
  try { status = JSON.parse(bytes.toString('utf8')); } catch (error) {
    if (error instanceof RouteError) throw error;
    reject('AUTHENTICATION_STATUS', 'Authentication status was not valid content-safe JSON.');
  }
  if (JSON.stringify(Object.keys(status).sort()) !== JSON.stringify(['configured', 'selected_reference_present', 'source', 'unexpected_reference_count', 'writable'])
      || status.configured !== true
      || status.source !== 'file'
      || status.writable !== true
      || status.selected_reference_present !== true
      || status.unexpected_reference_count !== 0) reject('AUTHENTICATION_UNAVAILABLE', 'The registered dedicated runtime-managed OAuth grant is not exclusively configured and writable.');
  if (!bytes.equals(Buffer.from(`${JSON.stringify(status)}\n`, 'utf8'))) reject('AUTHENTICATION_STATUS', 'Authentication status is not canonical content-safe JSON.');
  return Object.freeze({ bytes, status: Object.freeze(status) });
}

function createAttemptLayout(attemptRoot) {
  const root = ensureEmptyNativeDirectory(attemptRoot, 'attempt root');
  const input = join(root, 'input');
  const output = join(root, 'output');
  const locks = join(root, 'locks');
  const auth = join(root, 'authentication');
  for (const pathValue of [input, output, locks, auth]) mkdirSync(pathValue);
  return { auth, input, locks, output, root };
}

export function requireDryOnlyEvidence(result) {
  if (result?.dry_run_count !== 1 || result?.actual_attempt_count !== 0 || result?.reservation_count !== 0) reject('ACTUAL_ALREADY_RECORDED', 'Actual capture requires dry-only evidence and refuses a second provider attempt.');
  return result;
}

export function requireRuntimeAuthorityEnforcement(registration) {
  const capability = registration?.capabilities?.find((item) => item.capability_id === 'runtime_authority_enforcement');
  if (capability?.required_for_actual !== true || capability?.required_for_dry_run !== false || capability?.support_status !== 'supported' || capability?.enabled !== true) reject('RUNTIME_AUTHORITY_UNSUPPORTED', 'The registered route lacks enforced runtime authority.');
  return capability;
}

export function preflightRuntimeAuthority(options = {}) {
  if (!isRegisteredCaptureEntrypointCapability(options.entrypointCapability)) reject('CAPTURE_ENTRYPOINT', 'Runtime authority preflight is confined to the registered capture command.');
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const credentialHome = ensureClosedCredentialHome(options.credentialHome);
  const attemptRoot = boundaryPath(options.attemptRoot, 'attempt root');
  for (const [left, right] of [[MODULE_ROOT, credentialHome], [MODULE_ROOT, attemptRoot], [credentialHome, attemptRoot]]) {
    if (overlaps(left, right) || overlaps(right, left)) reject('CAPTURE_ROOT_OVERLAP', 'Preflight repository, credential, and attempt roots must be disjoint.', 2);
  }
  const traceRoot = createAttemptLayout(options.attemptRoot);
  const { context: corpusContext } = validateCorpus({ repoRoot: MODULE_ROOT });
  verifyDockerHost(executable);
  verifyImage(executable);
  secureCredential(executable, credentialHome);
  const authentication = inspectAuthentication(executable, credentialHome, traceRoot.auth, corpusContext);
  let resources;
  let authority;
  try {
    const nonce = randomUUID().replaceAll('-', '').slice(0, 16);
    resources = createAuthorityResources(executable, nonce, 'none');
    const probeArgs = [
      ...commonContainerArgs(resources.names.worker, `container:${resources.relayId}`), '--log-driver=local', '--log-opt=max-size=64k', '--log-opt=max-file=1', '--log-opt=compress=false',
      '--entrypoint=/usr/local/bin/node', RC3_IMAGE, DENIAL_PROBE_SCRIPT,
    ];
    docker(executable, probeArgs, { code: 'DENIAL_PROBE_CREATE' });
    const inspect = inspectContainer(executable, resources.names.worker);
    verifyBaseAuthority(inspect, `container:${resources.relayId}`, [DENIAL_PROBE_SCRIPT], { Type: 'local', Config: { compress: 'false', 'max-file': '1', 'max-size': '64k' } });
    exactMounts(inspect, []);
    docker(executable, ['start', resources.names.worker], { code: 'DENIAL_PROBE_START' });
    const exitCode = Number(docker(executable, ['wait', resources.names.worker], { code: 'DENIAL_PROBE_WAIT', timeoutMs: 15_000 }));
    const probe = dockerJson(executable, ['logs', resources.names.worker], 'DENIAL_PROBE_TRACE');
    const traces = stopAndReadAuthority(executable, resources, traceRoot.root, corpusContext);
    const summary = traces.proxySummary;
    authority = {
      authentication: authentication.status,
      container_root_read_only: true,
      docker_dns_unreachable: probe.docker_dns_unreachable === true,
      metadata_unreachable: probe.metadata_unreachable === true,
      provider_or_adapter_invoked: false,
      proxy_denied_count: summary.denied,
      proxy_oauth_tunnel_count: summary.oauth_admitted,
      proxy_responses_tunnel_count: summary.responses_admitted,
      public_network_unreachable: probe.public_network_unreachable === true,
      registered_proxy_denied: probe.registered_proxy_denied === true,
      relay_connection_count: traces.relaySummary.accepted_connections,
      worker_exit_code: exitCode,
      worker_network_mode: 'shared_network_none_relay',
      worker_socket_mount_present: false,
    };
    if (exitCode !== 0
        || !authority.docker_dns_unreachable
        || !authority.metadata_unreachable
        || !authority.public_network_unreachable
        || !authority.registered_proxy_denied
        || authority.proxy_denied_count !== 1
        || authority.proxy_oauth_tunnel_count !== 0
        || authority.proxy_responses_tunnel_count !== 0
        || authority.relay_connection_count !== 1) reject('DENIAL_PREFLIGHT', 'Provider-free runtime authority denial checks did not reconcile.');
    const cleanup = cleanupAuthority(executable, resources);
    authority.cleanup_observation = cleanup.observation;
    authority.external_resources_cleaned = cleanup.cleaned;
    if (cleanup.cleaned) resources = undefined;
    if (!authority.external_resources_cleaned) reject('DENIAL_PREFLIGHT', 'Provider-free authority resources were not removed.');
    writeJsonExclusive(join(traceRoot.root, 'authority-preflight.json'), authority);
    return Object.freeze(authority);
  } finally {
    cleanupAuthority(executable, resources);
  }
}

function workerArguments() {
  return [
    '--permission', '--use-env-proxy', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', `--allow-fs-read=${CONTENT_GATE_SCRIPT}`, `--allow-fs-read=${HTML_ENTITIES_SCRIPT}`, `--allow-fs-read=${WORKER_SCRIPT}`,
    '--allow-fs-read=/credentials', '--allow-fs-read=/input/worker-input.json',
    '--allow-fs-read=/seed', '--allow-fs-read=/output', '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials', '--allow-fs-write=/output', '--allow-fs-write=/locks', '--allow-fs-write=/tmp',
    WORKER_SCRIPT, 'container-run', '/input/worker-input.json', '/output',
  ];
}

function createActualWorker(executable, resources, paths) {
  const args = [
    ...commonContainerArgs(resources.names.worker, `container:${resources.relayId}`), '--log-driver=none',
    '--env=HOME=/tmp/rc3-home', '--env=TMPDIR=/tmp', '--env=LANG=C.UTF-8', '--env=TZ=UTC',
    '--env=HTTP_PROXY=http://127.0.0.1:8080', '--env=HTTPS_PROXY=http://127.0.0.1:8080', '--env=NO_PROXY=',
    ...mount(paths.credentialHome, '/credentials'), ...mount(paths.runRoot, '/seed', true),
    ...mount(paths.layout.input, '/input', true), ...mount(paths.layout.output, '/output'), ...mount(paths.layout.locks, '/locks'),
    '--entrypoint=/usr/local/bin/node', RC3_IMAGE, ...workerArguments(),
  ];
  docker(executable, args, { code: 'ACTUAL_WORKER_CREATE' });
  const inspect = inspectContainer(executable, resources.names.worker);
  verifyBaseAuthority(inspect, `container:${resources.relayId}`, workerArguments(), { Type: 'none', Config: {} });
  exactMounts(inspect, [
    { destination: '/credentials', mode: 'rw', source: paths.credentialHome, type: 'bind' },
    { destination: '/input', mode: 'ro', source: paths.layout.input, type: 'bind' },
    { destination: '/locks', mode: 'rw', source: paths.layout.locks, type: 'bind' },
    { destination: '/output', mode: 'rw', source: paths.layout.output, type: 'bind' },
    { destination: '/seed', mode: 'ro', source: paths.runRoot, type: 'bind' },
  ]);
  const environment = Object.fromEntries((inspect.Config?.Env || []).map((entry) => {
    const boundary = entry.indexOf('=');
    return [entry.slice(0, boundary), entry.slice(boundary + 1)];
  }));
  const expectedEnvironment = {
    HOME: '/tmp/rc3-home',
    HTTP_PROXY: 'http://127.0.0.1:8080',
    HTTPS_PROXY: 'http://127.0.0.1:8080',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NODE_ENV: 'production',
    NODE_VERSION: '24.19.0',
    NO_PROXY: '',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    TMPDIR: '/tmp',
    TZ: 'UTC',
    YARN_VERSION: '1.22.22',
  };
  const environmentEntries = Object.entries(environment).sort(([left], [right]) => left.localeCompare(right));
  const expectedEntries = Object.entries(expectedEnvironment).sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(environmentEntries) !== JSON.stringify(expectedEntries)) reject('RUNTIME_AUTHORITY', 'Worker environment differs from the closed registered allowlist.');
  if ((inspect.Config?.Cmd || []).some((item) => item === '--allow-child-process' || item === '--allow-worker')) reject('RUNTIME_AUTHORITY', 'Worker process authority enables an unregistered child surface.');
  return inspect;
}

function inspectExternalMountTopology(layout, credentialHome, expected, credentialProtected, corpusContext) {
  const invalid = () => Object.freeze({ outputFiles: Object.freeze({}), valid: false });
  const nativeEntries = (directory, expected) => {
    if (JSON.stringify(readdirSync(directory).sort()) !== JSON.stringify(expected)) return false;
    return expected.every((name) => {
      const target = join(directory, name);
      const stat = lstatSync(target);
      return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && realpathSync.native(target) === target;
    });
  };
  try {
    const expectedRootEntries = ['authentication', 'authority-proxy-events.json', 'authority-relay-events.json', 'input', 'locks', 'output'];
    if (JSON.stringify(readdirSync(layout.root).sort()) !== JSON.stringify(expectedRootEntries)) return invalid();
    for (const name of ['authentication', 'input', 'locks', 'output']) {
      const target = join(layout.root, name);
      const stat = lstatSync(target);
      if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync.native(target) !== target) return invalid();
    }
    if (!credentialProtected
        || !nativeEntries(credentialHome, ['.credentials.yaml'])
        || !nativeEntries(layout.auth, ['authentication-status.json'])
        || !nativeEntries(layout.input, ['worker-input.json'])
        || readdirSync(layout.locks).length !== 0) return invalid();
    const staged = [
      ['authentication status', readNativeFileWithin(layout.auth, 'authentication-status.json', 4_096, 'authentication status'), expected.authenticationBytes],
      ['worker input', readNativeFileWithin(layout.input, 'worker-input.json', 128 * 1024, 'worker input'), expected.runnerInputBytes],
      ['authority proxy trace', readNativeFileWithin(layout.root, 'authority-proxy-events.json', 128 * 1024, 'authority proxy trace'), expected.proxyBytes],
      ['authority relay trace', readNativeFileWithin(layout.root, 'authority-relay-events.json', 32 * 1024, 'authority relay trace'), expected.relayBytes],
    ];
    for (const [label, bytes, expectedBytes] of staged) {
      if (!Buffer.isBuffer(expectedBytes) || !bytes.equals(expectedBytes)) return invalid();
      assertRouteContentSafe(bytes, corpusContext, label);
    }
    const outputNames = readdirSync(layout.output).sort();
    const permitted = new Set(['assistant-output.md', 'worker-failure.json', 'worker-observation.json']);
    if (outputNames.some((name) => !permitted.has(name)) || (outputNames.includes('worker-failure.json') && outputNames.includes('worker-observation.json'))) return invalid();
    const outputFiles = {};
    for (const name of outputNames) {
      const maxBytes = name === 'assistant-output.md' ? 65_537 : name === 'worker-observation.json' ? 64 * 1024 : 4_096;
      const bytes = readNativeFileWithin(layout.output, name, maxBytes, `worker output ${name}`);
      if (name !== 'assistant-output.md') assertRouteContentSafe(bytes, corpusContext, `worker output ${name}`);
      outputFiles[name] = bytes;
    }
    if (expected.outputFiles !== undefined) {
      const expectedNames = Object.keys(expected.outputFiles).sort();
      if (JSON.stringify(outputNames) !== JSON.stringify(expectedNames)
          || outputNames.some((name) => !Buffer.isBuffer(expected.outputFiles[name]) || !outputFiles[name].equals(expected.outputFiles[name]))) return invalid();
    }
    return Object.freeze({ outputFiles: Object.freeze(outputFiles), valid: true });
  } catch {
    return invalid();
  }
}

export const RC3_CAPTURE_INTERNALS_FOR_TESTS = Object.freeze({ inspectExternalMountTopology, normalizedBindSource });

function readWorkerResult(stagedOutputFiles, exitCode, traces, containerState, mountTopologyValid, cleanup) {
  const outputNames = Object.keys(stagedOutputFiles).sort();
  const permitted = new Set(['assistant-output.md', 'worker-failure.json', 'worker-observation.json']);
  if (outputNames.some((name) => !permitted.has(name)) || (outputNames.includes('worker-failure.json') && outputNames.includes('worker-observation.json'))) reject('WORKER_OUTPUT', 'Worker output topology differs from the registered shape.');
  let rawObservation;
  if (outputNames.includes('worker-observation.json')) {
    try { rawObservation = JSON.parse(stagedOutputFiles['worker-observation.json'].toString('utf8')); } catch (error) {
      if (error instanceof RouteError) throw error;
      reject('WORKER_OUTPUT', 'Worker observation is not valid JSON.');
    }
  } else {
    let failureCode = 'worker_process_error';
    if (outputNames.includes('worker-failure.json')) {
      let failure;
      try { failure = JSON.parse(stagedOutputFiles['worker-failure.json'].toString('utf8')); } catch (error) {
        if (error instanceof RouteError) throw error;
        reject('WORKER_OUTPUT', 'Worker failure is not valid content-safe JSON.');
      }
      if (failure?.status !== 'failed' || typeof failure?.code !== 'string' || !/^[A-Z0-9_]{3,64}$/u.test(failure.code)) reject('WORKER_OUTPUT', 'Worker failure shape differs from the registered diagnostic.');
      failureCode = failure.code.toLocaleLowerCase('en-US');
    }
    rawObservation = actualFailureObservation({ authentication_available: true, failure_code: failureCode, process_exit_code: exitCode });
  }
  const proxy = traces.proxySummary;
  const relay = traces.relaySummary;
  const tunnelCount = proxy.oauth_admitted + proxy.responses_admitted;
  const authorityValid = containerState?.OOMKilled === false
    && cleanup.cleaned
    && mountTopologyValid
    && proxy.clean_shutdown === true
    && relay.clean_shutdown === true
    && proxy.unexpected === 0
    && relay.upstream_failures === 0;
  const denialReasons = traces.proxyEvents
    .filter((event) => event.type === 'connect_denied')
    .map((event) => event.reason_code)
    .sort();
  const authorityObservation = {
    attempt_id: RC3_ACTUAL_ID,
    authentication_available: true,
    authority_attestation_valid: authorityValid,
    cleanup_observation: cleanup.observation,
    external_mount_topology_valid: mountTopologyValid,
    external_resources_cleaned: cleanup.cleaned,
    image_identity_matched: true,
    observation_id: `AUTHORITY-${RC3_ACTUAL_ID}`,
    process_exit_code: exitCode,
    process_oom_killed: containerState?.OOMKilled === true,
    proxy_clean_shutdown: proxy.clean_shutdown,
    proxy_denial_reasons: denialReasons,
    proxy_denied_count: proxy.denied,
    proxy_download_bytes: proxy.download_bytes,
    proxy_oauth_tunnel_count: proxy.oauth_admitted,
    proxy_responses_tunnel_count: proxy.responses_admitted,
    proxy_upload_bytes: proxy.upload_bytes,
    proxy_unexpected_count: proxy.unexpected,
    relay_clean_shutdown: relay.clean_shutdown,
    relay_connection_count: relay.accepted_connections,
    relay_upstream_failure_count: relay.upstream_failures,
    schema_version: '1.0',
    tunnel_count_reconciled: relay.accepted_connections === tunnelCount + proxy.denied,
  };
  const observation = {
    ...rawObservation,
    authority_attestation_valid: authorityValid,
    process_exit_code: exitCode,
    process_signal: null,
    proxy_denied_count: proxy.denied,
    proxy_download_bytes: proxy.download_bytes,
    proxy_oauth_tunnel_count: proxy.oauth_admitted,
    proxy_responses_tunnel_count: proxy.responses_admitted,
    proxy_upload_bytes: proxy.upload_bytes,
    relay_connection_count: relay.accepted_connections,
    unexpected_external_mutation: false,
  };
  observation.unexpected_external_mutation = !mountTopologyValid || !cleanup.cleaned;
  let artifactBytes = null;
  if (outputNames.includes('assistant-output.md')) {
    artifactBytes = stagedOutputFiles['assistant-output.md'];
    if (artifactBytes.length > 65_536) {
      artifactBytes = null;
      observation.artifact_captured = false;
      observation.artifact_valid = false;
      observation.budget_exceeded = true;
    }
  }
  return {
    authorityObservation: Object.freeze(authorityObservation),
    workerResult: Object.freeze({ artifactBytes, observation: Object.freeze(observation) }),
    workerObservation: Object.freeze({ ...rawObservation }),
  };
}

export async function captureActualRoute(options = {}) {
  if (!isRegisteredCaptureEntrypointCapability(options.entrypointCapability)) reject('CAPTURE_ENTRYPOINT', 'Actual runtime invocation is confined to the registered capture command.');
  const contract = loadRouteContract(options);
  const executable = absoluteNativePath(options.dockerExecutable, 'Docker executable', 'file');
  const credentialHome = ensureClosedCredentialHome(options.credentialHome);
  assertCaptureRootsDisjoint({ ...options, credentialHome, repoRoot: contract.repoRoot });
  requireDryOnlyEvidence(validateRouteEvidence({ evidenceDir: options.evidenceDir, repoRoot: contract.repoRoot }));
  requireRuntimeAuthorityEnforcement(contract.registration);
  verifyDockerHost(executable);
  verifyImage(executable);
  const layout = createAttemptLayout(options.attemptRoot);
  const { context: corpusContext } = validateCorpus({ repoRoot: contract.repoRoot });
  secureCredential(executable, credentialHome);
  const authentication = inspectAuthentication(executable, credentialHome, layout.auth, corpusContext);
  const prepared = prepareActualWorkspace({ evidenceDir: options.evidenceDir, repoRoot: contract.repoRoot, runRoot: options.runRoot });
  const workerInput = {
    credentialPath: '/credentials/.credentials.yaml',
    lockDirectory: '/locks',
    maxTokens: contract.registration.budgets.max_output_tokens,
    model: contract.registration.route.model.id,
    profileDirectory: '/opt/recursus-profile',
    provider: contract.registration.route.provider.id,
    reasoningEffort: contract.registration.route.model.reasoning_effort,
    request: prepared.requestBytes.toString('utf8'),
    seedWorkspace: '/seed',
    timeoutMs: contract.registration.budgets.timeout_ms,
  };
  writeJsonExclusive(join(layout.input, 'worker-input.json'), workerInput);
  const runnerInputBytes = readFileSync(join(layout.input, 'worker-input.json'));
  assertRouteContentSafe(runnerInputBytes, corpusContext, 'serialized worker input');
  let resources;
  try {
    const nonce = randomUUID().replaceAll('-', '').slice(0, 16);
    resources = createAuthorityResources(executable, nonce, 'external');
    createActualWorker(executable, resources, { credentialHome, layout, runRoot: resolve(options.runRoot) });
    reserveActualAttempt({ evidenceDir: options.evidenceDir, repoRoot: contract.repoRoot });
    docker(executable, ['start', resources.names.worker], { code: 'ACTUAL_WORKER_START' });
    const exitCode = Number(docker(executable, ['wait', resources.names.worker], { code: 'ACTUAL_WORKER_WAIT', timeoutMs: contract.registration.budgets.timeout_ms + 30_000 }));
    const ended = inspectContainer(executable, resources.names.worker);
    const traces = stopAndReadAuthority(executable, resources, layout.root, corpusContext);
    const credentialProtected = verifyCredentialProtection(executable, credentialHome);
    const expectedStaging = {
      authenticationBytes: authentication.bytes,
      proxyBytes: traces.proxyBytes,
      relayBytes: traces.relayBytes,
      runnerInputBytes,
    };
    const initialStaging = inspectExternalMountTopology(layout, credentialHome, expectedStaging, credentialProtected, corpusContext);
    const finalStaging = inspectExternalMountTopology(layout, credentialHome, { ...expectedStaging, outputFiles: initialStaging.outputFiles }, credentialProtected, corpusContext);
    const mountTopologyValid = initialStaging.valid && finalStaging.valid;
    const cleanup = cleanupAuthority(executable, resources);
    if (cleanup.cleaned) resources = undefined;
    const result = readWorkerResult(initialStaging.outputFiles, exitCode, traces, ended.State, mountTopologyValid, cleanup);
    const projection = recordActual({
      authorityObservation: result.authorityObservation,
      evidenceDir: options.evidenceDir,
      prepared,
      publicationCapability: ACTUAL_PUBLICATION_CAPABILITY,
      repoRoot: contract.repoRoot,
      runRoot: options.runRoot,
      workerResult: result.workerResult,
      workerObservation: result.workerObservation,
    });
    writeJsonExclusive(join(layout.root, 'authority-trace.json'), projection.authorityObservation);
    validateRouteEvidence({ evidenceDir: options.evidenceDir, repoRoot: contract.repoRoot, requireActual: true });
    return projection;
  } finally {
    cleanupAuthority(executable, resources);
  }
}
