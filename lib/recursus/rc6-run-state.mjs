import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalJsonV1, sha256V1 } from './prompt-context-v1.mjs';
import {
  RC5_INTERNALS_FOR_TESTS,
  assertDisposableRoot,
} from './rc5-slice.mjs';
import {
  RC5_EXECUTOR_IMAGE_ID,
  executeDockerProviderFreeCase,
} from './rc5-provider-executor.mjs';
import {
  RC5_CONTAINER_RUN_AUTHORITY_V1,
  RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256,
} from './rc5-provider-worker.mjs';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..');
const MAX_JSON_BYTES = 131_072;
const MAX_ARTIFACT_BYTES = 65_536;
const MAX_DIAGNOSTIC_BYTES = 256;
const SCENARIO_ID = 'FACT-01';
const PERMISSION_POLICY_ID = 'rc6-oferta-zero-tool-provider-neutral-v1';
const AUTHORITY_ID = 'rc6-provider-free-acceptance-zero-provider-v1';
const EVIDENCE_MODES = Object.freeze(['docker_exact_provider_free', 'injected_test_only']);
const ADAPTER_REVISION = '2fc02090af1632b86ee1175a6720904dfd71081c';
const OUTPUT_FRAME_ID = 'rc5-independent-evidence-and-anomaly-disclosure-v1';
const RETAINED_INTERFACE_ID = 'RC5-DSH-CODEX-ANOMALY-DISCLOSURE-V1';
const RETAINED_INTERFACE_VERSION = '1.0.0';
const RETAINED_WIRE_CONTRACT = 'recursus-dsh-codex-anomaly-disclosure-v1';
const PUBLIC_RUN_ID_PATTERN = /^RC6-RUN-FACT-01-[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;
const TEST_RUN_ID_PATTERN = /^RC6-TEST-RUN-FACT-01-[0-9A-F]{16}$/u;

const REGISTERED_FAULTS = Object.freeze([
  'before-reservation',
  'after-reservation',
  'after-dispatch',
  'after-simulated-request',
  'after-seal',
  'after-artifact',
  'after-terminal',
  'malformed-state',
  'stale-identity',
  'artifact-drift',
  'cleanup-failure',
  'recovery-race',
  'second-dispatch',
]);

const EXECUTOR_FAULTS = new Set([
  'after-simulated-request',
  'after-seal',
  'after-artifact',
  'after-terminal',
  'malformed-state',
  'stale-identity',
  'artifact-drift',
  'cleanup-failure',
  'recovery-race',
  'second-dispatch',
]);

const OPERATOR_RECOVERY_FAULTS = new Set([
  'after-dispatch',
  'after-simulated-request',
  'after-seal',
  'after-artifact',
  'recovery-race',
]);

const DENIED_CAPABILITIES = Object.freeze([
  'browser',
  'child_agents',
  'click',
  'command_execution',
  'contact',
  'credential_access',
  'external_mutation',
  'filesystem_write_outside_output_root',
  'model_tools',
  'plugins',
  'render',
  'score',
  'send',
  'shell',
  'sibling_path_access',
  'submission',
  'tracker_mutation',
  'unregistered_network',
  'workflow_update',
]);

const ALLOWED_SEMANTICS = Object.freeze([
  'bounded_allowlisted_diagnostic_emit',
  'bounded_markdown_artifact_emit',
  'registered_synthetic_source_projection',
]);

const FORBIDDEN_ROOT_SEGMENTS = new Set([
  '.aws', '.azure', '.codex', '.gnupg', '.ssh',
  'career-ops', 'credential', 'credentials', 'data', 'documents', 'jobs', 'recursus-careers',
  'recursus-careers-worktrees', 'reports', 'secrets',
]);

export class RC6RunStateError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'RC6RunStateError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function reject(code, message, exitCode = 1) {
  throw new RC6RunStateError(code, message, exitCode);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function portablePath(value) {
  const normalized = path.resolve(value).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function isContained(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function exactKeys(value, keys, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...keys].sort())) {
    reject(code, message);
  }
  return value;
}

function exactOptions(options, keys) {
  exactKeys(options, keys, 'RC6_ARGUMENT', 'An API option is unknown or missing.');
}

function safeRelative(relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\') || path.isAbsolute(relativePath)) {
    reject('RC6_PATH_ESCAPE', `${label} is not a safe relative path.`);
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !/^[A-Za-z0-9._-]+$/u.test(segment))) {
    reject('RC6_PATH_ESCAPE', `${label} is not a safe relative path.`);
  }
  return relativePath;
}

function digestProjection(value, digestKey) {
  const projected = clone(value);
  delete projected[digestKey];
  return sha256V1(canonicalJsonV1(projected));
}

function withDigest(value, digestKey) {
  const document = { ...value, [digestKey]: '0'.repeat(64) };
  document[digestKey] = digestProjection(document, digestKey);
  return document;
}

async function assertRC6Root(outputRoot, requireEmpty) {
  if (typeof outputRoot !== 'string' || outputRoot.length === 0 || outputRoot.includes('\0') || !path.isAbsolute(outputRoot)) {
    reject('RC6_OUTPUT_ROOT_REQUIRED', 'An explicit absolute disposable output root is required.', 2);
  }
  const lexicalSegments = path.resolve(outputRoot).slice(path.parse(path.resolve(outputRoot)).root.length).split(path.sep)
    .filter(Boolean).map((segment) => segment.toLocaleLowerCase('en-US'));
  if (lexicalSegments.some((segment) => FORBIDDEN_ROOT_SEGMENTS.has(segment) || /credential|secret/u.test(segment))) {
    reject('RC6_OUTPUT_ROOT_PROTECTED', 'The output root resembles a repository, credential, or protected user-layer path.', 2);
  }
  const root = await assertDisposableRoot(outputRoot, { repoRoot: REPOSITORY_ROOT, requireEmpty });
  const segments = path.resolve(root).slice(path.parse(root).root.length).split(path.sep)
    .filter(Boolean).map((segment) => segment.toLocaleLowerCase('en-US'));
  if (segments.some((segment) => FORBIDDEN_ROOT_SEGMENTS.has(segment) || /credential|secret/u.test(segment))) {
    reject('RC6_OUTPUT_ROOT_PROTECTED', 'The output root resembles a repository, credential, or protected user-layer path.', 2);
  }
  for (const protectedRoot of [homedir(), tmpdir(), process.env.USERPROFILE, process.env.APPDATA, process.env.LOCALAPPDATA]
    .filter((value) => typeof value === 'string' && value.length > 0)) {
    if (portablePath(root) === portablePath(protectedRoot) || isContained(root, protectedRoot)) {
      reject('RC6_OUTPUT_ROOT_BROAD', 'The output root is overly broad.', 2);
    }
  }
  return root;
}

async function writeExclusiveBytes(filePath, bytes, label) {
  let handle;
  try {
    handle = await open(filePath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
  } catch (error) {
    if (error?.code === 'EEXIST') reject('RC6_DUPLICATE_WRITE', `${label} already exists.`);
    if (error instanceof RC6RunStateError) throw error;
    reject('RC6_WRITE_FAILED', `${label} could not be written.`);
  } finally {
    await handle?.close();
  }
}

async function writeExclusiveJson(filePath, value, label) {
  return writeExclusiveBytes(filePath, Buffer.from(canonicalJsonV1(value), 'utf8'), label);
}

async function readBoundedNativeFile(filePath, maxBytes, code, label) {
  let before;
  let handle;
  try {
    before = await lstat(filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxBytes) {
      reject(code, `${label} is not a bounded single-link native file.`);
    }
    handle = await open(filePath, 'r');
    const openedBefore = await handle.stat();
    if (!openedBefore.isFile() || openedBefore.nlink !== 1 || openedBefore.size !== before.size ||
        openedBefore.mtimeMs !== before.mtimeMs || openedBefore.ctimeMs !== before.ctimeMs ||
        (before.ino !== 0 && openedBefore.ino !== before.ino) || (before.dev !== 0 && openedBefore.dev !== before.dev)) {
      reject(code, `${label} changed while it was opened.`);
    }
    const bytes = await handle.readFile();
    const openedAfter = await handle.stat();
    const after = await lstat(filePath);
    const physical = await realpath(filePath);
    if (bytes.length > maxBytes || openedAfter.size !== bytes.length || after.size !== bytes.length || after.isSymbolicLink() || after.nlink !== 1 ||
        openedAfter.mtimeMs !== openedBefore.mtimeMs || openedAfter.ctimeMs !== openedBefore.ctimeMs ||
        after.mtimeMs !== openedAfter.mtimeMs || after.ctimeMs !== openedAfter.ctimeMs ||
        (openedBefore.ino !== 0 && openedAfter.ino !== openedBefore.ino) || (after.ino !== 0 && openedAfter.ino !== after.ino) ||
        portablePath(physical) !== portablePath(filePath)) {
      reject(code, `${label} was replaced while it was verified.`);
    }
    return bytes;
  } catch (error) {
    if (error instanceof RC6RunStateError) throw error;
    reject(code, `${label} is missing or unreadable.`);
  } finally {
    await handle?.close();
  }
}

async function readCanonicalJson(filePath, label, maxBytes = MAX_JSON_BYTES) {
  const bytes = await readBoundedNativeFile(filePath, maxBytes, 'RC6_STATE_INVALID', label);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    reject('RC6_STATE_INVALID', `${label} is not valid JSON.`);
  }
  if (!bytes.equals(Buffer.from(canonicalJsonV1(value), 'utf8'))) {
    reject('RC6_STATE_NONCANONICAL', `${label} is not canonical JSON.`);
  }
  return value;
}

async function optionalCanonicalJson(filePath, label) {
  try {
    return await readCanonicalJson(filePath, label);
  } catch (error) {
    if (error?.code === 'RC6_STATE_INVALID') {
      try { await lstat(filePath); } catch { return null; }
    }
    throw error;
  }
}

function pathsFor(root) {
  return Object.freeze({
    adapter: path.join(root, 'adapter-projection.json'),
    artifact: path.join(root, 'artifacts', `${SCENARIO_ID}.md`),
    attempt: path.join(root, 'attempts', `${SCENARIO_ID}.json`),
    cleanup: path.join(root, 'cleanup', `${SCENARIO_ID}.json`),
    dispatch: path.join(root, 'dispatches', `${SCENARIO_ID}.json`),
    executionObservation: path.join(root, 'execution-observations', `${SCENARIO_ID}.json`),
    lock: path.join(root, 'locks', 'recovery.lock'),
    permission: path.join(root, 'permission-policy.json'),
    plan: path.join(root, 'run-plan.json'),
    preparation: path.join(root, 'preparation.json'),
    reservation: path.join(root, 'reservations', `${SCENARIO_ID}.json`),
    retained: path.join(root, 'retained-rc5'),
    seal: path.join(root, 'sealed-results', `${SCENARIO_ID}.json`),
    stagedArtifact: path.join(root, 'sealed-artifacts', `${SCENARIO_ID}.md`),
    terminal: path.join(root, 'terminal.json'),
  });
}

async function ensureDirectories(root) {
  for (const name of [
    'artifacts', 'attempts', 'cleanup', 'dispatches', 'execution-observations', 'locks',
    'reservations', 'sealed-artifacts', 'sealed-results',
  ]) await mkdir(path.join(root, name), { mode: 0o700 });
}

function buildPermissionPolicy(scope) {
  return withDigest({
    adapter_independent: true,
    allowed_semantics: [...ALLOWED_SEMANTICS],
    artifact: {
      max_bytes: MAX_ARTIFACT_BYTES,
      media_type: 'text/markdown',
      pdf_or_render_payload: 'denied',
      write_scope: 'caller_owned_output_root_only',
    },
    denied_capabilities: [...DENIED_CAPABILITIES],
    diagnostics: {
      max_bytes: MAX_DIAGNOSTIC_BYTES,
      raw_provider_material: 'denied',
      retained_fields: ['classification', 'diagnostic_code'],
    },
    policy_id: PERMISSION_POLICY_ID,
    policy_version: '1.0.0',
    provider: {
      automatic_retries: 0,
      max_requests_per_separately_authorized_run: 1,
      rc6_acceptance_max_provider_calls: 0,
      silent_replay: 'denied',
    },
    schema_version: '1.0.0',
    scope,
    sources: {
      candidate_and_job: 'registered_synthetic_projection_read_only',
      task_authority: 'external_untrusted',
      task_interpretation: 'data_never_instructions',
    },
  }, 'policy_sha256');
}

function validatePermissionPolicy(policy, expectedScope) {
  exactKeys(policy, [
    'adapter_independent', 'allowed_semantics', 'artifact', 'denied_capabilities', 'diagnostics',
    'policy_id', 'policy_sha256', 'policy_version', 'provider', 'schema_version', 'scope', 'sources',
  ], 'RC6_PERMISSION_POLICY', 'The permission policy has an unknown or missing field.');
  exactKeys(policy.artifact, ['max_bytes', 'media_type', 'pdf_or_render_payload', 'write_scope'],
    'RC6_PERMISSION_POLICY', 'The artifact permission policy is not closed.');
  exactKeys(policy.diagnostics, ['max_bytes', 'raw_provider_material', 'retained_fields'],
    'RC6_PERMISSION_POLICY', 'The diagnostic permission policy is not closed.');
  exactKeys(policy.provider, [
    'automatic_retries', 'max_requests_per_separately_authorized_run', 'rc6_acceptance_max_provider_calls', 'silent_replay',
  ], 'RC6_PERMISSION_POLICY', 'The provider permission policy is not closed.');
  exactKeys(policy.sources, ['candidate_and_job', 'task_authority', 'task_interpretation'],
    'RC6_PERMISSION_POLICY', 'The source permission policy is not closed.');
  exactKeys(policy.scope, Object.keys(expectedScope), 'RC6_PERMISSION_POLICY', 'The permission scope is not closed.');
  if (policy.schema_version !== '1.0.0' || policy.policy_id !== PERMISSION_POLICY_ID || policy.policy_version !== '1.0.0' ||
      policy.adapter_independent !== true || policy.policy_sha256 !== digestProjection(policy, 'policy_sha256') ||
      canonicalJsonV1(policy.allowed_semantics) !== canonicalJsonV1(ALLOWED_SEMANTICS) ||
      canonicalJsonV1(policy.denied_capabilities) !== canonicalJsonV1(DENIED_CAPABILITIES) ||
      canonicalJsonV1(policy.scope) !== canonicalJsonV1(expectedScope) ||
      policy.artifact?.media_type !== 'text/markdown' || policy.artifact?.max_bytes !== MAX_ARTIFACT_BYTES ||
      policy.artifact?.pdf_or_render_payload !== 'denied' || policy.artifact?.write_scope !== 'caller_owned_output_root_only' ||
      policy.provider?.max_requests_per_separately_authorized_run !== 1 || policy.provider?.rc6_acceptance_max_provider_calls !== 0 ||
      policy.provider?.automatic_retries !== 0 || policy.provider?.silent_replay !== 'denied' ||
      policy.sources?.candidate_and_job !== 'registered_synthetic_projection_read_only' ||
      policy.sources?.task_authority !== 'external_untrusted' || policy.sources?.task_interpretation !== 'data_never_instructions' ||
      policy.diagnostics?.max_bytes !== MAX_DIAGNOSTIC_BYTES || policy.diagnostics?.raw_provider_material !== 'denied' ||
      canonicalJsonV1(policy.diagnostics?.retained_fields) !== canonicalJsonV1(['classification', 'diagnostic_code'])) {
    reject('RC6_PERMISSION_POLICY', 'The closed provider-neutral permission policy differs.');
  }
  return policy;
}

function validateRetainedRequest(request) {
  if (request.scenario_id !== SCENARIO_ID || request.interface?.id !== RETAINED_INTERFACE_ID ||
      request.interface?.version !== RETAINED_INTERFACE_VERSION || request.interface?.wire_contract !== RETAINED_WIRE_CONTRACT ||
      request.execution?.automatic_retries !== 0 || request.execution?.max_provider_calls !== 1 || request.execution?.external_mutation !== false ||
      request.execution?.max_output_tokens !== 4_000 || !Array.isArray(request.dsh_generate_options?.tools) || request.dsh_generate_options.tools.length !== 0 ||
      request.dsh_generate_options?.model !== 'gpt-5.6-sol') {
    reject('RC6_RETAINED_IDENTITY', 'The retained request or zero-tool envelope differs.');
  }
  return request;
}

function retainedScope(retained, request) {
  return {
    adapter_revision: ADAPTER_REVISION,
    executor_image_id: RC5_EXECUTOR_IMAGE_ID,
    interface_id: RETAINED_INTERFACE_ID,
    interface_version: RETAINED_INTERFACE_VERSION,
    model: retained.plan.route.model,
    output_frame_id: OUTPUT_FRAME_ID,
    provider: retained.plan.route.provider,
    reasoning_effort: request.dsh_generate_options.reasoningEffort,
    request_digest: request.request_digest.value,
    request_file_sha256: sha256V1(canonicalJsonV1(request)),
    route_id: retained.plan.route.compiler.target_id,
    source_closure_digest: retained.plan.accepted_inputs.digest,
    wire_contract: RETAINED_WIRE_CONTRACT,
  };
}

async function prepareRunInternal(outputRoot, fault, evidenceMode) {
  const root = await assertRC6Root(outputRoot, true);
  if (!REGISTERED_FAULTS.includes(fault)) reject('RC6_FAULT_UNKNOWN', 'The provider-free fault is not registered.', 2);
  if (!EVIDENCE_MODES.includes(evidenceMode)) reject('RC6_EVIDENCE_MODE', 'The evidence mode is not registered.', 2);
  const locations = pathsFor(root);
  await mkdir(locations.retained, { mode: 0o700 });
  await RC5_INTERNALS_FOR_TESTS.prepareSliceForTests({ outputRoot: locations.retained });
  const retained = await RC5_INTERNALS_FOR_TESTS.readPlan(locations.retained);
  const request = validateRetainedRequest(retained.requests[0]);
  await ensureDirectories(root);
  const scope = retainedScope(retained, request);
  const permission = buildPermissionPolicy(scope);
  const adapter = withDigest({
    adapter_revision: ADAPTER_REVISION,
    evidence_scope: 'one_pinned_openai_codex_adapter_only_not_provider_neutrality',
    final_wire: {
      accepted_response_actions: ['reasoning', 'text'],
      parallel_tool_calls: true,
      tool_choice: 'auto',
      tools_field: 'absent',
    },
    permission_policy_id: permission.policy_id,
    permission_policy_sha256: permission.policy_sha256,
    request_projection: { automatic_retries: 0, external_mutation: false, model_facing_tools: [] },
    schema_version: '1.0.0',
    terminal_projection: { external_mutations: [] },
  }, 'projection_sha256');
  const runId = evidenceMode === 'docker_exact_provider_free'
    ? `RC6-RUN-${SCENARIO_ID}-${randomUUID().toUpperCase()}`
    : `RC6-TEST-RUN-${SCENARIO_ID}-${sha256V1(canonicalJsonV1({ request: scope.request_digest, fault })).slice(0, 16).toUpperCase()}`;
  const plan = withDigest({
    authority: {
      authority_id: AUTHORITY_ID,
      credential_access: 'forbidden',
      provider_calls_authorized: 0,
      provider_mode: evidenceMode === 'docker_exact_provider_free'
        ? 'provider_free_docker_internal_simulator_only'
        : 'injected_test_only_no_docker_conformance',
    },
    evidence_mode: evidenceMode,
    fault,
    permission_policy_id: permission.policy_id,
    permission_policy_sha256: permission.policy_sha256,
    retained_plan_digest: retained.plan.plan_digest.value,
    run_id: runId,
    scenario_id: SCENARIO_ID,
    schema_version: '1.0.0',
    scope,
  }, 'run_plan_sha256');
  const preparation = withDigest({
    adapter_projection_sha256: adapter.projection_sha256,
    authority_id: AUTHORITY_ID,
    evidence_mode: evidenceMode,
    permission_policy_id: permission.policy_id,
    permission_policy_sha256: permission.policy_sha256,
    request_digest: scope.request_digest,
    run_id: runId,
    run_plan_sha256: plan.run_plan_sha256,
    scenario_id: SCENARIO_ID,
    schema_version: '1.0.0',
    state: 'prepared',
  }, 'preparation_sha256');
  await writeExclusiveJson(locations.permission, permission, 'permission policy');
  await writeExclusiveJson(locations.adapter, adapter, 'adapter projection');
  await writeExclusiveJson(locations.plan, plan, 'run plan');
  await writeExclusiveJson(locations.preparation, preparation, 'preparation');
  return Object.freeze({ adapter, locations, permission, plan, preparation, request, root });
}

function validatePlan(plan) {
  exactKeys(plan, [
    'authority', 'evidence_mode', 'fault', 'permission_policy_id', 'permission_policy_sha256', 'retained_plan_digest',
    'run_id', 'run_plan_sha256', 'scenario_id', 'schema_version', 'scope',
  ], 'RC6_RUN_PLAN', 'The run plan has an unknown or missing field.');
  exactKeys(plan.authority, ['authority_id', 'credential_access', 'provider_calls_authorized', 'provider_mode'],
    'RC6_RUN_PLAN', 'The run authority is not closed.');
  exactKeys(plan.scope, [
    'adapter_revision', 'executor_image_id', 'interface_id', 'interface_version', 'model', 'output_frame_id',
    'provider', 'reasoning_effort', 'request_digest', 'request_file_sha256', 'route_id', 'source_closure_digest', 'wire_contract',
  ], 'RC6_RUN_PLAN', 'The retained run scope is not closed.');
  if (plan.schema_version !== '1.0.0' || plan.scenario_id !== SCENARIO_ID || !REGISTERED_FAULTS.includes(plan.fault) ||
      !EVIDENCE_MODES.includes(plan.evidence_mode) ||
      plan.run_plan_sha256 !== digestProjection(plan, 'run_plan_sha256') || plan.authority?.authority_id !== AUTHORITY_ID ||
      plan.authority?.credential_access !== 'forbidden' || plan.authority?.provider_calls_authorized !== 0 ||
      plan.authority?.provider_mode !== (plan.evidence_mode === 'docker_exact_provider_free'
        ? 'provider_free_docker_internal_simulator_only' : 'injected_test_only_no_docker_conformance') ||
      plan.permission_policy_id !== PERMISSION_POLICY_ID || plan.scope?.adapter_revision !== ADAPTER_REVISION ||
      plan.scope?.executor_image_id !== RC5_EXECUTOR_IMAGE_ID || plan.scope?.interface_id !== RETAINED_INTERFACE_ID ||
      plan.scope?.interface_version !== RETAINED_INTERFACE_VERSION || plan.scope?.wire_contract !== RETAINED_WIRE_CONTRACT ||
      plan.scope?.output_frame_id !== OUTPUT_FRAME_ID ||
      !(plan.evidence_mode === 'docker_exact_provider_free' ? PUBLIC_RUN_ID_PATTERN : TEST_RUN_ID_PATTERN).test(plan.run_id)) {
    reject('RC6_RUN_PLAN', 'The run plan identity differs.');
  }
  return plan;
}

function checkpointIdentity(state) {
  return {
    authority_id: AUTHORITY_ID,
    evidence_mode: state.plan.evidence_mode,
    permission_policy_id: state.permission.policy_id,
    permission_policy_sha256: state.permission.policy_sha256,
    request_digest: state.plan.scope.request_digest,
    run_id: state.plan.run_id,
    run_plan_sha256: state.plan.run_plan_sha256,
    scenario_id: SCENARIO_ID,
  };
}

function validateIdentity(record, state, code) {
  const expected = checkpointIdentity(state);
  for (const [key, value] of Object.entries(expected)) {
    if (record?.[key] !== value) reject(code, 'A durable checkpoint identity differs from the run plan.');
  }
}

async function writeReservation(state) {
  const reservation = withDigest({
    ...checkpointIdentity(state),
    automatic_retries: 0,
    dispatch_count: 0,
    provider_calls_authorized: 0,
    reservation_id: `RC6-RESERVATION-${state.plan.run_id}`,
    schema_version: '1.0.0',
    state: 'reserved_pre_dispatch',
  }, 'reservation_sha256');
  await writeExclusiveJson(state.locations.reservation, reservation, 'reservation');
  return reservation;
}

async function writeDispatch(state, reservation) {
  const dispatch = withDigest({
    ...checkpointIdentity(state),
    automatic_retries: 0,
    dispatch_count: 1,
    dispatch_id: `RC6-DISPATCH-${state.plan.run_id}`,
    reservation_id: reservation.reservation_id,
    schema_version: '1.0.0',
    state: 'provider_reachability_possible',
  }, 'dispatch_sha256');
  await writeExclusiveJson(state.locations.dispatch, dispatch, 'dispatch');
  return dispatch;
}

function validateExecutorResult(result) {
  if (!result || result.schema_version !== '1.3.0' || result.transport_mode !== 'provider_free_success' ||
      result.completion !== 'completed' || result.trusted_completed !== true || result.provider_request_count !== 1 ||
      result.direct_adapter_invocations !== 1 || result.oauth_refresh_count !== 0 ||
      !Array.isArray(result.external_mutations) || result.external_mutations.length !== 0 ||
      result.simulator_observation?.provider_calls !== 0 || result.simulator_observation?.request_count !== 1 ||
      result.simulator_observation?.response_status !== 200 ||
      !/^[a-f0-9]{64}$/u.test(result.simulator_observation?.body_sha256 || '') ||
      typeof result.artifact !== 'string' || Buffer.byteLength(result.artifact, 'utf8') < 1 ||
      Buffer.byteLength(result.artifact, 'utf8') > MAX_ARTIFACT_BYTES || !Number.isInteger(result.input_tokens) ||
      !Number.isInteger(result.output_tokens) || result.error_category !== null || result.failure_stage !== null) {
    reject('RC6_EXECUTOR_RESULT', 'The provider-free executor result is not trusted and bounded.');
  }
  return result;
}

function validateExecutorEnvelope(value, state) {
  const exactEvidence = state.plan.evidence_mode === 'docker_exact_provider_free';
  exactKeys(value, exactEvidence ? [
    'authority_manifest', 'cleanup', 'exact_container_run', 'executor_image_id', 'provider_calls', 'request_digest',
    'result', 'retry_count', 'scenario_id', 'schema_version', 'simulator_request_count', 'transport_mode',
  ] : [
    'authority_manifest', 'cleanup', 'exact_container_run', 'executor_image_id', 'provider_calls', 'request_digest',
    'result', 'retry_count', 'scenario_id', 'schema_version', 'simulator_request_count', 'test_only', 'transport_mode',
  ], 'RC6_EXECUTOR_ATTESTATION', 'The provider-free executor attestation is not closed.');
  exactKeys(value.authority_manifest, ['id', 'sha256'], 'RC6_EXECUTOR_ATTESTATION', 'The authority manifest identity is not closed.');
  exactKeys(value.cleanup, [
    'authority_resources_absent', 'credential_lock_residue_count', 'disposable_state_removed', 'inspection_error_count',
  ], 'RC6_EXECUTOR_ATTESTATION', 'The cleanup attestation is not closed.');
  if (!value || value.schema_version !== '1.0.0' || value.provider_calls !== 0 ||
      value.retry_count !== 0 || value.simulator_request_count !== 1 || value.scenario_id !== SCENARIO_ID ||
      value.transport_mode !== 'provider_free_success' || value.executor_image_id !== RC5_EXECUTOR_IMAGE_ID ||
      value.request_digest !== state.plan.scope.request_digest ||
      (exactEvidence && (value.exact_container_run !== true || value.test_only === true ||
        value.authority_manifest?.id !== RC5_CONTAINER_RUN_AUTHORITY_V1.manifest_id ||
        value.authority_manifest?.sha256 !== RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256)) ||
      (!exactEvidence && (value.exact_container_run !== false || value.test_only !== true ||
        value.authority_manifest?.id !== RC5_CONTAINER_RUN_AUTHORITY_V1.manifest_id ||
        value.authority_manifest?.sha256 !== RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256))) {
    reject('RC6_EXECUTOR_ATTESTATION', 'The provider-free executor attestation differs.');
  }
  return value;
}

async function writeExecutionObservation(state, result, cleanup) {
  const observation = withDigest({
    ...checkpointIdentity(state),
    cleanup_observed_in_memory: cleanup?.authority_resources_absent === true,
    provider_call_count: 0,
    schema_version: '1.0.0',
    simulated_request_count: result.simulator_observation.request_count,
    state: 'unsealed_execution_observation',
  }, 'observation_sha256');
  await writeExclusiveJson(state.locations.executionObservation, observation, 'execution observation');
  return observation;
}

async function sealResult(state, result, cleanup, dispatch) {
  validateExecutorResult(result);
  if (cleanup?.authority_resources_absent !== true || cleanup?.credential_lock_residue_count !== 0 ||
      cleanup?.disposable_state_removed !== true || cleanup?.inspection_error_count !== 0) {
    reject('RC6_CLEANUP_UNVERIFIED', 'Verified cleanup is required before sealing.');
  }
  const artifactBytes = Buffer.from(result.artifact, 'utf8');
  await writeExclusiveBytes(state.locations.stagedArtifact, artifactBytes, 'sealed artifact');
  const cleanupRecord = withDigest({
    ...checkpointIdentity(state),
    authority_resources: 'verified_absent',
    container_residue_count: 0,
    credential_lock_residue_count: 0,
    disposable_state: 'removed',
    network_residue_count: 0,
    schema_version: '1.0.0',
    synthetic_credential_lock: 'verified_empty',
  }, 'cleanup_sha256');
  await writeExclusiveJson(state.locations.cleanup, cleanupRecord, 'cleanup record');
  const artifact = {
    byte_count: artifactBytes.length,
    media_type: 'text/markdown',
    path: `sealed-artifacts/${SCENARIO_ID}.md`,
    sha256: sha256V1(artifactBytes),
  };
  const seal = withDigest({
    ...checkpointIdentity(state),
    artifact,
    authority_manifest_id: RC5_CONTAINER_RUN_AUTHORITY_V1.manifest_id,
    authority_manifest_sha256: RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256,
    automatic_retries: 0,
    cleanup_sha256: cleanupRecord.cleanup_sha256,
    completion: 'completed',
    direct_adapter_invocations: 1,
    dispatch_id: dispatch.dispatch_id,
    executor_image_id: RC5_EXECUTOR_IMAGE_ID,
    external_mutations: [],
    input_tokens: result.input_tokens,
    output_token_target_exceeded: result.output_token_target_exceeded,
    output_tokens: result.output_tokens,
    provider_call_count: 0,
    provider_request_count: 1,
    response_http_status: 200,
    schema_version: '1.0.0',
    simulated_request_count: 1,
    state: 'trusted_post_cleanup_seal',
    trusted_completed: true,
    wire_payload_sha256: result.simulator_observation.body_sha256,
  }, 'sealed_result_sha256');
  await writeExclusiveJson(state.locations.seal, seal, 'sealed result');
  return seal;
}

async function readAndValidateState(root, options = {}) {
  const locations = pathsFor(root);
  const plan = validatePlan(await readCanonicalJson(locations.plan, 'run plan'));
  const permission = validatePermissionPolicy(await readCanonicalJson(locations.permission, 'permission policy'), plan.scope);
  if (plan.permission_policy_sha256 !== permission.policy_sha256) reject('RC6_PERMISSION_POLICY', 'The run plan permission binding differs.');
  let retained;
  let retainedRequest;
  try {
    retained = await RC5_INTERNALS_FOR_TESTS.readPlan(locations.retained);
    retainedRequest = validateRetainedRequest(retained.requests[0]);
  } catch {
    reject('RC6_RETAINED_STATE', 'The retained RC-5 preparation no longer validates against immutable repository inputs.');
  }
  if (plan.retained_plan_digest !== retained.plan.plan_digest.value ||
      canonicalJsonV1(plan.scope) !== canonicalJsonV1(retainedScope(retained, retainedRequest))) {
    reject('RC6_RETAINED_STATE', 'The retained plan, request, route, model, provider, or source closure differs.');
  }
  const adapter = await readCanonicalJson(locations.adapter, 'adapter projection');
  exactKeys(adapter, [
    'adapter_revision', 'evidence_scope', 'final_wire', 'permission_policy_id', 'permission_policy_sha256',
    'projection_sha256', 'request_projection', 'schema_version', 'terminal_projection',
  ], 'RC6_ADAPTER_PROJECTION', 'The adapter projection has an unknown or missing field.');
  exactKeys(adapter.final_wire, ['accepted_response_actions', 'parallel_tool_calls', 'tool_choice', 'tools_field'],
    'RC6_ADAPTER_PROJECTION', 'The final-wire projection is not closed.');
  exactKeys(adapter.request_projection, ['automatic_retries', 'external_mutation', 'model_facing_tools'],
    'RC6_ADAPTER_PROJECTION', 'The request permission projection is not closed.');
  exactKeys(adapter.terminal_projection, ['external_mutations'],
    'RC6_ADAPTER_PROJECTION', 'The terminal permission projection is not closed.');
  if (adapter.projection_sha256 !== digestProjection(adapter, 'projection_sha256') || adapter.adapter_revision !== ADAPTER_REVISION ||
      adapter.evidence_scope !== 'one_pinned_openai_codex_adapter_only_not_provider_neutrality' ||
      adapter.permission_policy_sha256 !== permission.policy_sha256 || adapter.final_wire?.tools_field !== 'absent' ||
      adapter.final_wire?.tool_choice !== 'auto' || adapter.final_wire?.parallel_tool_calls !== true ||
      canonicalJsonV1(adapter.final_wire?.accepted_response_actions) !== canonicalJsonV1(['reasoning', 'text']) ||
      canonicalJsonV1(adapter.request_projection?.model_facing_tools) !== canonicalJsonV1([]) ||
      adapter.request_projection?.automatic_retries !== 0 || adapter.request_projection?.external_mutation !== false ||
      canonicalJsonV1(adapter.terminal_projection?.external_mutations) !== canonicalJsonV1([])) {
    reject('RC6_ADAPTER_PROJECTION', 'The pinned adapter projection differs from the neutral policy binding.');
  }
  const preparation = await readCanonicalJson(locations.preparation, 'preparation');
  const state = { adapter, locations, permission, plan, preparation, root };
  exactKeys(preparation, [
    'adapter_projection_sha256', 'authority_id', 'evidence_mode', 'permission_policy_id', 'permission_policy_sha256',
    'preparation_sha256', 'request_digest', 'run_id', 'run_plan_sha256', 'scenario_id', 'schema_version', 'state',
  ], 'RC6_PREPARATION', 'The preparation checkpoint has an unknown or missing field.');
  validateIdentity(preparation, state, 'RC6_PREPARATION');
  if (preparation.preparation_sha256 !== digestProjection(preparation, 'preparation_sha256') || preparation.state !== 'prepared' ||
      preparation.adapter_projection_sha256 !== adapter.projection_sha256) reject('RC6_PREPARATION', 'The preparation checkpoint differs.');

  const reservation = await optionalCanonicalJson(locations.reservation, 'reservation');
  const dispatch = await optionalCanonicalJson(locations.dispatch, 'dispatch');
  const executionObservation = await optionalCanonicalJson(locations.executionObservation, 'execution observation');
  const cleanup = await optionalCanonicalJson(locations.cleanup, 'cleanup record');
  const seal = await optionalCanonicalJson(locations.seal, 'sealed result');
  const attempt = await optionalCanonicalJson(locations.attempt, 'attempt');
  const terminal = await optionalCanonicalJson(locations.terminal, 'terminal');

  if (reservation !== null) {
    exactKeys(reservation, [
      'authority_id', 'automatic_retries', 'dispatch_count', 'evidence_mode', 'permission_policy_id', 'permission_policy_sha256',
      'provider_calls_authorized', 'request_digest', 'reservation_id', 'reservation_sha256', 'run_id',
      'run_plan_sha256', 'scenario_id', 'schema_version', 'state',
    ], 'RC6_RESERVATION', 'The reservation checkpoint has an unknown or missing field.');
    validateIdentity(reservation, state, 'RC6_RESERVATION');
    if (reservation.reservation_sha256 !== digestProjection(reservation, 'reservation_sha256') || reservation.state !== 'reserved_pre_dispatch' ||
        reservation.dispatch_count !== 0 || reservation.provider_calls_authorized !== 0 || reservation.automatic_retries !== 0) {
      reject('RC6_RESERVATION', 'The reservation checkpoint differs.');
    }
  }
  if (dispatch !== null) {
    if (reservation === null) reject('RC6_DISPATCH', 'Dispatch exists without its reservation.');
    exactKeys(dispatch, [
      'authority_id', 'automatic_retries', 'dispatch_count', 'dispatch_id', 'dispatch_sha256', 'evidence_mode',
      'permission_policy_id', 'permission_policy_sha256', 'request_digest', 'reservation_id', 'run_id',
      'run_plan_sha256', 'scenario_id', 'schema_version', 'state',
    ], 'RC6_DISPATCH', 'The dispatch checkpoint has an unknown or missing field.');
    validateIdentity(dispatch, state, 'RC6_DISPATCH');
    if (dispatch.dispatch_sha256 !== digestProjection(dispatch, 'dispatch_sha256') || dispatch.state !== 'provider_reachability_possible' ||
        dispatch.dispatch_count !== 1 || dispatch.automatic_retries !== 0 || dispatch.reservation_id !== reservation.reservation_id) {
      reject('RC6_DISPATCH', 'The dispatch checkpoint differs.');
    }
  }
  if (executionObservation !== null) {
    if (dispatch === null) reject('RC6_EXECUTION_OBSERVATION', 'An execution observation exists without dispatch.');
    exactKeys(executionObservation, [
      'authority_id', 'cleanup_observed_in_memory', 'evidence_mode', 'observation_sha256', 'permission_policy_id',
      'permission_policy_sha256', 'provider_call_count', 'request_digest', 'run_id', 'run_plan_sha256',
      'scenario_id', 'schema_version', 'simulated_request_count', 'state',
    ], 'RC6_EXECUTION_OBSERVATION', 'The execution observation has an unknown or missing field.');
    validateIdentity(executionObservation, state, 'RC6_EXECUTION_OBSERVATION');
    if (executionObservation.observation_sha256 !== digestProjection(executionObservation, 'observation_sha256') ||
        executionObservation.provider_call_count !== 0 || executionObservation.simulated_request_count !== 1 ||
        executionObservation.state !== 'unsealed_execution_observation') {
      reject('RC6_EXECUTION_OBSERVATION', 'The execution observation differs.');
    }
  }
  if (cleanup !== null) {
    exactKeys(cleanup, [
      'authority_id', 'authority_resources', 'cleanup_sha256', 'disposable_state', 'evidence_mode', 'permission_policy_id',
      'permission_policy_sha256', 'request_digest', 'run_id', 'run_plan_sha256', 'scenario_id', 'schema_version',
      'synthetic_credential_lock', 'container_residue_count', 'credential_lock_residue_count', 'network_residue_count',
    ], 'RC6_CLEANUP_UNVERIFIED', 'The cleanup record has an unknown or missing field.');
    validateIdentity(cleanup, state, 'RC6_CLEANUP_UNVERIFIED');
    if (cleanup.cleanup_sha256 !== digestProjection(cleanup, 'cleanup_sha256') || cleanup.authority_resources !== 'verified_absent' ||
        cleanup.synthetic_credential_lock !== 'verified_empty' || cleanup.disposable_state !== 'removed' ||
        cleanup.container_residue_count !== 0 || cleanup.network_residue_count !== 0 || cleanup.credential_lock_residue_count !== 0) {
      reject('RC6_CLEANUP_UNVERIFIED', 'The cleanup record does not prove complete absence.');
    }
  }
  if (seal !== null) {
    if (dispatch === null || executionObservation === null || cleanup === null) reject('RC6_SEAL_INVALID', 'The sealed result lacks a prerequisite checkpoint.');
    exactKeys(seal, [
      'artifact', 'authority_id', 'authority_manifest_id', 'authority_manifest_sha256', 'automatic_retries',
      'cleanup_sha256', 'completion', 'direct_adapter_invocations', 'dispatch_id', 'evidence_mode', 'executor_image_id',
      'external_mutations', 'input_tokens', 'output_token_target_exceeded', 'output_tokens',
      'permission_policy_id', 'permission_policy_sha256', 'provider_call_count', 'provider_request_count',
      'request_digest', 'response_http_status', 'run_id', 'run_plan_sha256', 'scenario_id', 'schema_version',
      'sealed_result_sha256', 'simulated_request_count', 'state', 'trusted_completed', 'wire_payload_sha256',
    ], 'RC6_SEAL_INVALID', 'The sealed result has an unknown or missing field.');
    validateIdentity(seal, state, 'RC6_SEAL_INVALID');
    if (seal.sealed_result_sha256 !== digestProjection(seal, 'sealed_result_sha256') || seal.cleanup_sha256 !== cleanup.cleanup_sha256 ||
        seal.state !== 'trusted_post_cleanup_seal' || seal.completion !== 'completed' || seal.trusted_completed !== true ||
        seal.authority_manifest_id !== RC5_CONTAINER_RUN_AUTHORITY_V1.manifest_id ||
        seal.authority_manifest_sha256 !== RC5_CONTAINER_RUN_AUTHORITY_V1_SHA256 || seal.executor_image_id !== RC5_EXECUTOR_IMAGE_ID ||
        seal.direct_adapter_invocations !== 1 || seal.provider_request_count !== 1 || seal.simulated_request_count !== 1 ||
        !/^[a-f0-9]{64}$/u.test(seal.wire_payload_sha256) ||
        seal.provider_call_count !== 0 || seal.automatic_retries !== 0 || seal.dispatch_id !== dispatch.dispatch_id ||
        !Array.isArray(seal.external_mutations) || seal.external_mutations.length !== 0 || seal.response_http_status !== 200 ||
        !Number.isInteger(seal.input_tokens) || !Number.isInteger(seal.output_tokens)) {
      reject('RC6_SEAL_INVALID', 'The trusted sealed result differs.');
    }
    const artifactPath = safeRelative(seal.artifact?.path, 'sealed artifact path');
    exactKeys(seal.artifact, ['byte_count', 'media_type', 'path', 'sha256'],
      'RC6_ARTIFACT_INVALID', 'The sealed artifact identity is not closed.');
    if (artifactPath !== `sealed-artifacts/${SCENARIO_ID}.md` || seal.artifact?.media_type !== 'text/markdown' ||
        !Number.isInteger(seal.artifact?.byte_count) || seal.artifact.byte_count < 1 || seal.artifact.byte_count > MAX_ARTIFACT_BYTES ||
        !/^[a-f0-9]{64}$/u.test(seal.artifact?.sha256 || '')) reject('RC6_ARTIFACT_INVALID', 'The sealed artifact identity differs.');
    const staged = await readBoundedNativeFile(locations.stagedArtifact, MAX_ARTIFACT_BYTES, 'RC6_ARTIFACT_INVALID', 'sealed artifact');
    if (staged.length !== seal.artifact.byte_count || sha256V1(staged) !== seal.artifact.sha256) {
      reject('RC6_ARTIFACT_INVALID', 'The sealed artifact bytes differ.');
    }
  }

  let publicArtifact = null;
  try {
    publicArtifact = await readBoundedNativeFile(locations.artifact, MAX_ARTIFACT_BYTES, 'RC6_ARTIFACT_INVALID', 'published artifact');
  } catch (error) {
    if (error?.code !== 'RC6_ARTIFACT_INVALID') throw error;
    let exists = true;
    try { await lstat(locations.artifact); } catch { exists = false; }
    if (exists) throw error;
    publicArtifact = null;
  }
  if (publicArtifact !== null) {
    if (seal === null || publicArtifact.length !== seal.artifact.byte_count || sha256V1(publicArtifact) !== seal.artifact.sha256) {
      reject('RC6_ARTIFACT_INVALID', 'The published artifact differs from the trusted seal.');
    }
  }
  if (attempt !== null) {
    if (seal === null || publicArtifact === null) reject('RC6_ATTEMPT_INVALID', 'The attempt lacks a verified artifact and seal.');
    exactKeys(attempt, [
      'artifact', 'attempt_sha256', 'authority_id', 'automatic_retries', 'dispatch_count', 'evidence_mode', 'permission_policy_id',
      'permission_policy_sha256', 'provider_call_count', 'request_digest', 'run_id', 'run_plan_sha256',
      'scenario_id', 'schema_version', 'sealed_result_sha256', 'simulated_request_count', 'state',
    ], 'RC6_ATTEMPT_INVALID', 'The attempt has an unknown or missing field.');
    exactKeys(attempt.artifact, ['byte_count', 'media_type', 'path', 'sha256'],
      'RC6_ATTEMPT_INVALID', 'The attempt artifact identity is not closed.');
    validateIdentity(attempt, state, 'RC6_ATTEMPT_INVALID');
    if (attempt.attempt_sha256 !== digestProjection(attempt, 'attempt_sha256') || attempt.state !== 'artifact_verified_completion' ||
        attempt.sealed_result_sha256 !== seal.sealed_result_sha256 || attempt.artifact?.sha256 !== seal.artifact.sha256 ||
        attempt.dispatch_count !== 1 || attempt.simulated_request_count !== 1 || attempt.provider_call_count !== 0 ||
        attempt.automatic_retries !== 0) reject('RC6_ATTEMPT_INVALID', 'The terminal attempt differs.');
  }
  if (terminal !== null) {
    exactKeys(terminal, terminal.classification === 'already_complete' ? [
      'artifact_count', 'artifact_sha256', 'attempt_sha256', 'authority_id', 'automatic_retries', 'classification',
      'cleanup_state', 'dispatch_count', 'evidence_mode', 'permission_policy_id', 'permission_policy_sha256', 'provider_call_count',
      'request_digest', 'run_id', 'run_plan_sha256', 'scenario_id', 'schema_version', 'simulated_request_count',
      'terminal_sha256',
    ] : [
      'artifact_count', 'authority_id', 'automatic_retries', 'classification', 'cleanup_state', 'dispatch_count', 'evidence_mode',
      'permission_policy_id', 'permission_policy_sha256', 'provider_call_count', 'request_digest', 'run_id',
      'run_plan_sha256', 'scenario_id', 'schema_version', 'simulated_request_count', 'terminal_sha256',
    ], 'RC6_TERMINAL_INVALID', 'The terminal record has an unknown or missing field.');
    validateIdentity(terminal, state, 'RC6_TERMINAL_INVALID');
    if (terminal.terminal_sha256 !== digestProjection(terminal, 'terminal_sha256')) reject('RC6_TERMINAL_INVALID', 'The terminal identity differs.');
    if (terminal.classification === 'already_complete') {
      if (attempt === null || terminal.attempt_sha256 !== attempt.attempt_sha256 || terminal.artifact_sha256 !== seal?.artifact?.sha256 ||
          terminal.dispatch_count !== 1 || terminal.simulated_request_count !== 1 || terminal.provider_call_count !== 0 ||
          terminal.automatic_retries !== 0 || terminal.cleanup_state !== 'verified') reject('RC6_TERMINAL_INVALID', 'The completion terminal differs.');
    } else if (terminal.classification === 'indeterminate_stopped') {
      if (dispatch === null || seal !== null || attempt !== null || terminal.dispatch_count !== 1 || terminal.artifact_count !== 0 ||
          terminal.automatic_retries !== 0 || terminal.provider_call_count !== 0 || ![0, 1].includes(terminal.simulated_request_count) ||
          terminal.cleanup_state !== 'unverified') reject('RC6_TERMINAL_INVALID', 'The indeterminate terminal differs.');
    } else reject('RC6_TERMINAL_INVALID', 'The terminal classification is not registered.');
  }
  if (!options.ignoreLock) {
    try {
      await lstat(locations.lock);
      reject('RC6_RECOVERY_LOCK_HELD', 'A recovery lock is active or stale.');
    } catch (error) {
      if (error instanceof RC6RunStateError) throw error;
    }
  }
  return { ...state, attempt, cleanup, dispatch, executionObservation, publicArtifact, reservation, seal, terminal };
}

function observationFor(state) {
  const simulated = state.executionObservation?.simulated_request_count ?? 0;
  const common = {
    artifact_count: state.publicArtifact === null ? 0 : 1,
    artifact_sha256: state.publicArtifact === null ? null : sha256V1(state.publicArtifact),
    automatic_retries: 0,
    cleanup_state: state.seal === null ? 'unverified' : 'verified',
    diagnostic_code: null,
    dispatch_count: state.dispatch === null ? 0 : 1,
    evidence_mode: state.plan.evidence_mode,
    permission_policy_id: PERMISSION_POLICY_ID,
    provider_call_count: 0,
    run_id: state.plan.run_id,
    simulated_request_count: simulated,
    terminal_count: state.terminal === null ? 0 : 1,
  };
  if (state.terminal?.classification === 'already_complete') return { ...common, classification: 'already_complete' };
  if (state.terminal?.classification === 'indeterminate_stopped') return { ...common, classification: 'indeterminate_stopped' };
  if (state.seal !== null && state.publicArtifact !== null) return { ...common, classification: 'artifact_publishable' };
  if (state.seal !== null) return { ...common, classification: 'sealed_publishable' };
  if (state.dispatch !== null) return { ...common, classification: 'indeterminate_unsealed' };
  return { ...common, classification: 'safely_resumable' };
}

async function safeFailure(error, validatedRoot) {
  const code = error instanceof RC6RunStateError && /^[A-Z0-9_]{1,64}$/u.test(error.code) ? error.code : 'RC6_INTERNAL_ERROR';
  let dispatchCount = 0;
  let simulatedRequestCount = 0;
  let cleanupState = 'unverified';
  let evidenceMode = null;
  let runId = null;
  if (typeof validatedRoot === 'string') {
    const locations = pathsFor(validatedRoot);
    try { await lstat(locations.dispatch); dispatchCount = 1; } catch {}
    try {
      const plan = await readCanonicalJson(locations.plan, 'run plan');
      if ((PUBLIC_RUN_ID_PATTERN.test(plan.run_id) && plan.evidence_mode === 'docker_exact_provider_free') ||
          (TEST_RUN_ID_PATTERN.test(plan.run_id) && plan.evidence_mode === 'injected_test_only')) {
        runId = plan.run_id;
        evidenceMode = plan.evidence_mode;
      }
    } catch {}
    try {
      const execution = await readCanonicalJson(locations.executionObservation, 'execution observation');
      simulatedRequestCount = execution.simulated_request_count === 1 ? 1 : 0;
    } catch {}
    try {
      const cleanup = await readCanonicalJson(locations.cleanup, 'cleanup record');
      cleanupState = cleanup.authority_resources === 'verified_absent' && cleanup.synthetic_credential_lock === 'verified_empty' &&
        cleanup.disposable_state === 'removed' && cleanup.container_residue_count === 0 && cleanup.network_residue_count === 0 &&
        cleanup.credential_lock_residue_count === 0 ? 'verified' : 'failed';
    } catch {}
  }
  return Object.freeze({
    artifact_count: 0,
    artifact_sha256: null,
    automatic_retries: 0,
    classification: 'fail_closed',
    cleanup_state: cleanupState,
    diagnostic_code: code,
    dispatch_count: dispatchCount,
    evidence_mode: evidenceMode,
    permission_policy_id: PERMISSION_POLICY_ID,
    provider_call_count: 0,
    run_id: runId,
    simulated_request_count: simulatedRequestCount,
    terminal_count: 0,
  });
}

export async function inspectRunState(options = {}) {
  let root;
  try {
    exactOptions(options, ['outputRoot']);
    root = await assertRC6Root(options.outputRoot, false);
    return Object.freeze(observationFor(await readAndValidateState(root)));
  } catch (error) {
    return safeFailure(error, root);
  }
}

async function acquireRecoveryLock(locations) {
  const token = randomUUID();
  let handle;
  try {
    handle = await open(locations.lock, 'wx', 0o600);
    await handle.writeFile(Buffer.from(`${token}\n`, 'utf8'));
    await handle.sync();
    return token;
  } catch (error) {
    if (error?.code === 'EEXIST') reject('RC6_RECOVERY_LOCK_HELD', 'Another recovery process owns the run.');
    if (error instanceof RC6RunStateError) throw error;
    reject('RC6_RECOVERY_LOCK', 'The recovery lock could not be acquired.');
  } finally {
    await handle?.close();
  }
}

async function releaseRecoveryLock(locations, token) {
  const bytes = await readBoundedNativeFile(locations.lock, 64, 'RC6_RECOVERY_LOCK', 'recovery lock');
  if (bytes.toString('utf8') !== `${token}\n`) reject('RC6_RECOVERY_LOCK', 'The recovery lock identity changed.');
  await unlink(locations.lock);
}

async function publishArtifact(state) {
  const bytes = await readBoundedNativeFile(state.locations.stagedArtifact, MAX_ARTIFACT_BYTES, 'RC6_ARTIFACT_INVALID', 'sealed artifact');
  await writeExclusiveBytes(state.locations.artifact, bytes, 'published artifact');
}

async function publishTerminal(state) {
  const current = await readAndValidateState(state.root, { ignoreLock: true });
  if (current.publicArtifact === null) await publishArtifact(current);
  const withArtifact = await readAndValidateState(state.root, { ignoreLock: true });
  if (withArtifact.attempt === null) {
    const attempt = withDigest({
      ...checkpointIdentity(withArtifact),
      artifact: {
        byte_count: withArtifact.seal.artifact.byte_count,
        media_type: 'text/markdown',
        path: `artifacts/${SCENARIO_ID}.md`,
        sha256: withArtifact.seal.artifact.sha256,
      },
      automatic_retries: 0,
      dispatch_count: 1,
      provider_call_count: 0,
      schema_version: '1.0.0',
      sealed_result_sha256: withArtifact.seal.sealed_result_sha256,
      simulated_request_count: 1,
      state: 'artifact_verified_completion',
    }, 'attempt_sha256');
    await writeExclusiveJson(withArtifact.locations.attempt, attempt, 'attempt');
  }
  const withAttempt = await readAndValidateState(state.root, { ignoreLock: true });
  if (withAttempt.terminal === null) {
    const terminal = withDigest({
      ...checkpointIdentity(withAttempt),
      artifact_count: 1,
      artifact_sha256: withAttempt.seal.artifact.sha256,
      attempt_sha256: withAttempt.attempt.attempt_sha256,
      automatic_retries: 0,
      classification: 'already_complete',
      cleanup_state: 'verified',
      dispatch_count: 1,
      provider_call_count: 0,
      schema_version: '1.0.0',
      simulated_request_count: 1,
    }, 'terminal_sha256');
    await writeExclusiveJson(withAttempt.locations.terminal, terminal, 'terminal');
  }
}

async function stopIndeterminate(state) {
  const simulated = state.executionObservation?.simulated_request_count ?? 0;
  const terminal = withDigest({
    ...checkpointIdentity(state),
    artifact_count: 0,
    automatic_retries: 0,
    classification: 'indeterminate_stopped',
    cleanup_state: 'unverified',
    dispatch_count: 1,
    provider_call_count: 0,
    schema_version: '1.0.0',
    simulated_request_count: simulated,
  }, 'terminal_sha256');
  await writeExclusiveJson(state.locations.terminal, terminal, 'indeterminate terminal');
}

async function recoverRunStateInternal(options = {}, hooks = {}) {
  const first = await inspectRunState(options);
  if (['already_complete', 'indeterminate_stopped', 'safely_resumable', 'fail_closed'].includes(first.classification)) return first;
  let root;
  let token;
  let locations;
  let result;
  try {
    root = await assertRC6Root(options.outputRoot, false);
    locations = pathsFor(root);
    token = await acquireRecoveryLock(locations);
    await hooks.afterLock?.();
    const state = await readAndValidateState(root, { ignoreLock: true });
    if (state.terminal !== null) result = observationFor(state);
    else {
      if (state.dispatch !== null && state.seal === null) await stopIndeterminate(state);
      else if (state.seal !== null) await publishTerminal(state);
      result = observationFor(await readAndValidateState(root, { ignoreLock: true }));
    }
  } catch (error) {
    result = await safeFailure(error, root);
  } finally {
    if (token !== undefined) {
      try { await releaseRecoveryLock(locations, token); } catch (error) {
        result = await safeFailure(error, root);
      }
    }
  }
  return result;
}

export async function recoverRunState(options = {}) {
  exactOptions(options, ['outputRoot']);
  return recoverRunStateInternal(options);
}

function defaultExecutor(options) {
  return executeDockerProviderFreeCase(options);
}

function operatorStepsForFault(fault) {
  return OPERATOR_RECOVERY_FAULTS.has(fault) ? 1 : 0;
}

async function exerciseSingle(options, evidenceMode, executor) {
  const fault = options.fault;
  const state = await prepareRunInternal(options.outputRoot, fault, evidenceMode);
  if (fault === 'before-reservation') return inspectRunState({ outputRoot: state.root });
  const reservation = await writeReservation(state);
  if (fault === 'after-reservation') return recoverRunState({ outputRoot: state.root });
  const dispatch = await writeDispatch(state, reservation);
  if (fault === 'after-dispatch') return recoverRunState({ outputRoot: state.root });

  await mkdir(path.join(state.root, 'docker-probe'), { mode: 0o700 });
  const executorResult = await executor({
    dockerExecutable: options.dockerExecutable,
    probeRoot: path.join(state.root, 'docker-probe'),
    request: state.request,
    transportMode: 'provider_free_success',
  });
  validateExecutorEnvelope(executorResult, state);
  const result = validateExecutorResult(executorResult.result);
  await writeExecutionObservation(state, result, executorResult.cleanup);
  if (fault === 'after-simulated-request') return recoverRunState({ outputRoot: state.root });
  if (fault === 'cleanup-failure') {
    const failedCleanup = withDigest({
      ...checkpointIdentity(state),
      authority_resources: 'residue_detected',
      container_residue_count: 1,
      credential_lock_residue_count: 1,
      disposable_state: 'retained_for_diagnostic',
      network_residue_count: 1,
      schema_version: '1.0.0',
      synthetic_credential_lock: 'residue_detected',
    }, 'cleanup_sha256');
    await writeExclusiveJson(state.locations.cleanup, failedCleanup, 'faulted cleanup record');
    return inspectRunState({ outputRoot: state.root });
  }
  const seal = await sealResult(state, result, executorResult.cleanup, dispatch);
  if (fault === 'after-seal') return recoverRunState({ outputRoot: state.root });
  if (fault === 'malformed-state') {
    await writeFile(state.locations.seal, '{"schema_version":"1.0.0"', { encoding: 'utf8' });
    return inspectRunState({ outputRoot: state.root });
  }
  if (fault === 'stale-identity') {
    const changed = { ...seal, permission_policy_sha256: 'b'.repeat(64) };
    changed.sealed_result_sha256 = digestProjection(changed, 'sealed_result_sha256');
    await writeFile(state.locations.seal, canonicalJsonV1(changed), { encoding: 'utf8' });
    return inspectRunState({ outputRoot: state.root });
  }
  if (fault === 'recovery-race') {
    let announceLock;
    let releaseLock;
    const locked = new Promise((resolve) => { announceLock = resolve; });
    const released = new Promise((resolve) => { releaseLock = resolve; });
    const firstPromise = recoverRunStateInternal({ outputRoot: state.root }, {
      afterLock: async () => {
        announceLock();
        await released;
      },
    });
    await locked;
    const second = await recoverRunState({ outputRoot: state.root });
    releaseLock();
    const first = await firstPromise;
    const final = await inspectRunState({ outputRoot: state.root });
    return Object.freeze({ ...final, race_results: [first.classification, second.classification].sort() });
  }
  await publishArtifact(await readAndValidateState(state.root));
  if (fault === 'after-artifact') return recoverRunState({ outputRoot: state.root });
  if (fault === 'artifact-drift') {
    await writeFile(state.locations.artifact, `${result.artifact}\nchanged`, { encoding: 'utf8' });
    return inspectRunState({ outputRoot: state.root });
  }
  await publishTerminal(await readAndValidateState(state.root));
  if (fault === 'second-dispatch') {
    try { await writeDispatch(state, reservation); } catch (error) {
      if (error?.code !== 'RC6_DUPLICATE_WRITE') throw error;
    }
  }
  return recoverRunState({ outputRoot: state.root });
}

async function exerciseRunStateInternal(options, evidenceMode, executor) {
  if (options.fault !== 'matrix') return exerciseSingle(options, evidenceMode, executor);
  const root = await assertRC6Root(options.outputRoot, true);
  const casesRoot = path.join(root, 'cases');
  await mkdir(casesRoot, { mode: 0o700 });
  const cases = [];
  for (const fault of REGISTERED_FAULTS) {
    const caseRoot = path.join(casesRoot, fault);
    await mkdir(caseRoot, { mode: 0o700 });
    const started = Date.now();
    const observation = await exerciseSingle({ ...options, fault, outputRoot: caseRoot }, evidenceMode, executor);
    const normalizedObservation = { ...observation, run_id: '<unique-run-identity-omitted-from-deterministic-capture>' };
    cases.push({ fault, observation: normalizedObservation, operator_steps: operatorStepsForFault(fault) });
    options.onTiming?.({ fault, wall_ms: Date.now() - started });
  }
  const capture = withDigest({
    cases,
    evidence_mode: evidenceMode,
    fault_order: [...REGISTERED_FAULTS],
    operator_step_definition: 'recover_actions_needed_to_reach_the_registered_classification',
    permission_policy_id: PERMISSION_POLICY_ID,
    provider_calls: 0,
    schema_version: '1.0.0',
    timing_fields: 'excluded_from_deterministic_capture_measured_out_of_band',
  }, 'capture_sha256');
  await writeExclusiveJson(path.join(root, 'fault-matrix-capture.json'), capture, 'fault matrix capture');
  return Object.freeze(capture);
}


export async function exerciseRunState(options = {}) {
  exactOptions(options, options.dockerExecutable === undefined
    ? ['fault', 'outputRoot']
    : ['dockerExecutable', 'fault', 'outputRoot']);
  return exerciseRunStateInternal(options, 'docker_exact_provider_free', defaultExecutor);
}

async function exerciseRunStateForTests(options = {}) {
  exactOptions(options, options.onTiming === undefined
    ? ['executor', 'fault', 'outputRoot']
    : ['executor', 'fault', 'onTiming', 'outputRoot']);
  if (typeof options.executor !== 'function') reject('RC6_ARGUMENT', 'The test-only executor must be a function.', 2);
  const { executor, ...remaining } = options;
  return exerciseRunStateInternal(remaining, 'injected_test_only', executor);
}

function requireInjectedTestState(state) {
  if (state?.plan?.evidence_mode !== 'injected_test_only') {
    reject('RC6_TEST_ONLY_STATE', 'A mutating test helper accepts only injected test-only state.', 2);
  }
  return state;
}

async function prepareRunForTests(outputRoot, fault) {
  if (arguments.length !== 2) reject('RC6_ARGUMENT', 'Test preparation accepts exactly an output root and fault.', 2);
  return prepareRunInternal(outputRoot, fault, 'injected_test_only');
}

async function recoverRunStateForTests(options = {}, hooks = {}) {
  exactOptions(options, ['outputRoot']);
  const root = await assertRC6Root(options.outputRoot, false);
  requireInjectedTestState(await readAndValidateState(root));
  return recoverRunStateInternal(options, hooks);
}

function injectedWriter(writer) {
  return async (state, ...arguments_) => writer(requireInjectedTestState(state), ...arguments_);
}

export function formatRC6Error(error) {
  if (error instanceof RC6RunStateError) return `[${error.code}] ${error.message}`;
  return '[RC6_INTERNAL_ERROR] A bounded content-safe diagnostic was withheld.';
}

export const RC6_PERMISSION_POLICY_ID = PERMISSION_POLICY_ID;
export const RC6_REGISTERED_FAULTS = REGISTERED_FAULTS;
export const RC6_INTERNALS_FOR_TESTS = Object.freeze({
  ALLOWED_SEMANTICS,
  AUTHORITY_ID,
  DENIED_CAPABILITIES,
  EXECUTOR_FAULTS,
  MAX_ARTIFACT_BYTES,
  buildPermissionPolicy,
  digestProjection,
  prepareRun: prepareRunForTests,
  publishArtifact: injectedWriter(publishArtifact),
  publishTerminal: injectedWriter(publishTerminal),
  readAndValidateState,
  recoverRunStateForTests,
  sealResult: injectedWriter(sealResult),
  validatePermissionPolicy,
  validateExecutorEnvelope,
  exerciseRunStateForTests,
  writeDispatch: injectedWriter(writeDispatch),
  writeExecutionObservation: injectedWriter(writeExecutionObservation),
  writeReservation: injectedWriter(writeReservation),
});
