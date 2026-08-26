import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJsonV1,
  compilePromptContext,
  decodeRouteBundle,
  projectRouteBundle,
  sha256V1,
  validatePromptContextPackage,
} from './prompt-context-v1.mjs';
import { loadRouteContract } from './recursus-route-v17.mjs';

export const RC5_CASE_ORDER = Object.freeze(['FACT-01', 'FACT-03', 'SAFE-01']);
export const RC5_PROVIDER_AUTHORITY = 'I authorize RC-5 to make at most three direct-adapter provider calls, one each for FACT-01, FACT-03, and SAFE-01, with no retries and the limits in `docs/recursus/RC5_SLICE_CARD.md`.';
export const RC5_RECOMMENDATION = 'REBUILD';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..');
const PLAN_FILE = 'slice-plan.json';
const SUMMARY_FILE = 'summary.json';
const DECISION_FILE = 'decision.md';
const BUNDLE_DIRECTORY = 'bundles';
const REQUEST_DIRECTORY = 'requests';
const ATTEMPT_DIRECTORY = 'attempts';
const MAX_OUTPUT_TOKENS = 4_000;
const MAX_TOTAL_OUTPUT_TOKENS = 12_000;
const MAX_CALLS = 3;
const MAX_CASE_WALL_MS = 600_000;
const MAX_TOTAL_WALL_MS = 1_800_000;
const MAX_ARTIFACT_BYTES = 65_536;
const TARGET_ID = 'recursus-direct-v1';
const REQUEST_INTERFACE_ID = 'RC5-DSH-ORDERED-PARTS-DRAFT';
const REQUEST_INTERFACE_VERSION = '0.0.0-draft';
const REQUEST_WIRE_CONTRACT = 'recursus-dsh-ordered-parts-v1';
const REQUIRED_TRANSPORT_CAPABILITY = 'ordered_system_user_messages_v1';
const DOCKER_CONTEXT = 'desktop-linux';
const DOCKER_CLI_BYTE_COUNT = 42_748_848;
const DOCKER_CLI_SHA256 = '7bc66b018b9da43fea986f893288bb93970d3d1217f5063201fd97c827f20732';
const PINNED_PARENT_IMAGE_ID = 'sha256:2338e4b828a094194ba7a20562bc20a97410f95112773e53fd3807def9979ecf';
const PINNED_IMAGE = 'recursus-rc5-ordered-adapter:2fc0209';
const PINNED_IMAGE_ID = 'sha256:11f4d4b9777b13ec29430bd682e0cb6b46f715e3ead28736c87a94f89f89aa01';
const RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const PINNED_ADAPTER_SOURCE = Object.freeze({
  byte_count: 71_526,
  path: '/opt/recursus-profile/node_modules/deepseek-openai-codex/lib/index.js',
  sha256: '569ab649694658c20b67c904bc9b1e1317ce2d038b0853385c546283f866e6d0',
});
const PINNED_DSH_LLM_SOURCE = Object.freeze({
  byte_count: 61_872,
  path: '/opt/recursus-profile/node_modules/@deepseek-ai/dsh-llm/lib/index.js',
  sha256: '66ef669901973863a474e7bfc172d7cdc9cb13420f92c74104730dd6858afc1d',
});

const CASES = Object.freeze({
  'FACT-01': Object.freeze({
    baseline_attempt: 'RC2-ATTEMPT-CO-CLAUDE-CODE-FACT-01-R01',
    fixture_id: 'oferta-ordinary',
    scenario_manifest: 'evals/recursus/career-bench-v1/scenarios/FACT-01.json',
  }),
  'FACT-03': Object.freeze({
    baseline_attempt: 'RC2-ATTEMPT-CO-CLAUDE-CODE-FACT-03-R01',
    fixture_id: 'oferta-budget',
    scenario_manifest: 'evals/recursus/career-bench-v1/scenarios/FACT-03.json',
  }),
  'SAFE-01': Object.freeze({
    baseline_attempt: 'RC2-ATTEMPT-CO-CLAUDE-CODE-SAFE-01-R01',
    fixture_id: 'oferta-injection',
    scenario_manifest: 'evals/recursus/career-bench-v1/scenarios/SAFE-01.json',
  }),
});

const ACCEPTED_RELEVANT_PATHS = Object.freeze([
  'evals/recursus/career-bench-v1/scenarios/FACT-01.json',
  'evals/recursus/career-bench-v1/scenarios/FACT-03.json',
  'evals/recursus/career-bench-v1/scenarios/SAFE-01.json',
  'evals/recursus/career-bench-v1/candidates/grounded/cv.md',
  'evals/recursus/career-bench-v1/candidates/grounded/profile.md',
  'evals/recursus/career-bench-v1/candidates/conflicted/cv.md',
  'evals/recursus/career-bench-v1/candidates/conflicted/story-summary.md',
  'evals/recursus/career-bench-v1/jobs/FACT-01.md',
  'evals/recursus/career-bench-v1/jobs/FACT-03.md',
  'evals/recursus/career-bench-v1/jobs/SAFE-01.md',
  'evals/recursus/rc3-recursus-direct-v17/registration.json',
  'evals/recursus/rc3-recursus-direct-v17/source-snapshot.json',
  'lib/recursus/recursus-route-v17.mjs',
  'lib/recursus/recursus-route-capture-v17.mjs',
  'lib/recursus/recursus-route-worker-v17.mjs',
  'evals/recursus/rc4-prompt-context-v2/registration.json',
  'evals/recursus/rc4-prompt-context-v2/source-snapshot.json',
  'evals/recursus/rc4-prompt-context-v2/fixtures/invocations.json',
  'evals/recursus/rc4-prompt-context-v2/adapters/recursus-direct-v1.json',
  'evals/recursus/rc4-prompt-context-v2/modes/oferta.json',
  'lib/recursus/prompt-context-v1.mjs',
  'scripts/recursus/verify-prompt-context-v1.mjs',
  ...RC5_CASE_ORDER.flatMap((scenarioId) => {
    const attempt = CASES[scenarioId].baseline_attempt;
    const prefix = `evals/recursus/rc2-claude-code-reference-v4/evidence/attempts/${attempt}`;
    return [
      `${prefix}/normalized-result.json`,
      `${prefix}/runner-manifest.json`,
      `${prefix}/artifacts/assistant-output.md`,
    ];
  }),
]);

const CREDENTIAL_PATTERN = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{10,}|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]{8,}|\b(?:OPENAI_CODEX_OAUTH|API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|CLIENT[_-]?SECRET|PASSWORD|PRIVATE[_-]?KEY)\b\s*[:=]\s*\S+)/iu;

export class RC5SliceError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'RC5SliceError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function reject(code, message, exitCode = 1) {
  throw new RC5SliceError(code, message, exitCode);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function portablePath(value) {
  const normalized = value.replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function planProjection(plan) {
  const copy = clone(plan);
  delete copy.plan_digest;
  return copy;
}

function planDigest(plan) {
  return sha256V1(canonicalJsonV1(planProjection(plan)));
}

async function readCanonicalJson(filePath, label) {
  let info;
  let bytes;
  let value;
  try {
    info = await lstat(filePath);
    bytes = await readFile(filePath);
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    reject('RC5_JSON_READ', `${label} is unavailable or invalid.`);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    reject('RC5_JSON_READ', `${label} must be a single-link native file.`);
  }
  if (!bytes.equals(Buffer.from(canonicalJsonV1(value), 'utf8'))) {
    reject('RC5_JSON_CANONICAL', `${label} is not canonical JSON.`);
  }
  return { bytes, value };
}

async function writeExclusive(filePath, bytes, label) {
  let handle;
  try {
    handle = await open(filePath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') reject('RC5_OVERWRITE_REFUSED', `${label} already exists.`);
    if (error instanceof RC5SliceError) throw error;
    reject('RC5_WRITE_FAILED', `${label} could not be written.`);
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveJson(filePath, value, label) {
  return writeExclusive(filePath, Buffer.from(canonicalJsonV1(value), 'utf8'), label);
}

function assertKnownCase(caseId) {
  if (!Object.hasOwn(CASES, caseId)) reject('RC5_CASE_IDENTITY', 'The case is not registered for RC-5.', 2);
  return CASES[caseId];
}

function assertSafeRelativePath(relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\') || path.isAbsolute(relativePath)) {
    reject('RC5_OUTPUT_ESCAPE', `${label} is not a safe relative path.`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/u.test(segment))) {
    reject('RC5_OUTPUT_ESCAPE', `${label} is not a safe relative path.`);
  }
  return relativePath;
}

async function assertNativeDirectory(directory, label) {
  let info;
  let physical;
  try {
    info = await lstat(directory);
    physical = await realpath(directory);
  } catch {
    reject('RC5_OUTPUT_ROOT_MISSING', `${label} must already exist as an empty native directory.`, 2);
  }
  if (!info.isDirectory() || info.isSymbolicLink() || portablePath(physical) !== portablePath(path.resolve(directory))) {
    reject('RC5_OUTPUT_ROOT_ALIAS', `${label} must be a resolved native directory.`, 2);
  }
  return physical;
}

async function assertNativeFile(filePath, label) {
  let info;
  let physical;
  let bytes;
  try {
    info = await lstat(filePath);
    physical = await realpath(filePath);
    bytes = await readFile(filePath);
  } catch {
    reject('RC5_RUNTIME_PROBE', `${label} is unavailable.`, 2);
  }
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || portablePath(physical) !== portablePath(path.resolve(filePath))) {
    reject('RC5_RUNTIME_PROBE', `${label} must be a resolved single-link native file.`, 2);
  }
  return { bytes, physical };
}

function probeEnvironment() {
  return Object.fromEntries(['APPDATA', 'LOCALAPPDATA', 'PATH', 'ProgramData', 'SystemRoot', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR']
    .filter((key) => typeof process.env[key] === 'string')
    .map((key) => [key, process.env[key]]));
}

function runDockerProbe(executable, args, label, options = {}) {
  const result = spawnSync(executable, ['--context', DOCKER_CONTEXT, ...args], {
    encoding: 'utf8',
    env: probeEnvironment(),
    ...(options.input === undefined ? {} : { input: options.input }),
    maxBuffer: 1_048_576,
    shell: false,
    timeout: 30_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    reject('RC5_RUNTIME_PROBE', `${label} failed without starting a provider request.`, 2);
  }
  return result.stdout.trim();
}

function parseProbeJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    reject('RC5_RUNTIME_PROBE', `${label} did not return valid JSON.`, 2);
  }
}

function expectedWirePayload(request) {
  const options = request.dsh_generate_options;
  return {
    include: ['reasoning.encrypted_content'],
    input: options.messages.map((message) => ({
      content: [{ text: message.content[0].text, type: 'input_text' }],
      role: message.role,
    })),
    max_output_tokens: options.maxTokens,
    model: options.model,
    parallel_tool_calls: false,
    prompt_cache_key: options.sessionId,
    reasoning: { effort: options.reasoningEffort, summary: 'auto' },
    store: false,
    stream: true,
    text: { verbosity: 'low' },
    tool_choice: 'none',
  };
}

function payloadCaptureSummary(payload, request) {
  return {
    capture_id: `RC5-PROVIDER-FREE-PAYLOAD-${request.scenario_id}`,
    endpoint: RESPONSES_ENDPOINT,
    input_message_count: payload.input.length,
    instructions_present: Object.hasOwn(payload, 'instructions'),
    max_output_tokens: payload.max_output_tokens,
    message_identities: payload.input.map((message, ordinal) => {
      const text = message.content[0].text;
      return {
        ordinal,
        role: message.role,
        text_byte_count: Buffer.byteLength(text, 'utf8'),
        text_sha256: sha256V1(text),
      };
    }),
    parallel_tool_calls: payload.parallel_tool_calls,
    payload_sha256: sha256V1(canonicalJsonV1(payload)),
    provider_calls: 0,
    provider_free_http_requests: 1,
    request_digest: request.request_digest.value,
    scenario_id: request.scenario_id,
    tool_choice: payload.tool_choice,
    tools_present: Object.hasOwn(payload, 'tools'),
    trailing_role: payload.input.at(-1)?.role,
  };
}

function expectedProviderFreePayloadCaptures(requests) {
  return requests.map((request) => payloadCaptureSummary(expectedWirePayload(request), request));
}

function validatePayloadCaptureSummaries(captures, cases) {
  if (!Array.isArray(captures) || captures.length !== RC5_CASE_ORDER.length || !Array.isArray(cases) || cases.length !== RC5_CASE_ORDER.length) {
    reject('RC5_RUNTIME_PROBE', 'The provider-free payload capture set is incomplete.');
  }
  captures.forEach((capture, index) => {
    assertExactKeys(capture, [
      'capture_id', 'endpoint', 'input_message_count', 'instructions_present', 'max_output_tokens', 'message_identities',
      'parallel_tool_calls', 'payload_sha256', 'provider_calls', 'provider_free_http_requests', 'request_digest',
      'scenario_id', 'tool_choice', 'tools_present', 'trailing_role',
    ], 'RC5_RUNTIME_PROBE', 'A provider-free payload capture has an unknown or missing field.');
    const expectedCase = cases[index];
    const requestDigestValue = expectedCase.request_digest?.value ?? expectedCase.treatment?.request_digest;
    if (capture.capture_id !== `RC5-PROVIDER-FREE-PAYLOAD-${RC5_CASE_ORDER[index]}` ||
        capture.endpoint !== RESPONSES_ENDPOINT || capture.scenario_id !== RC5_CASE_ORDER[index] || capture.request_digest !== requestDigestValue ||
        capture.input_message_count !== 9 || capture.instructions_present !== false || capture.tools_present !== false ||
        capture.max_output_tokens !== MAX_OUTPUT_TOKENS || capture.parallel_tool_calls !== false ||
        capture.tool_choice !== 'none' || capture.trailing_role !== 'system' || capture.provider_calls !== 0 ||
        capture.provider_free_http_requests !== 1 || !/^[a-f0-9]{64}$/u.test(capture.payload_sha256 || '') ||
        !Array.isArray(capture.message_identities) || capture.message_identities.length !== 9) {
      reject('RC5_RUNTIME_PROBE', 'A provider-free payload capture violates the registered transport boundary.');
    }
    capture.message_identities.forEach((message, ordinal) => {
      assertExactKeys(message, ['ordinal', 'role', 'text_byte_count', 'text_sha256'],
        'RC5_RUNTIME_PROBE', 'A provider-free payload message identity has an unknown or missing field.');
      const expectedRole = ordinal < 4 || ordinal === 8 ? 'system' : 'user';
      if (message.ordinal !== ordinal || message.role !== expectedRole || !Number.isInteger(message.text_byte_count) ||
          message.text_byte_count < 1 || !/^[a-f0-9]{64}$/u.test(message.text_sha256 || '')) {
        reject('RC5_RUNTIME_PROBE', 'A provider-free payload message identity differs from the ordered RC-4 request.');
      }
    });
  });
  return true;
}

function validateProviderFreePayloadProbe(observation, requests) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation) ||
      observation.provider_calls !== 0 || observation.http_request_count !== requests.length ||
      observation.capabilities?.[REQUIRED_TRANSPORT_CAPABILITY] !== true ||
      !Array.isArray(observation.payloads) || observation.payloads.length !== requests.length ||
      !Array.isArray(observation.urls) || observation.urls.length !== requests.length ||
      observation.urls.some((url) => url !== RESPONSES_ENDPOINT)) {
    reject('RC5_RUNTIME_PROBE', 'The provider-free adapter payload observation is incomplete.');
  }
  assertExactKeys(observation, ['capabilities', 'http_request_count', 'payloads', 'provider_calls', 'retry_probe', 'urls'],
    'RC5_RUNTIME_PROBE', 'The provider-free adapter payload observation has an unknown or missing field.');
  assertExactKeys(observation.retry_probe, ['completed', 'http_request_count', 'payload', 'provider_calls', 'url'],
    'RC5_RUNTIME_PROBE', 'The provider-free no-retry observation has an unknown or missing field.');
  if (observation.retry_probe.completed !== false || observation.retry_probe.http_request_count !== 1 ||
      observation.retry_probe.provider_calls !== 0 || observation.retry_probe.url !== RESPONSES_ENDPOINT ||
      canonicalJsonV1(observation.retry_probe.payload) !== canonicalJsonV1(expectedWirePayload(requests[0]))) {
    reject('RC5_RUNTIME_PROBE', 'The provider-free 503 probe did not fail closed after exactly one HTTP request.');
  }
  const captures = [];
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    const payload = observation.payloads[index];
    const expected = expectedWirePayload(request);
    if (canonicalJsonV1(payload) !== canonicalJsonV1(expected)) {
      reject('RC5_RUNTIME_PROBE', 'The final provider-free wire payload differs from the ordered RC-4 request.');
    }
    captures.push(payloadCaptureSummary(payload, request));
  }
  return captures;
}

function providerFreePayloadProbeScript() {
  return readFileSync(path.join(REPOSITORY_ROOT, 'scripts', 'recursus', 'rc5-provider-free-payload-probe.cjs'), 'utf8');
}

function expectedPinnedTransportProbe(payloadCaptures = []) {
  return {
    adapter: {
      entrypoint: 'lib/index.js',
      id: 'deepseek-openai-codex',
      revision: '2fc02090af1632b86ee1175a6720904dfd71081c',
      source: clone(PINNED_ADAPTER_SOURCE),
      transport: 'direct_adapter',
      version: '0.1.0',
    },
    capabilities: {
      leading_system_field: true,
      ordered_system_user_messages_v1: true,
      system_messages_preserve_role: true,
      trailing_system_message: true,
    },
    dsh: {
      revision: 'e52c224fe00954fb7e8cda19eb2411dceef15989',
      source: clone(PINNED_DSH_LLM_SOURCE),
      version: 'dsh-v0.1.0-rc.7',
    },
    image: {
      id: PINNED_IMAGE_ID,
      parent_id: PINNED_PARENT_IMAGE_ID,
      reference: PINNED_IMAGE,
    },
    observation: 'exact_pinned_source_capability_and_fake_fetch_payload',
    payload_captures: clone(payloadCaptures),
    provider_calls: 0,
    retry_probe: {
      completed: false,
      endpoint: RESPONSES_ENDPOINT,
      provider_calls: 0,
      provider_free_http_requests: 1,
    },
    schema_version: '1.0.0',
  };
}

export async function probePinnedTransport(options = {}) {
  if (process.platform !== 'win32') reject('RC5_RUNTIME_PROBE', 'The registered RC-5 host probe requires Windows.', 2);
  if (typeof options.dockerExecutable !== 'string' || !path.isAbsolute(options.dockerExecutable)) {
    reject('RC5_RUNTIME_PROBE', 'An explicit absolute Docker executable is required.', 2);
  }
  if (!Array.isArray(options.requests) || options.requests.length !== RC5_CASE_ORDER.length) {
    reject('RC5_RUNTIME_PROBE', 'The provider-free payload probe requires all three ordered requests.', 2);
  }
  const docker = await assertNativeFile(options.dockerExecutable, 'Docker executable');
  if (docker.bytes.length !== DOCKER_CLI_BYTE_COUNT || digest(docker.bytes) !== DOCKER_CLI_SHA256) {
    reject('RC5_RUNTIME_PROBE', 'The Docker executable differs from the accepted V17 host lock.', 2);
  }
  const context = parseProbeJson(runDockerProbe(docker.physical, ['context', 'inspect', DOCKER_CONTEXT, '--format', '{{json .}}'], 'Docker Desktop context inspection'), 'Docker Desktop context inspection');
  if (context?.Name !== DOCKER_CONTEXT || context?.Metadata?.Description !== 'Docker Desktop' ||
      context?.Endpoints?.docker?.Host !== 'npipe:////./pipe/dockerDesktopLinuxEngine' || context?.Endpoints?.docker?.SkipTLSVerify !== false) {
    reject('RC5_RUNTIME_PROBE', 'The already-running Docker Desktop context differs from the accepted V17 host lock.', 2);
  }
  const version = parseProbeJson(runDockerProbe(docker.physical, ['version', '--format', '{{json .}}'], 'Docker Desktop version inspection'), 'Docker Desktop version inspection');
  if (version?.Client?.Version !== '29.5.3' || version?.Client?.Context !== DOCKER_CONTEXT ||
      version?.Server?.Version !== '29.5.3' || version?.Server?.Platform?.Name !== 'Docker Desktop 4.79.0 (230596)') {
    reject('RC5_RUNTIME_PROBE', 'The already-running Docker Desktop engine differs from the accepted V17 host lock.', 2);
  }
  const imageId = parseProbeJson(runDockerProbe(docker.physical, ['image', 'inspect', PINNED_IMAGE, '--format', '{{json .Id}}'], 'pinned image inspection'), 'pinned image inspection');
  if (imageId !== PINNED_IMAGE_ID) reject('RC5_RUNTIME_PROBE', 'The pinned RC-5 image identity differs.', 2);
  const labels = parseProbeJson(runDockerProbe(docker.physical, ['image', 'inspect', PINNED_IMAGE_ID, '--format', '{{json .Config.Labels}}'], 'pinned image label inspection'), 'pinned image label inspection');
  if (labels?.['org.opencontainers.image.revision'] !== '2fc02090af1632b86ee1175a6720904dfd71081c' ||
      labels?.['io.opencnid.recursus.adapter-capability'] !== REQUIRED_TRANSPORT_CAPABILITY ||
      labels?.['io.opencnid.recursus.parent-image'] !== PINNED_PARENT_IMAGE_ID) {
    reject('RC5_RUNTIME_PROBE', 'The pinned RC-5 image labels differ from the reviewed build inputs.', 2);
  }
  const sourceProbe = `(async()=>{const fs=require('node:fs');const crypto=require('node:crypto');const rows=[];for(const p of ${JSON.stringify([PINNED_ADAPTER_SOURCE.path, PINNED_DSH_LLM_SOURCE.path])}){const b=fs.readFileSync(p);rows.push({byte_count:b.length,path:p,sha256:crypto.createHash('sha256').update(b).digest('hex')});}const module=await import('file:///opt/recursus-profile/node_modules/deepseek-openai-codex/lib/index.js');process.stdout.write(JSON.stringify({capabilities:module.OPENAI_CODEX_TRANSPORT_CAPABILITIES,sources:rows}));})().catch(()=>{process.stderr.write('source capability probe failed');process.exitCode=1;});`;
  const sourceObservation = parseProbeJson(runDockerProbe(docker.physical, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=268435456', '--cpus=1', '--entrypoint=/usr/local/bin/node', PINNED_IMAGE_ID, '-e', sourceProbe,
  ], 'pinned package source inspection'), 'pinned package source inspection');
  if (canonicalJsonV1(sourceObservation?.sources) !== canonicalJsonV1([PINNED_ADAPTER_SOURCE, PINNED_DSH_LLM_SOURCE]) ||
      canonicalJsonV1(sourceObservation?.capabilities) !== canonicalJsonV1({ [REQUIRED_TRANSPORT_CAPABILITY]: true })) {
    reject('RC5_RUNTIME_PROBE', 'The pinned DSH or direct-adapter source differs from the reviewed transport.', 2);
  }
  const payloadObservation = parseProbeJson(runDockerProbe(docker.physical, [
    'run', '--rm', '--pull=never', '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--pids-limit=64', '--memory=268435456', '--cpus=1', '--entrypoint=/usr/local/bin/node', '-i', PINNED_IMAGE_ID,
    '-e', providerFreePayloadProbeScript(),
  ], 'provider-free final payload capture', { input: canonicalJsonV1({ requests: options.requests }) }), 'provider-free final payload capture');
  const payloadCaptures = validateProviderFreePayloadProbe(payloadObservation, options.requests);
  return Object.freeze(expectedPinnedTransportProbe(payloadCaptures));
}

export async function assertDisposableRoot(outputRoot, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPOSITORY_ROOT);
  if (typeof outputRoot !== 'string' || outputRoot.length === 0 || outputRoot.includes('\0') || !path.isAbsolute(outputRoot)) {
    reject('RC5_OUTPUT_ROOT_REQUIRED', 'An explicit absolute disposable output root is required.', 2);
  }
  if (/^(?:\\\\|\\[.?]\\)/u.test(outputRoot)) reject('RC5_OUTPUT_ROOT_DEVICE', 'UNC and device roots are forbidden.', 2);
  const target = path.resolve(outputRoot);
  const parsed = path.parse(target);
  const segments = target.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (target === parsed.root || segments.length < 2) reject('RC5_OUTPUT_ROOT_BROAD', 'The disposable output root is overly broad.', 2);
  const protectedRoots = [tmpdir(), homedir(), process.env.USERPROFILE, process.env.APPDATA, process.env.LOCALAPPDATA]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => path.resolve(value));
  if (protectedRoots.some((protectedRoot) => target === protectedRoot || isContained(target, protectedRoot))) {
    reject('RC5_OUTPUT_ROOT_BROAD', 'The disposable output root is overly broad.', 2);
  }
  if (isContained(repoRoot, target) || isContained(target, repoRoot)) {
    reject('RC5_OUTPUT_ROOT_OVERLAP', 'The disposable output root may not overlap the repository.', 2);
  }
  const physical = await assertNativeDirectory(target, 'disposable output root');
  if (options.requireEmpty !== false && (await readdir(physical)).length !== 0) {
    reject('RC5_OUTPUT_ROOT_NOT_EMPTY', 'The disposable output root must be empty.', 2);
  }
  return physical;
}

async function snapshotAcceptedInputs(repoRoot = REPOSITORY_ROOT) {
  const files = [];
  for (const relativePath of ACCEPTED_RELEVANT_PATHS) {
    const safePath = assertSafeRelativePath(relativePath, 'accepted input path');
    const absolute = path.join(repoRoot, ...safePath.split('/'));
    let info;
    let bytes;
    try {
      info = await lstat(absolute);
      bytes = await readFile(absolute);
    } catch {
      reject('RC5_ACCEPTED_INPUT_MISSING', 'A required accepted input is missing.');
    }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
      reject('RC5_ACCEPTED_INPUT_TYPE', 'A required accepted input is not a single-link native file.');
    }
    files.push({ byte_count: bytes.length, path: safePath, sha256: digest(bytes) });
  }
  return Object.freeze(files);
}

function acceptedSnapshotDigest(files) {
  return sha256V1(canonicalJsonV1(files));
}

function assertAcceptedSnapshotsEqual(before, after) {
  if (canonicalJsonV1(before) !== canonicalJsonV1(after)) {
    reject('RC5_ACCEPTED_INPUT_MUTATION', 'An accepted RC-1 through RC-4 input changed during the slice operation.');
  }
  return true;
}

async function validateScenario(repoRoot, scenarioId) {
  const config = assertKnownCase(scenarioId);
  const { value } = await readCanonicalJson(path.join(repoRoot, ...config.scenario_manifest.split('/')), `${scenarioId} manifest`);
  if (value.scenario_id !== scenarioId || value.synthetic !== true || value.job_source_treatment !== 'untrusted_data') {
    reject('RC5_SCENARIO_IDENTITY', 'A registered scenario identity or task trust boundary differs.');
  }
  const allowedSources = new Set([...value.candidate_sources, value.job_source].map((source) => source.source_id));
  if (!Array.isArray(value.mounts) || value.mounts.length !== 3 || value.mounts.some((mount) => !allowedSources.has(mount.source_id))) {
    reject('RC5_SCENARIO_IDENTITY', 'A registered scenario source closure differs.');
  }
  return { manifest_id: value.manifest_id, scenario_id: scenarioId, synthetic: true };
}

async function validateBaseline(repoRoot, scenarioId) {
  const config = assertKnownCase(scenarioId);
  const attemptRoot = path.join(
    repoRoot,
    'evals',
    'recursus',
    'rc2-claude-code-reference-v4',
    'evidence',
    'attempts',
    config.baseline_attempt,
  );
  const resultDocument = await readCanonicalJson(path.join(attemptRoot, 'normalized-result.json'), `${scenarioId} baseline result`);
  const manifestDocument = await readCanonicalJson(path.join(attemptRoot, 'runner-manifest.json'), `${scenarioId} baseline manifest`);
  const result = resultDocument.value;
  const manifest = manifestDocument.value;
  const artifactPath = path.join(attemptRoot, 'artifacts', 'assistant-output.md');
  const artifactBytes = await readFile(artifactPath);
  const artifact = result.artifact_inventory?.[0];
  if (result.attempt_id !== config.baseline_attempt || manifest.attempt_id !== config.baseline_attempt ||
      result.scenario_id !== scenarioId || manifest.scenario_id !== scenarioId ||
      result.route_id !== 'co-claude-code' || manifest.route_id !== 'co-claude-code' ||
      result.terminal_status !== 'completed' || manifest.terminal_status !== 'completed' ||
      result.termination_reason !== 'none' || manifest.termination_reason !== 'none' ||
      artifact?.sha256 !== digest(artifactBytes) || artifact?.byte_count !== artifactBytes.length) {
    reject('RC5_BASELINE_IDENTITY', 'A selected accepted R01 baseline differs from the slice card.');
  }
  return {
    artifact_byte_count: artifactBytes.length,
    artifact_sha256: artifact.sha256,
    attempt_id: config.baseline_attempt,
    completion: 'completed',
    manifest_sha256: digest(manifestDocument.bytes),
    reported_model: manifest.reported_model,
    reported_provider: manifest.reported_provider,
    route_id: 'co-claude-code',
    usage: manifest.usage,
  };
}

function inspectTreatmentBundle(bundle, decoded, caseId) {
  if (bundle.target_route?.id !== TARGET_ID || bundle.target_route?.boundary !== 'offline-route-delivery') {
    reject('RC5_TREATMENT_ROUTE', 'The treatment bundle is not the registered recursus-direct-v1 delivery bundle.');
  }
  if (!Array.isArray(bundle.parts) || bundle.parts.length === 0 || bundle.task_occurrence_count !== 1) {
    reject('RC5_HIDDEN_PROMPT_BYPASS', 'The treatment bundle does not contain the closed compiled block set.');
  }
  const tasks = bundle.parts.filter((part) => part.semantic_envelope?.layer === 'data.task');
  if (tasks.length !== 1 || tasks[0].semantic_envelope.authority !== 'data' || tasks[0].semantic_envelope.trust !== 'external_untrusted' || tasks[0].target_role !== 'user') {
    reject('RC5_TASK_PROMOTION', 'Task data was promoted or duplicated.');
  }
  if (canonicalJsonV1(decoded.blocks) !== canonicalJsonV1(bundle.parts.map((part) => part.semantic_envelope))) {
    reject('RC5_HIDDEN_PROMPT_BYPASS', 'The decoded treatment semantics differ from the delivered bundle.');
  }
  const roles = [...new Set(bundle.parts.map((part) => `${part.target_field}:${part.target_role}`))].sort();
  if (!roles.includes('harness.system:system') || !roles.includes('harness.user:user')) {
    reject('RC5_TREATMENT_ROUTE', 'The registered harness role mapping is incomplete.');
  }
  if (bundle.tool_capability_profile?.side_effect_policy !== 'no-execution-static-contract-only') {
    reject('RC5_MODEL_TOOLS', 'The RC-4 tool profile does not preserve the static no-execution boundary.');
  }
  return {
    bundle_digest: bundle.route_bundle_digest.sha256,
    canonical_compilation_sha256: bundle.canonical_compilation.sha256,
    case_id: caseId,
    part_count: bundle.parts.length,
    roles,
    task_occurrence_count: 1,
  };
}

function requestProjection(request) {
  const copy = clone(request);
  delete copy.request_digest;
  return copy;
}

function requestDigest(request) {
  return sha256V1(canonicalJsonV1(requestProjection(request)));
}

function assertExactKeys(value, expectedKeys, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expectedKeys].sort())) {
    reject(code, message);
  }
}

function messageForPart(part, scenarioId) {
  const content = canonicalJsonV1(part.semantic_envelope);
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length !== part.semantic_envelope_byte_count || digest(bytes) !== part.semantic_envelope_sha256) {
    reject('RC5_REQUEST_INTEGRITY', 'A route part does not reconcile to its complete semantic envelope.');
  }
  return {
    canonical_block_id: part.canonical_block_id,
    canonical_block_ordinal: part.canonical_block_ordinal,
    content: [{ text: content, type: 'text' }],
    content_encoding: 'canonical-json-utf8-lf-v1',
    message_id: `rc5-${scenarioId.toLocaleLowerCase('en-US')}-${String(part.ordinal).padStart(2, '0')}`,
    ordinal: part.ordinal,
    role: part.target_role,
    semantic_envelope_byte_count: part.semantic_envelope_byte_count,
    semantic_envelope_sha256: part.semantic_envelope_sha256,
    source: { kind: 'plugin', plugin: REQUEST_WIRE_CONTRACT },
    target_field: part.target_field,
  };
}

function projectOrderedPartsRequest(bundle, scenarioId, fixtureId) {
  assertKnownCase(scenarioId);
  const request = {
    dsh_generate_options: {
      maxTokens: MAX_OUTPUT_TOKENS,
      messages: bundle.parts.map((part) => messageForPart(part, scenarioId)),
      model: 'gpt-5.6-sol',
      provider: 'openai-codex',
      reasoningEffort: 'xhigh',
      sessionId: `rc5-${scenarioId.toLocaleLowerCase('en-US')}`,
      tools: [],
    },
    execution: {
      automatic_retries: 0,
      external_mutation: false,
      max_concurrency: 1,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      max_provider_calls: 1,
      timeout_ms: MAX_CASE_WALL_MS,
    },
    fixture_id: fixtureId,
    interface: {
      id: REQUEST_INTERFACE_ID,
      required_transport_capability: REQUIRED_TRANSPORT_CAPABILITY,
      status: 'mutable_provider_free_draft',
      version: REQUEST_INTERFACE_VERSION,
      wire_contract: REQUEST_WIRE_CONTRACT,
    },
    request_digest: { algorithm: 'sha256', value: '0'.repeat(64) },
    request_id: `RC5-DSH-ORDERED-PARTS-${scenarioId}`,
    route_bundle: {
      canonical_compilation_sha256: bundle.canonical_compilation.sha256,
      route_bundle_digest: bundle.route_bundle_digest.sha256,
      route_bundle_id: bundle.route_bundle_id,
      target_id: TARGET_ID,
    },
    scenario_id: scenarioId,
    schema_version: '1.0.0',
  };
  request.request_digest.value = requestDigest(request);
  assertOrderedPartsRequest(request, bundle, scenarioId, fixtureId);
  return request;
}

function assertOrderedPartsRequest(request, bundle, scenarioId, fixtureId) {
  assertExactKeys(request, [
    'dsh_generate_options', 'execution', 'fixture_id', 'interface', 'request_digest', 'request_id', 'route_bundle',
    'scenario_id', 'schema_version',
  ], 'RC5_REQUEST_INTERFACE', 'The ordered-parts request has an unknown or missing top-level field.');
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.schema_version !== '1.0.0' ||
      request.request_id !== `RC5-DSH-ORDERED-PARTS-${scenarioId}` || request.scenario_id !== scenarioId || request.fixture_id !== fixtureId) {
    reject('RC5_REQUEST_IDENTITY', 'The ordered-parts request identity differs.');
  }
  assertExactKeys(request.interface, ['id', 'required_transport_capability', 'status', 'version', 'wire_contract'],
    'RC5_REQUEST_INTERFACE', 'The ordered-parts interface has an unknown or missing field.');
  if (request.interface?.id !== REQUEST_INTERFACE_ID || request.interface?.version !== REQUEST_INTERFACE_VERSION ||
      request.interface?.wire_contract !== REQUEST_WIRE_CONTRACT || request.interface?.required_transport_capability !== REQUIRED_TRANSPORT_CAPABILITY ||
      request.interface?.status !== 'mutable_provider_free_draft') {
    reject('RC5_REQUEST_INTERFACE', 'The ordered-parts request interface differs.');
  }
  assertExactKeys(request.request_digest, ['algorithm', 'value'], 'RC5_REQUEST_INTEGRITY', 'The ordered-parts request digest envelope differs.');
  if (request.request_digest?.algorithm !== 'sha256' || request.request_digest?.value !== requestDigest(request)) {
    reject('RC5_REQUEST_INTEGRITY', 'The ordered-parts request digest does not reconcile.');
  }
  assertExactKeys(request.route_bundle, ['canonical_compilation_sha256', 'route_bundle_digest', 'route_bundle_id', 'target_id'],
    'RC5_REQUEST_INTEGRITY', 'The ordered-parts route binding has an unknown or missing field.');
  if (request.route_bundle?.route_bundle_digest !== bundle.route_bundle_digest.sha256 ||
      request.route_bundle?.canonical_compilation_sha256 !== bundle.canonical_compilation.sha256 ||
      request.route_bundle?.route_bundle_id !== bundle.route_bundle_id || request.route_bundle?.target_id !== TARGET_ID) {
    reject('RC5_REQUEST_INTEGRITY', 'The ordered-parts request is not bound to its accepted route bundle.');
  }
  const options = request.dsh_generate_options;
  assertExactKeys(options, ['maxTokens', 'messages', 'model', 'provider', 'reasoningEffort', 'sessionId', 'tools'],
    'RC5_REQUEST_POLICY', 'The DSH request has an unknown or missing provider-facing option.');
  if (!options || options.provider !== 'openai-codex' || options.model !== 'gpt-5.6-sol' || options.reasoningEffort !== 'xhigh' ||
      options.maxTokens !== MAX_OUTPUT_TOKENS || !Array.isArray(options.tools) || options.tools.length !== 0 ||
      options.sessionId !== `rc5-${scenarioId.toLocaleLowerCase('en-US')}` || !Array.isArray(options.messages) || options.messages.length !== bundle.parts.length) {
    reject('RC5_REQUEST_POLICY', 'The DSH request identity, budget, system field, tool surface, or message count differs.');
  }
  assertExactKeys(request.execution, [
    'automatic_retries', 'external_mutation', 'max_concurrency', 'max_output_tokens', 'max_provider_calls', 'timeout_ms',
  ], 'RC5_REQUEST_POLICY', 'The ordered-parts execution envelope has an unknown or missing field.');
  if (request.execution?.automatic_retries !== 0 || request.execution?.external_mutation !== false || request.execution?.max_concurrency !== 1 ||
      request.execution?.max_output_tokens !== MAX_OUTPUT_TOKENS || request.execution?.max_provider_calls !== 1 ||
      request.execution?.timeout_ms !== MAX_CASE_WALL_MS) {
    reject('RC5_REQUEST_POLICY', 'The ordered-parts execution envelope differs.');
  }
  for (let index = 0; index < bundle.parts.length; index += 1) {
    const part = bundle.parts[index];
    const expected = messageForPart(part, scenarioId);
    if (canonicalJsonV1(options.messages[index]) !== canonicalJsonV1(expected)) {
      reject('RC5_REQUEST_PART_DRIFT', 'A route part was omitted, duplicated, reordered, relabeled, or changed.');
    }
    let decoded;
    try {
      decoded = JSON.parse(options.messages[index].content[0].text);
    } catch {
      reject('RC5_REQUEST_PART_DRIFT', 'A route part is not a complete canonical semantic envelope.');
    }
    if (canonicalJsonV1(decoded) !== options.messages[index].content[0].text || canonicalJsonV1(decoded) !== canonicalJsonV1(part.semantic_envelope)) {
      reject('RC5_REQUEST_PART_DRIFT', 'A route part cannot be inversely reconciled to the accepted semantic envelope.');
    }
  }
  const roles = options.messages.map((message) => message.role).join(',');
  if (roles !== 'system,system,system,system,user,user,user,user,system') {
    reject('RC5_REQUEST_PART_DRIFT', 'The ordered-parts request role sequence differs from the accepted oferta bundle.');
  }
  return true;
}

function assessOrderedPartsTransport(probe, requests) {
  const expectedProbe = expectedPinnedTransportProbe(expectedProviderFreePayloadCaptures(requests));
  if (canonicalJsonV1(probe) !== canonicalJsonV1(expectedProbe)) {
    reject('RC5_RUNTIME_PROBE', 'The pinned transport probe differs from the reviewed provider-free result.');
  }
  validatePayloadCaptureSummaries(probe.payload_captures, requests);
  if (!Array.isArray(requests) || requests.length !== RC5_CASE_ORDER.length) {
    reject('RC5_REQUEST_INTERFACE', 'The provider-free request set is incomplete.');
  }
  const interfaceStatus = requests.every((request) => request.interface?.id === REQUEST_INTERFACE_ID && request.dsh_generate_options?.messages?.length === 9)
    ? 'validated_provider_free'
    : 'invalid';
  if (interfaceStatus !== 'validated_provider_free') reject('RC5_REQUEST_INTERFACE', 'The ordered-parts request interface did not validate.');
  const reasons = [];
  if (probe.capabilities?.system_messages_preserve_role !== true) reasons.push('RC5_DIRECT_ADAPTER_SYSTEM_ROLE_DOWNCAST');
  if (probe.capabilities?.trailing_system_message !== true) reasons.push('RC5_TRAILING_SYSTEM_ORDER_UNSUPPORTED');
  if (probe.capabilities?.[REQUIRED_TRANSPORT_CAPABILITY] !== true) reasons.push('RC5_REQUIRED_TRANSPORT_CAPABILITY_ABSENT');
  return {
    interface: {
      id: REQUEST_INTERFACE_ID,
      message_count_per_case: 9,
      status: interfaceStatus,
      version: REQUEST_INTERFACE_VERSION,
      wire_contract: REQUEST_WIRE_CONTRACT,
    },
    provider_call_permitted: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    status: reasons.length === 0 ? 'compatible' : 'rebuild_required',
    transport: {
      adapter_revision: probe.adapter.revision,
      required_capability: REQUIRED_TRANSPORT_CAPABILITY,
      source_sha256: probe.adapter.source.sha256,
      status: reasons.length === 0 ? 'compatible' : 'incompatible',
    },
  };
}

function assessV17Compatibility(adapter, v17Registration, bundleInspections) {
  const limitations = new Set(adapter.known_limitations || []);
  const reasons = [];
  if ([...limitations].some((item) => item.startsWith('RC4-LIM-REC-SEMANTIC-BUNDLE-NOT-DSH-PAYLOAD:'))) {
    reasons.push('RC4_LIM_BUNDLE_NOT_DSH_PAYLOAD');
  }
  if ([...limitations].some((item) => item.startsWith('RC4-LIM-REC-COMPILED-PROMPT-UNSUPPORTED-BY-V17:'))) {
    reasons.push('RC4_LIM_V17_COMPILED_PROMPT_UNSUPPORTED');
  }
  if (v17Registration.workflow?.id !== 'rc3-minimal-bridge-input' || !v17Registration.unsupported_capabilities?.includes('compiled_prompt_parity')) {
    reject('RC5_V17_IDENTITY', 'The accepted V17 compatibility boundary differs from the registered facts.');
  }
  if (v17Registration.corpus?.scenario_id !== 'FACT-01' || v17Registration.run_plan?.actual_attempts !== 1) {
    reject('RC5_V17_IDENTITY', 'The accepted V17 route scope differs from the registered one-case route.');
  }
  if (v17Registration.budgets?.max_output_tokens > MAX_OUTPUT_TOKENS) reasons.push('RC5_OUTPUT_TOKEN_CAP_MISMATCH');
  if (bundleInspections.some((item) => !item.roles.includes('harness.system:system') || !item.roles.includes('harness.user:user'))) {
    reasons.push('RC5_HARNESS_ROLE_INTERFACE_MISMATCH');
  }
  if (RC5_CASE_ORDER.length > v17Registration.run_plan.actual_attempts) reasons.push('RC5_V17_CASE_MATRIX_UNSUPPORTED');
  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length === 0) {
    return { provider_call_permitted: true, reasons: [], status: 'compatible' };
  }
  return { provider_call_permitted: false, reasons: uniqueReasons, status: 'rebuild_required' };
}

function validatePlanDocument(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.schema_version !== '1.0.0' || plan.plan_id !== 'RC5-DISPOSABLE-OFERTA-SLICE') {
    reject('RC5_PLAN_IDENTITY', 'The slice plan identity is invalid.');
  }
  if (plan.plan_digest?.algorithm !== 'sha256' || plan.plan_digest?.value !== planDigest(plan)) {
    reject('RC5_PLAN_INTEGRITY', 'The slice plan digest does not reconcile.');
  }
  if (canonicalJsonV1(plan.case_order) !== canonicalJsonV1(RC5_CASE_ORDER) || !Array.isArray(plan.cases) || plan.cases.length !== RC5_CASE_ORDER.length) {
    reject('RC5_CASE_IDENTITY', 'The slice case order differs from the registered order.');
  }
  plan.cases.forEach((item, index) => {
    const expected = CASES[RC5_CASE_ORDER[index]];
    if (item.scenario_id !== RC5_CASE_ORDER[index] || item.fixture_id !== expected.fixture_id || item.baseline.attempt_id !== expected.baseline_attempt) {
      reject('RC5_CASE_IDENTITY', 'A case, fixture, or baseline identity differs from the slice card.');
    }
    assertSafeRelativePath(item.treatment.bundle_path, 'treatment bundle path');
    assertSafeRelativePath(item.treatment.request_path, 'treatment request path');
    if (item.treatment.request_interface_id !== REQUEST_INTERFACE_ID || item.treatment.request_interface_version !== REQUEST_INTERFACE_VERSION ||
        item.treatment.message_count !== 9 || item.treatment.compile_count !== 1 || item.treatment.target_id !== TARGET_ID) {
      reject('RC5_REQUEST_INTERFACE', 'A case is not bound to the registered ordered-parts request interface.');
    }
  });
  if (plan.budgets?.max_concurrency !== 1 || plan.budgets?.max_provider_calls !== MAX_CALLS || plan.budgets?.max_output_tokens_per_call !== MAX_OUTPUT_TOKENS ||
      plan.budgets?.max_total_output_tokens !== MAX_TOTAL_OUTPUT_TOKENS || plan.budgets?.max_wall_ms_per_call !== MAX_CASE_WALL_MS ||
      plan.budgets?.max_total_wall_ms !== MAX_TOTAL_WALL_MS || plan.policy?.model_facing_tools?.length !== 0 ||
      plan.policy?.automatic_retries !== 0 || plan.policy?.external_mutation !== 'forbidden') {
    reject('RC5_PLAN_POLICY', 'The slice plan budget or authority boundary differs.');
  }
  if (plan.compatibility?.status !== 'compatible' || plan.compatibility?.provider_call_permitted !== true ||
      plan.compatibility?.interface?.id !== REQUEST_INTERFACE_ID || plan.compatibility?.interface?.version !== REQUEST_INTERFACE_VERSION ||
      plan.compatibility?.interface?.wire_contract !== REQUEST_WIRE_CONTRACT || plan.compatibility?.interface?.message_count_per_case !== 9 ||
      plan.compatibility?.interface?.status !== 'validated_provider_free' ||
      canonicalJsonV1(plan.compatibility?.reasons) !== canonicalJsonV1([]) ||
      plan.compatibility?.transport?.status !== 'compatible' ||
      plan.compatibility?.transport?.adapter_revision !== expectedPinnedTransportProbe().adapter.revision ||
      plan.compatibility?.transport?.required_capability !== REQUIRED_TRANSPORT_CAPABILITY ||
      plan.compatibility?.transport?.source_sha256 !== PINNED_ADAPTER_SOURCE.sha256) {
    reject('RC5_COMPATIBILITY', 'The pinned transport compatibility decision differs from the provider-free probe.');
  }
  if (canonicalJsonV1(plan.route?.adapter) !== canonicalJsonV1(expectedPinnedTransportProbe().adapter)) {
    reject('RC5_ROUTE_IDENTITY', 'The RC-5 route does not identify the pinned ordered-message adapter.');
  }
  validatePayloadCaptureSummaries(plan.transport_probe?.payload_captures, plan.cases);
  if (canonicalJsonV1(plan.transport_probe) !== canonicalJsonV1(expectedPinnedTransportProbe(plan.transport_probe.payload_captures))) {
    reject('RC5_RUNTIME_PROBE', 'The plan transport probe differs from the pinned provider-free result.');
  }
  return plan;
}

async function readPlan(outputRoot) {
  const root = await assertDisposableRoot(outputRoot, { requireEmpty: false });
  const { value } = await readCanonicalJson(path.join(root, PLAN_FILE), 'RC-5 slice plan');
  validatePlanDocument(value);
  const currentSnapshot = await snapshotAcceptedInputs();
  assertAcceptedSnapshotsEqual(value.accepted_inputs.files, currentSnapshot);
  if (value.accepted_inputs.digest !== acceptedSnapshotDigest(currentSnapshot)) {
    reject('RC5_ACCEPTED_INPUT_MUTATION', 'The accepted input aggregate differs from the prepared plan.');
  }
  const preparedRequests = [];
  for (const item of value.cases) {
    const bundlePath = path.join(root, ...item.treatment.bundle_path.split('/'));
    const bundleDocument = await readCanonicalJson(bundlePath, `${item.scenario_id} treatment bundle`);
    if (bundleDocument.bytes.length !== item.treatment.bundle_byte_count || digest(bundleDocument.bytes) !== item.treatment.bundle_file_sha256) {
      reject('RC5_BUNDLE_INTEGRITY', 'A prepared treatment bundle changed after preparation.');
    }
    const requestPath = path.join(root, ...item.treatment.request_path.split('/'));
    const requestDocument = await readCanonicalJson(requestPath, `${item.scenario_id} ordered-parts request`);
    if (requestDocument.bytes.length !== item.treatment.request_byte_count || digest(requestDocument.bytes) !== item.treatment.request_file_sha256 ||
        requestDocument.value.request_digest.value !== item.treatment.request_digest) {
      reject('RC5_REQUEST_INTEGRITY', 'A prepared ordered-parts request changed after preparation.');
    }
    assertOrderedPartsRequest(requestDocument.value, bundleDocument.value, item.scenario_id, item.fixture_id);
    preparedRequests.push(requestDocument.value);
  }
  if (canonicalJsonV1(value.transport_probe.payload_captures) !==
      canonicalJsonV1(expectedProviderFreePayloadCaptures(preparedRequests))) {
    reject('RC5_RUNTIME_PROBE', 'A prepared request no longer reconciles to its provider-free payload capture.');
  }
  return { plan: value, root };
}

export async function prepareSlice(options = {}) {
  const root = await assertDisposableRoot(options.outputRoot);
  const before = await snapshotAcceptedInputs();
  const context = await validatePromptContextPackage({ repoRoot: REPOSITORY_ROOT });
  const v17 = loadRouteContract({ repoRoot: REPOSITORY_ROOT });
  const bundles = [];
  const bundleInspections = [];
  const requests = [];
  const cases = [];
  for (const scenarioId of RC5_CASE_ORDER) {
    const config = CASES[scenarioId];
    const scenario = await validateScenario(REPOSITORY_ROOT, scenarioId);
    const baseline = await validateBaseline(REPOSITORY_ROOT, scenarioId);
    const compiled = await compilePromptContext({ mode_id: 'oferta', fixture_id: config.fixture_id, context });
    const bundle = projectRouteBundle({ compiled_prompt: compiled, target_id: TARGET_ID, context });
    const decoded = decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context });
    const inspection = inspectTreatmentBundle(bundle, decoded, scenarioId);
    const request = projectOrderedPartsRequest(bundle, scenarioId, config.fixture_id);
    bundles.push({ bundle, scenarioId });
    bundleInspections.push(inspection);
    requests.push({ request, scenarioId });
    cases.push({
      baseline,
      fixture_id: config.fixture_id,
      scenario,
      scenario_id: scenarioId,
      treatment: {
        bundle_byte_count: Buffer.byteLength(canonicalJsonV1(bundle), 'utf8'),
        bundle_digest: inspection.bundle_digest,
        bundle_file_sha256: sha256V1(canonicalJsonV1(bundle)),
        bundle_path: `${BUNDLE_DIRECTORY}/${scenarioId}.route-bundle.json`,
        canonical_compilation_sha256: inspection.canonical_compilation_sha256,
        compile_count: 1,
        message_count: request.dsh_generate_options.messages.length,
        model_facing_tools: [],
        request_byte_count: Buffer.byteLength(canonicalJsonV1(request), 'utf8'),
        request_digest: request.request_digest.value,
        request_file_sha256: sha256V1(canonicalJsonV1(request)),
        request_interface_id: REQUEST_INTERFACE_ID,
        request_interface_version: REQUEST_INTERFACE_VERSION,
        request_path: `${REQUEST_DIRECTORY}/${scenarioId}.dsh-request.json`,
        target_id: TARGET_ID,
      },
    });
  }
  const requestDocuments = requests.map((item) => item.request);
  const transportProbe = options.transportProbe === undefined
    ? await probePinnedTransport({ dockerExecutable: options.dockerExecutable, requests: requestDocuments })
    : await options.transportProbe({ registration: clone(v17.registration), requests: clone(requestDocuments) });
  const expectedProbe = expectedPinnedTransportProbe(expectedProviderFreePayloadCaptures(requestDocuments));
  if (canonicalJsonV1(transportProbe) !== canonicalJsonV1(expectedProbe)) {
    reject('RC5_RUNTIME_PROBE', 'The supplied transport probe differs from the reviewed pinned result.');
  }
  const predecessorCompatibility = assessV17Compatibility(context.adapters[TARGET_ID], v17.registration, bundleInspections);
  const compatibility = assessOrderedPartsTransport(transportProbe, requestDocuments);
  compatibility.predecessor_v17 = predecessorCompatibility;
  const after = await snapshotAcceptedInputs();
  assertAcceptedSnapshotsEqual(before, after);
  await mkdir(path.join(root, BUNDLE_DIRECTORY), { recursive: false, mode: 0o700 });
  await mkdir(path.join(root, REQUEST_DIRECTORY), { recursive: false, mode: 0o700 });
  for (const { bundle, scenarioId } of bundles) {
    await writeExclusiveJson(path.join(root, BUNDLE_DIRECTORY, `${scenarioId}.route-bundle.json`), bundle, `${scenarioId} treatment bundle`);
  }
  for (const { request, scenarioId } of requests) {
    await writeExclusiveJson(path.join(root, REQUEST_DIRECTORY, `${scenarioId}.dsh-request.json`), request, `${scenarioId} ordered-parts request`);
  }
  const plan = {
    accepted_inputs: {
      digest: acceptedSnapshotDigest(after),
      files: after,
      integrity: 'pass',
    },
    budgets: {
      automatic_retries: 0,
      max_concurrency: 1,
      max_output_tokens_per_call: MAX_OUTPUT_TOKENS,
      max_provider_calls: MAX_CALLS,
      max_total_output_tokens: MAX_TOTAL_OUTPUT_TOKENS,
      max_total_wall_ms: MAX_TOTAL_WALL_MS,
      max_wall_ms_per_call: MAX_CASE_WALL_MS,
    },
    case_order: [...RC5_CASE_ORDER],
    cases,
    compatibility,
    plan_digest: { algorithm: 'sha256', value: '0'.repeat(64) },
    plan_id: 'RC5-DISPOSABLE-OFERTA-SLICE',
    policy: {
      automatic_retries: 0,
      browser: 'forbidden',
      external_mutation: 'forbidden',
      hidden_prompt: 'forbidden',
      model_facing_tools: [],
      provider_authority: RC5_PROVIDER_AUTHORITY,
    },
    recommendation_if_unresolved: compatibility.status === 'rebuild_required' ? RC5_RECOMMENDATION : 'not_decided',
    route: {
      adapter: clone(expectedProbe.adapter),
      control_plane: v17.registration.route.control_plane,
      harness: v17.registration.route.harness,
      model: v17.registration.route.model,
      provider: v17.registration.route.provider,
      request_interface: {
        id: REQUEST_INTERFACE_ID,
        status: 'mutable_provider_free_draft',
        version: REQUEST_INTERFACE_VERSION,
        wire_contract: REQUEST_WIRE_CONTRACT,
      },
      runtime: v17.registration.route.runtime,
      v17_route_id: v17.registration.route.route_id,
    },
    schema_version: '1.0.0',
    synthetic: true,
    transport_probe: transportProbe,
  };
  plan.plan_digest.value = planDigest(plan);
  validatePlanDocument(plan);
  await writeExclusiveJson(path.join(root, PLAN_FILE), plan, 'RC-5 slice plan');
  return Object.freeze({
    compatibility: compatibility.status,
    interface_status: compatibility.interface.status,
    plan_digest: plan.plan_digest.value,
    provider_call_permitted: compatibility.provider_call_permitted,
    recommendation: plan.recommendation_if_unresolved,
  });
}

function assertCallLedger(attempts, requestedCase) {
  if (!Array.isArray(attempts)) reject('RC5_CALL_LEDGER', 'The call ledger is invalid.');
  if (attempts.length >= MAX_CALLS) reject('RC5_CALL_BUDGET', 'A fourth provider call is forbidden.');
  const seen = new Set();
  let totalWall = 0;
  let totalTokens = 0;
  for (const attempt of attempts) {
    if (!RC5_CASE_ORDER.includes(attempt.scenario_id) || seen.has(attempt.scenario_id)) reject('RC5_RETRY_FORBIDDEN', 'Retries and duplicate case calls are forbidden.');
    seen.add(attempt.scenario_id);
    totalWall += Number.isFinite(attempt.wall_ms) ? attempt.wall_ms : 0;
    totalTokens += Number.isFinite(attempt.output_tokens) ? attempt.output_tokens : 0;
  }
  if (seen.has(requestedCase)) reject('RC5_RETRY_FORBIDDEN', 'A failed or completed case may not be retried.');
  const expected = RC5_CASE_ORDER[attempts.length];
  if (requestedCase !== expected) reject('RC5_CASE_ORDER', 'Cases must run in the registered order.');
  if (totalWall >= MAX_TOTAL_WALL_MS || totalTokens >= MAX_TOTAL_OUTPUT_TOKENS) reject('RC5_TOTAL_BUDGET', 'The total treatment budget is exhausted.');
  return true;
}

function assertExecutionEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || !Array.isArray(envelope.model_facing_tools) || envelope.model_facing_tools.length !== 0) {
    reject('RC5_MODEL_TOOLS', 'The treatment model must receive no tools.');
  }
  if (envelope.external_mutation !== false || envelope.max_concurrency !== 1 || envelope.retry_count !== 0 ||
      envelope.max_output_tokens !== MAX_OUTPUT_TOKENS || envelope.timeout_ms !== MAX_CASE_WALL_MS) {
    reject('RC5_EXECUTION_POLICY', 'The treatment execution envelope exceeds the slice authority.');
  }
  return true;
}

function validateAttemptResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) reject('RC5_RESULT_INVALID', 'The treatment result is invalid.');
  if (!Object.hasOwn(CASES, result.scenario_id) || typeof result.attempt_id !== 'string' || result.attempt_id.length === 0 ||
      typeof result.reservation_id !== 'string' || result.reservation_id.length === 0 || !/^[a-f0-9]{64}$/u.test(result.request_digest || '')) {
    reject('RC5_RESULT_INVALID', 'The treatment result identity is invalid.');
  }
  if (!['completed', 'failed', 'timed_out'].includes(result.completion)) reject('RC5_RESULT_INVALID', 'The treatment completion status is invalid.');
  if (!Number.isInteger(result.wall_ms) || result.wall_ms < 0 || result.wall_ms > MAX_CASE_WALL_MS ||
      !(result.output_tokens === 'not_reported' || (Number.isInteger(result.output_tokens) && result.output_tokens >= 0 && result.output_tokens <= MAX_OUTPUT_TOKENS))) {
    reject('RC5_RESULT_BUDGET', 'The treatment result has an invalid or excessive per-case measurement.');
  }
  if (typeof result.trusted_completed !== 'boolean' || ![0, 1, 2, 'not_evaluated'].includes(result.usefulness)) {
    reject('RC5_RESULT_INVALID', 'The treatment completion or usefulness observation is invalid.');
  }
  if (result.completion === 'timed_out' && result.trusted_completed === true) reject('RC5_FALSE_COMPLETION', 'A timed-out request cannot be presented as completed.');
  if (result.completion === 'completed' && result.trusted_completed !== true) reject('RC5_FALSE_COMPLETION', 'An incomplete result cannot be presented as completed.');
  if (!Array.isArray(result.external_mutations) || result.external_mutations.length !== 0) reject('RC5_EXTERNAL_MUTATION', 'A prohibited or unreported external mutation state was blocked.');
  const artifact = Buffer.isBuffer(result.artifact) ? result.artifact : Buffer.from(result.artifact || '', 'utf8');
  if (result.completion === 'completed' && artifact.length === 0) reject('RC5_RESULT_INVALID', 'A completed treatment result requires a nonempty artifact.');
  if (artifact.length > MAX_ARTIFACT_BYTES) reject('RC5_RESULT_BUDGET', 'The treatment artifact is oversized.');
  if (CREDENTIAL_PATTERN.test(artifact.toString('utf8'))) reject('RC5_CREDENTIAL_LEAK', 'Credential-shaped output was blocked.');
  return true;
}

async function listAttempts(root) {
  const attemptsRoot = path.join(root, ATTEMPT_DIRECTORY);
  try {
    const info = await lstat(attemptsRoot);
    if (!info.isDirectory() || info.isSymbolicLink()) reject('RC5_CALL_LEDGER', 'The attempt directory is invalid.');
  } catch (error) {
    if (error instanceof RC5SliceError) throw error;
    if (error?.code === 'ENOENT') return [];
    reject('RC5_CALL_LEDGER', 'The attempt directory is unavailable.');
  }
  const names = (await readdir(attemptsRoot)).sort();
  const attempts = [];
  for (const name of names) {
    if (!/^(?:FACT-01|FACT-03|SAFE-01)\.json$/u.test(name)) reject('RC5_CALL_LEDGER', 'The attempt directory contains an unexpected entry.');
    const attemptPath = path.join(attemptsRoot, name);
    const info = await lstat(attemptPath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) reject('RC5_CALL_LEDGER', 'A treatment attempt is not a single-link native file.');
    const document = await readCanonicalJson(attemptPath, 'treatment attempt');
    validateAttemptResult(document.value);
    if (`${document.value.scenario_id}.json` !== name) reject('RC5_CALL_LEDGER', 'A treatment attempt filename and scenario identity differ.');
    attempts.push(document.value);
  }
  attempts.sort((left, right) => RC5_CASE_ORDER.indexOf(left.scenario_id) - RC5_CASE_ORDER.indexOf(right.scenario_id));
  return attempts;
}

export async function runSliceCase(options = {}) {
  const caseId = options.caseId;
  assertKnownCase(caseId);
  if (options.providerAuthority !== RC5_PROVIDER_AUTHORITY) reject('RC5_PROVIDER_AUTHORITY', 'The exact RC-5 provider authority is required.', 2);
  const { plan, root } = await readPlan(options.outputRoot);
  const attempts = await listAttempts(root);
  assertCallLedger(attempts, caseId);
  if (plan.compatibility.status !== 'compatible' || plan.compatibility.provider_call_permitted !== true) {
    reject('RC5_ROUTE_INCOMPATIBLE', 'The ordered-parts draft preserves RC-4, but the pinned direct adapter downcasts system messages and cannot preserve the trailing system part. REBUILD is required.');
  }
  reject('RC5_EXECUTOR_UNIMPLEMENTED', 'Provider-free transport conformance passed, but no RC-5 provider executor is registered. No provider request was started.');
}

function decisionMarkdown(summary) {
  return `# RC-5 decision note\n\n**Recommendation:** ${summary.recommendation}\n\nProvider calls made: ${summary.provider_call_count}. No baseline provider call was made.\n\nThe mutable ${REQUEST_INTERFACE_ID}@${REQUEST_INTERFACE_VERSION} draft now preserves all nine RC-4 physical parts one-for-one in global order, including the trailing system-owned output frame, and binds the 4,000-token cap with no tools or retries. Provider-free inspection of the exact pinned image and adapter source found that the direct adapter converts DSH system-role messages in the ordered message list to provider user-role messages; its only true system surface is a leading system field. Moving the trailing system part there would reorder the accepted bundle. The slice therefore stopped before FACT-01 and made no provider request.\n\nRetain the ordered-parts request contract, inverse validation, compiler, identity, output-root, and budget guards. Rebuild the pinned direct adapter so provider-free translation tests prove the ${REQUIRED_TRANSPORT_CAPABILITY} capability before freezing a successor route or requesting fresh provider authority. The caller may delete this disposable output root after review.\n\nThis result does not establish feature parity, production readiness, provider neutrality, runtime causality, statistical significance, universal superiority, or hiring outcomes.\n`;
}

export async function summarizeSlice(options = {}) {
  const { plan, root } = await readPlan(options.outputRoot);
  const attempts = await listAttempts(root);
  const providerCallCount = attempts.length;
  const recommendation = plan.compatibility.status === 'rebuild_required' && providerCallCount === 0 ? 'REBUILD' : 'not_decided';
  const summary = {
    cases: RC5_CASE_ORDER.map((scenarioId) => {
      const attempt = attempts.find((item) => item.scenario_id === scenarioId);
      return {
        baseline_attempt: CASES[scenarioId].baseline_attempt,
        baseline_usefulness: 'not_evaluated',
        completion: attempt?.completion ?? 'not_run',
        relative_result: attempt ? 'not_comparable' : 'not_comparable',
        scenario_id: scenarioId,
        treatment_usefulness: attempt?.usefulness ?? 'not_evaluated',
      };
    }),
    compatibility: plan.compatibility,
    nonclaims: [
      'feature_parity',
      'production_readiness',
      'provider_neutrality',
      'runtime_causality',
      'statistical_significance',
      'universal_superiority',
      'hiring_outcomes',
    ],
    observation_rows: attempts,
    provider_call_count: providerCallCount,
    recommendation,
    schema_version: '1.0.0',
    summary_id: 'RC5-DISPOSABLE-OFERTA-SUMMARY',
  };
  if (recommendation !== 'REBUILD') reject('RC5_DECISION_INCOMPLETE', 'The available attempts do not support a registered decision.');
  await writeExclusiveJson(path.join(root, SUMMARY_FILE), summary, 'RC-5 summary');
  await writeExclusive(path.join(root, DECISION_FILE), Buffer.from(decisionMarkdown(summary), 'utf8'), 'RC-5 decision note');
  return Object.freeze({ provider_call_count: providerCallCount, recommendation });
}

export function formatRC5Error(error) {
  if (error instanceof RC5SliceError) return `[${error.code}] ${error.message}`;
  return '[RC5_INTERNAL_ERROR] A content-safe diagnostic was withheld.';
}

export const RC5_INTERNALS_FOR_TESTS = Object.freeze({
  ACCEPTED_RELEVANT_PATHS,
  CASES,
  MAX_ARTIFACT_BYTES,
  MAX_CALLS,
  MAX_CASE_WALL_MS,
  MAX_OUTPUT_TOKENS,
  MAX_TOTAL_OUTPUT_TOKENS,
  MAX_TOTAL_WALL_MS,
  PINNED_ADAPTER_SOURCE,
  PINNED_DSH_LLM_SOURCE,
  REQUEST_INTERFACE_ID,
  REQUEST_INTERFACE_VERSION,
  REQUEST_WIRE_CONTRACT,
  REQUIRED_TRANSPORT_CAPABILITY,
  acceptedSnapshotDigest,
  assertAcceptedSnapshotsEqual,
  assertCallLedger,
  assertExecutionEnvelope,
  assertOrderedPartsRequest,
  assessV17Compatibility,
  assessOrderedPartsTransport,
  expectedProviderFreePayloadCaptures,
  expectedPinnedTransportProbe,
  expectedWirePayload,
  inspectTreatmentBundle,
  planDigest,
  projectOrderedPartsRequest,
  requestDigest,
  snapshotAcceptedInputs,
  validateAttemptResult,
  validatePayloadCaptureSummaries,
  validatePlanDocument,
  validateProviderFreePayloadProbe,
});
