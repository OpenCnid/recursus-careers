import { createHash } from 'node:crypto';
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
const ATTEMPT_DIRECTORY = 'attempts';
const MAX_OUTPUT_TOKENS = 4_000;
const MAX_TOTAL_OUTPUT_TOKENS = 12_000;
const MAX_CALLS = 3;
const MAX_CASE_WALL_MS = 600_000;
const MAX_TOTAL_WALL_MS = 1_800_000;
const MAX_ARTIFACT_BYTES = 65_536;
const TARGET_ID = 'recursus-direct-v1';

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
  let bytes;
  let value;
  try {
    bytes = await readFile(filePath);
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    reject('RC5_JSON_READ', `${label} is unavailable or invalid.`);
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
  });
  if (plan.budgets?.max_concurrency !== 1 || plan.budgets?.max_provider_calls !== MAX_CALLS || plan.budgets?.max_output_tokens_per_call !== MAX_OUTPUT_TOKENS ||
      plan.budgets?.max_total_output_tokens !== MAX_TOTAL_OUTPUT_TOKENS || plan.budgets?.max_wall_ms_per_call !== MAX_CASE_WALL_MS ||
      plan.budgets?.max_total_wall_ms !== MAX_TOTAL_WALL_MS || plan.policy?.model_facing_tools?.length !== 0 ||
      plan.policy?.automatic_retries !== 0 || plan.policy?.external_mutation !== 'forbidden') {
    reject('RC5_PLAN_POLICY', 'The slice plan budget or authority boundary differs.');
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
  for (const item of value.cases) {
    const bundlePath = path.join(root, ...item.treatment.bundle_path.split('/'));
    const bytes = await readFile(bundlePath);
    if (bytes.length !== item.treatment.bundle_byte_count || digest(bytes) !== item.treatment.bundle_file_sha256) {
      reject('RC5_BUNDLE_INTEGRITY', 'A prepared treatment bundle changed after preparation.');
    }
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
  const cases = [];
  for (const scenarioId of RC5_CASE_ORDER) {
    const config = CASES[scenarioId];
    const scenario = await validateScenario(REPOSITORY_ROOT, scenarioId);
    const baseline = await validateBaseline(REPOSITORY_ROOT, scenarioId);
    const compiled = await compilePromptContext({ mode_id: 'oferta', fixture_id: config.fixture_id, context });
    const bundle = projectRouteBundle({ compiled_prompt: compiled, target_id: TARGET_ID, context });
    const decoded = decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context });
    const inspection = inspectTreatmentBundle(bundle, decoded, scenarioId);
    bundles.push({ bundle, scenarioId });
    bundleInspections.push(inspection);
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
        model_facing_tools: [],
        target_id: TARGET_ID,
      },
    });
  }
  const compatibility = assessV17Compatibility(context.adapters[TARGET_ID], v17.registration, bundleInspections);
  const after = await snapshotAcceptedInputs();
  assertAcceptedSnapshotsEqual(before, after);
  await mkdir(path.join(root, BUNDLE_DIRECTORY), { recursive: false, mode: 0o700 });
  for (const { bundle, scenarioId } of bundles) {
    await writeExclusiveJson(path.join(root, BUNDLE_DIRECTORY, `${scenarioId}.route-bundle.json`), bundle, `${scenarioId} treatment bundle`);
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
      adapter: v17.registration.route.adapter,
      control_plane: v17.registration.route.control_plane,
      harness: v17.registration.route.harness,
      model: v17.registration.route.model,
      provider: v17.registration.route.provider,
      runtime: v17.registration.route.runtime,
      v17_route_id: v17.registration.route.route_id,
    },
    schema_version: '1.0.0',
    synthetic: true,
  };
  plan.plan_digest.value = planDigest(plan);
  validatePlanDocument(plan);
  await writeExclusiveJson(path.join(root, PLAN_FILE), plan, 'RC-5 slice plan');
  return Object.freeze({ compatibility: compatibility.status, plan_digest: plan.plan_digest.value, recommendation: plan.recommendation_if_unresolved });
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
  if (envelope.external_mutation !== false || envelope.max_concurrency !== 1 || envelope.retry_count !== 0 || envelope.max_output_tokens > MAX_OUTPUT_TOKENS || envelope.timeout_ms > MAX_CASE_WALL_MS) {
    reject('RC5_EXECUTION_POLICY', 'The treatment execution envelope exceeds the slice authority.');
  }
  return true;
}

function validateAttemptResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) reject('RC5_RESULT_INVALID', 'The treatment result is invalid.');
  if (!['completed', 'failed', 'timed_out'].includes(result.completion)) reject('RC5_RESULT_INVALID', 'The treatment completion status is invalid.');
  if (result.wall_ms > MAX_CASE_WALL_MS || result.output_tokens > MAX_OUTPUT_TOKENS) reject('RC5_RESULT_BUDGET', 'The treatment result exceeds a per-case budget.');
  if (result.completion === 'timed_out' && result.trusted_completed === true) reject('RC5_FALSE_COMPLETION', 'A timed-out request cannot be presented as completed.');
  if (result.completion === 'completed' && result.trusted_completed !== true) reject('RC5_FALSE_COMPLETION', 'An incomplete result cannot be presented as completed.');
  if (Array.isArray(result.external_mutations) && result.external_mutations.length !== 0) reject('RC5_EXTERNAL_MUTATION', 'A prohibited external mutation was reported.');
  const artifact = Buffer.isBuffer(result.artifact) ? result.artifact : Buffer.from(result.artifact || '', 'utf8');
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
    const document = await readCanonicalJson(path.join(attemptsRoot, name), 'treatment attempt');
    validateAttemptResult(document.value);
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
    reject('RC5_ROUTE_INCOMPATIBLE', 'Accepted V17 cannot consume the RC-4 delivery bundle without an unregistered semantic transformation. REBUILD is required.');
  }
  reject('RC5_ROUTE_INCOMPATIBLE', 'No alternate provider path is authorized for this slice. REBUILD is required.');
}

function decisionMarkdown(summary) {
  return `# RC-5 decision note\n\n**Recommendation:** ${summary.recommendation}\n\nProvider calls made: ${summary.provider_call_count}. No baseline provider call was made.\n\nThe accepted RC-4 Recursus bundle is a semantic delivery plan with ordered system and user parts, while the accepted V17 capture route supports only its fixed single-user-message bridge and a 4,096-token output setting. Flattening the bundle would bypass the registered compiler semantics, and V17's cap exceeds RC-5's 4,000-token limit. The slice therefore stopped before FACT-01 and made no provider request.\n\nRetain the fail-closed compiler, identity, output-root, and budget guards if rebuilding. Replace the V17 bridge with a registered DSH request interface that consumes the RC-4 system/user parts directly and enforces the RC-5 cap before requesting new provider authority. The caller may delete this disposable output root after review.\n\nThis result does not establish feature parity, production readiness, provider neutrality, runtime causality, statistical significance, universal superiority, or hiring outcomes.\n`;
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
  acceptedSnapshotDigest,
  assertAcceptedSnapshotsEqual,
  assertCallLedger,
  assertExecutionEnvelope,
  assessV17Compatibility,
  inspectTreatmentBundle,
  planDigest,
  snapshotAcceptedInputs,
  validateAttemptResult,
  validatePlanDocument,
});
