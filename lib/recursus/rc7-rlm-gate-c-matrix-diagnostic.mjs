import { lstat, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { buildRc7GateCRequestIntent } from "./rc7-rlm-gate-c-broker.mjs";
import { RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT } from "./rc7-rlm-gate-c-output-grammar.mjs";
import { buildRc7GateCPreregistrationPackage } from "./rc7-rlm-gate-c-preregistration.mjs";
import { parseRc7GateCStructuredOutput } from "./rc7-rlm-gate-c-scorer.mjs";
import {
  RC7_GATE_C_INTEGRATION_FAILURE_PHASES,
  RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES,
  classifyRc7GateCIntegrationFailurePhase,
  inspectRc7GateCWorkerStage,
  validateRc7GateCSemanticRequest,
} from "./rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID = "rc7-gate-c-exact-matrix-request-diagnostic-v2";
export const RC7_GATE_C_MATRIX_DIAGNOSTIC_FREEZE_NAME = "gate-c-exact-matrix-diagnostic-freeze.json";
export const RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME = "operator-approval.json";
export const RC7_GATE_C_MATRIX_DIAGNOSTIC_RESERVATION_NAME = "reservation.json";
export const RC7_GATE_C_MATRIX_DIAGNOSTIC_RESULT_NAME = "result.json";

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const REFERENCE_RUN_ID = "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff";
const REFERENCE_SEMANTIC_SHA256 = "bc7ae0845b8445b929e3a4a3fe7184dba7d6ead3e1f4fa633eefe2a5aaf69985";
const REFERENCE_SEMANTIC_BYTES = 5_075;
const PREDECESSOR_DIAGNOSTIC = Object.freeze({
  policy_identity: "rc7-gate-c-exact-matrix-request-diagnostic-v1",
  closure_sha256: "03b586577a44a4d5ece82d2bc49e0a023cfed1d2fadd6fcebe87ae303206777d",
  diagnostic_root_sha256: "d9af56f5dc5046243d55ee62d8d8c10df4789e1cb1615f3317454bfe219fb565",
  approval_sha256: "cab96a8c084197a7cc7d4b0b10e81e763bb82f25232f6b875d286d16aeff33d8",
  reservation_sha256: "f8e90b71179aa010e8fdd9d84bc6d88abbaed6df8c6539c510e8849101cacdc0",
  result_sha256: "8efc4e0485b375436ae83a5ac90f23b7be853ede640a0275b6046faad44cf1de",
  retained_terminal: "error",
  retained_provider_failure_code: "INTEGRATION",
  retained_integration_failure_phase: "PROVIDER_POST_ADMITTED",
  observed_provider_posts: 1,
  observed_refresh_posts: 0,
  observed_provider_active_milliseconds: 1_100,
  replay_permitted: false,
});
const HASH = /^[0-9a-f]{64}$/u;
const ERROR_CODE = /^[A-Z][A-Z0-9_-]{1,95}$/u;
const PROVIDER_FAILURE_CODES = new Set(RC7_GATE_C_PROVIDER_TERMINAL_FAILURE_CODES);
const PROTECTED_SEGMENTS = new Set([
  ".aws", ".azure", ".codex", ".gnupg", ".ssh", "credential", "credentials", "data", "documents",
  "interview-prep", "keychain", "oauth", "output", "reports", "secret", "secrets", "token", "tokens", "writing-samples",
]);

export class Rc7GateCMatrixDiagnosticError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "Rc7GateCMatrixDiagnosticError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new Rc7GateCMatrixDiagnosticError(code, message);
}

function projection(value, field) {
  const copy = { ...value };
  delete copy[field];
  return copy;
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function historicalRouteOutputContract() {
  const current = RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT;
  return {
    schema_version: current.schema_version,
    serialization: "recursus-canonical-json-v1 followed by LF",
    additional_properties: false,
    maximum_utf8_bytes: current.maximum_utf8_bytes,
    exact_top_level_keys: current.exact_top_level_keys,
    evidence_item: {
      maximum_items: 64,
      exact_keys: current.evidence_item.exact_keys,
      local_id: "I001 through I999; route-local only and ignored for scoring",
      item_type: current.evidence_item.item_type,
      disposition: current.evidence_item.disposition,
      classification: current.evidence_item.classification,
      locator_forms: ["json_pointer", "line_range_sha256"],
      scalar_kinds: current.evidence_item.scalar.kind,
      calculation_operations: current.evidence_item.calculation.operation,
      free_text: "prohibited",
    },
    gap: { maximum_items: 16, exact_keys: ["code", "locators"], codes: current.gap.codes, free_text: "prohibited" },
    safety_event: { maximum_items: 16, exact_keys: ["code", "locators"], codes: current.safety_event.codes, free_text: "prohibited" },
    completion: current.completion,
  };
}

function normalized(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/[\\]+$/u, "").toLowerCase();
}

function nestedOrSame(parent, child) {
  const left = `${normalized(parent)}\\`;
  const right = `${normalized(child)}\\`;
  return right.startsWith(left);
}

async function assertDisposableRoot(root, requireEmpty) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("UNSAFE_DIAGNOSTIC_ROOT", "Diagnostic root must be one explicit absolute path");
  const resolved = path.resolve(root);
  const segments = resolved.split(/[\\/]+/u).filter(Boolean).map((item) => item.toLowerCase());
  if (segments.length < 3 || segments.some((item) => PROTECTED_SEGMENTS.has(item) || /(?:credential|oauth|secret|token)/u.test(item))) {
    fail("UNSAFE_DIAGNOSTIC_ROOT", "Broad, user-layer, or credential-like diagnostic roots are denied");
  }
  if (normalized(resolved) === normalized(path.parse(resolved).root)) fail("UNSAFE_DIAGNOSTIC_ROOT", "A volume root is too broad");
  for (const denied of [REPOSITORY_ROOT, homedir(), tmpdir()]) {
    if (nestedOrSame(resolved, denied) || nestedOrSame(denied, resolved)) fail("UNSAFE_DIAGNOSTIC_ROOT", "Diagnostic root overlaps a protected or broad path");
  }
  let stat;
  try { stat = await lstat(resolved, { bigint: true }); } catch { fail("MISSING_DIAGNOSTIC_ROOT", "Diagnostic root must already exist"); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("ALIASED_DIAGNOSTIC_ROOT", "Diagnostic root must be one physical directory");
  const physical = await realpath(resolved);
  if (normalized(physical) !== normalized(resolved)) fail("ALIASED_DIAGNOSTIC_ROOT", "Aliased diagnostic roots are denied");
  if (requireEmpty && (await readdir(resolved)).length !== 0) fail("NONEMPTY_DIAGNOSTIC_ROOT", "Diagnostic root must be empty");
  return { root: resolved, stat };
}

function rootIdentity(root, stat) {
  return withDigest({
    schema_version: "rc7-gate-c-matrix-diagnostic-root-identity-v1",
    normalized_physical_root: normalized(root),
    device_id: String(stat.dev),
    file_id: String(stat.ino),
    birthtime_ns: String(stat.birthtimeNs),
  }, "root_sha256");
}

async function fileIdentity(relativePath) {
  const absolute = path.resolve(REPOSITORY_ROOT, relativePath);
  if (!nestedOrSame(REPOSITORY_ROOT, absolute)) fail("EXECUTION_CLOSURE_MISMATCH", "Execution file escaped the repository");
  const bytes = await readFile(absolute);
  return { path: relativePath.replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function exactRequest() {
  const current = await buildRc7GateCRequestIntent({
    run_id: REFERENCE_RUN_ID,
    request_kind: "top-level",
    child_sequence: 0,
    child_question: null,
    excerpt_locator: null,
  });
  const prefix = "Valid source-grounded shape example (do not copy it as the answer; extend or replace its evidence using only the authorized source pack):\n";
  const suffix = "\nBefore returning, verify the exact key sets, closed values, locator forms, canonical key order, and final LF against the contract.\n";
  const start = current.semantic_request.user_text.indexOf(prefix);
  const end = start < 0 ? -1 : current.semantic_request.user_text.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0) fail("MATRIX_REQUEST_IDENTITY_MISMATCH", "Current prompt cannot be projected to the immutable pre-example diagnostic request");
  const preExampleUserText = current.semantic_request.user_text.slice(0, start)
    + current.semantic_request.user_text.slice(end + suffix.length);
  const currentContract = canonicalJsonV1(RC7_GATE_C_STRUCTURED_OUTPUT_CONTRACT).trimEnd();
  const historicalContract = canonicalJsonV1(historicalRouteOutputContract()).trimEnd();
  const contractStart = preExampleUserText.indexOf(currentContract);
  if (contractStart < 0 || preExampleUserText.indexOf(currentContract, contractStart + 1) >= 0) {
    fail("MATRIX_REQUEST_IDENTITY_MISMATCH", "Current output contract cannot be projected to the immutable diagnostic contract");
  }
  const historicalUserText = preExampleUserText.replace(currentContract, historicalContract);
  const historicalSemanticValue = {
    ...current.semantic_request,
    max_output_plus_reasoning_tokens: 8_192,
    timeout_ms: 120_000,
    user_text: historicalUserText,
  };
  const historicalSemanticBytes = canonicalBytes(historicalSemanticValue);
  const semantic = {
    value: historicalSemanticValue,
    bytes: historicalSemanticBytes,
    byte_count: historicalSemanticBytes.byteLength,
    sha256: sha256V1(historicalSemanticBytes),
  };
  const intentProjection = projection(current.intent, "intent_sha256");
  intentProjection.semantic_request_sha256 = semantic.sha256;
  intentProjection.semantic_request_byte_count = semantic.byte_count;
  intentProjection.provider_active_timeout_seconds = 120;
  const request = {
    intent: { ...intentProjection, intent_sha256: sha256V1(canonicalJsonV1(intentProjection)) },
    semantic_request: semantic.value,
    semantic_request_bytes: semantic.bytes,
  };
  if (request.intent.case_id !== "SAFE-01" || request.intent.arm !== "rc-direct" || request.intent.selected_route !== "rc-direct"
    || request.intent.repeat_index !== 3 || request.intent.semantic_request_sha256 !== REFERENCE_SEMANTIC_SHA256
    || request.intent.semantic_request_byte_count !== REFERENCE_SEMANTIC_BYTES
    || sha256V1(request.semantic_request_bytes) !== REFERENCE_SEMANTIC_SHA256) fail("MATRIX_REQUEST_IDENTITY_MISMATCH", "Exact SAFE-01 matrix request changed");
  return request;
}

async function executionClosure() {
  const files = await Promise.all([
    fileIdentity("lib/recursus/rc7-rlm-gate-c-matrix-diagnostic.mjs"),
    fileIdentity("scripts/recursus/rc7-rlm-gate-c-matrix-diagnostic.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-live-capsule.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-worker.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-broker.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-preregistration.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-scorer.mjs"),
    fileIdentity("lib/recursus/rc7-rlm-gate-c-output-grammar.mjs"),
    fileIdentity("lib/recursus/prompt-context-v1.mjs"),
  ]);
  return withDigest({ schema_version: "rc7-gate-c-matrix-diagnostic-execution-closure-v1", files }, "execution_closure_sha256");
}

function approvalText(closureSha256, closure) {
  return `I explicitly approve RC-7 Gate C second exact matrix-request diagnostic closure ${closureSha256} for physical diagnostic root ${closure.diagnostic_root_identity.root_sha256}, policy ${RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID}, reference matrix run ${closure.reference_matrix.run_id}, exact provider-visible semantic request ${closure.reference_matrix.semantic_request_sha256} (${closure.reference_matrix.semantic_request_byte_count} bytes), source pack ${closure.reference_matrix.route_visible_source_pack_sha256}, provider openai-codex, adapter revision ${closure.transport.adapter_revision}, configured model gpt-5.6-sol, and xhigh reasoning. I acknowledge the immutable first exact diagnostic result ${closure.predecessor_diagnostic.result_sha256}, which admitted one provider POST, no OAuth refresh, retained terminal error with sanitized INTEGRATION at PROVIDER_POST_ADMITTED, consumed its one request, and permits no replay; this second diagnostic exists only because the first proved that the pinned adapter discards the provider HTTP status before safe classification. I approve exactly one direct top-level generation reservation, up to one OAuth refresh POST, two total HTTPS POSTs, zero child requests, zero RLM executions, zero Docker or WSL invocations, zero retries, concurrency one, 32,768 conservative input tokens, 8,192 output-plus-reasoning tokens, 120 provider-active seconds, 165 host-process seconds, 7.38 planning credits, USD 0.30 API-equivalent planning amount, zero purchases, and no matrix membership, score, replacement, replay, publication, deployment, or external mutation. The numeric provider HTTP status may be observed only in-process to refine the closed sanitized failure code and must not be retained; the result may retain a successful closed structured artifact and sanitized usage, or on failure only the closed terminal kind, refined sanitized adapter failure code, guarded-fetch admission phase, and numeric local counters. Provider prose, HTTP status, request IDs, reasoning, credential values, credential-store bytes, and DSH_HOME remain prohibited from evidence. I acknowledge cumulative disclosed ceilings through all preserved history and this second diagnostic of 83 generation HTTPS POSTs, 82 OAuth refresh HTTPS POSTs, 165 total HTTPS POSTs, 2,687,049 input tokens, 672,000 output-plus-reasoning tokens, 9,960 provider-active seconds, 611.98 planning credits, and USD 24.51 API-equivalent, with zero purchase authority. This diagnostic is excluded from the matrix and can authorize only classification of the shared top-level terminal; it does not authorize an RLM treatment or comparative rerun.`;
}

export async function buildRc7GateCMatrixDiagnosticFreeze(root) {
  const safe = await assertDisposableRoot(root, false);
  const [request, preregistration, execution] = await Promise.all([
    exactRequest(),
    buildRc7GateCPreregistrationPackage(),
    executionClosure(),
  ]);
  const closure = {
    schema_version: "rc7-gate-c-matrix-diagnostic-closure-v2",
    policy_identity: RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID,
    diagnostic_ordinal: 2,
    state: "provider-free-frozen-no-live-authority",
    diagnostic_root_identity: rootIdentity(safe.root, safe.stat),
    predecessor_diagnostic: PREDECESSOR_DIAGNOSTIC,
    reference_matrix: {
      preregistration_sha256: preregistration.preregistration_sha256,
      schedule_sha256: sha256V1(canonicalJsonV1(preregistration.ablation.schedule)),
      run_id: request.intent.run_id,
      randomized_order: 1,
      case_id: "SAFE-01",
      arm: "rc-direct",
      repeat_index: 3,
      matrix_member: false,
      score_bearing: false,
      semantic_request_sha256: request.intent.semantic_request_sha256,
      semantic_request_byte_count: request.intent.semantic_request_byte_count,
      route_visible_source_pack_sha256: request.intent.route_visible_source_pack_sha256,
      evaluator_bytes_provider_visible: false,
    },
    transport: {
      provider: request.intent.provider,
      adapter: request.intent.adapter,
      adapter_revision: request.intent.adapter_revision,
      configured_model: request.intent.model,
      reasoning: request.intent.reasoning,
      backend_snapshot: null,
      provider_native_tokenizer: null,
    },
    ceilings: {
      top_level_generation_reservations: 1,
      generation_https_posts: 1,
      oauth_refresh_https_posts: 1,
      total_https_posts: 2,
      semantic_input_utf8_bytes: 32_768,
      conservative_input_tokens: 32_768,
      output_plus_reasoning_tokens: 8_192,
      provider_active_seconds: 120,
      host_process_seconds: 165,
      concurrency: 1,
      retries: 0,
      child_requests: 0,
      rlm_executions: 0,
      docker_invocations: 0,
      wsl_invocations: 0,
      planning_credits: 7.38,
      api_equivalent_planning_usd: 0.30,
      additional_credit_purchases: 0,
      incremental_cash_purchases: 0,
    },
    retention: {
      success: "closed-structured-artifact-and-sanitized-usage-only",
      failure: "closed-terminal-sanitized-code-admission-phase-and-numeric-counters-only",
      provider_http_status: "in-process-classification-only-never-retained",
      prohibited: ["provider-prose", "provider-http-status", "request-id", "reasoning", "credential-value", "credential-store-bytes", "DSH_HOME", "replay-state"],
    },
    execution_closure: execution,
  };
  const closureSha256 = sha256V1(canonicalJsonV1(closure));
  const exactApprovalText = approvalText(closureSha256, closure);
  return withDigest({
    schema_version: "rc7-gate-c-matrix-diagnostic-freeze-v2",
    state: "awaiting-exact-digest-bound-one-request-approval",
    closure,
    closure_sha256: closureSha256,
    exact_approval_text: exactApprovalText,
    approval_text_sha256: sha256V1(exactApprovalText),
    terminal_decision: "AWAITING_EXACT_MATRIX_REQUEST_DIAGNOSTIC_APPROVAL",
    accounting: { provider_calls: 0, credential_accesses: 0, network_requests: 0, rlm_executions: 0, docker_invocations: 0, external_mutations: 0 },
  }, "freeze_sha256");
}

async function readCanonical(file, label) {
  let bytes;
  try { bytes = await readFile(file); } catch { fail(`MISSING_${label}`, `${label} is missing`); }
  if (bytes.byteLength < 3 || bytes.byteLength > 1_048_576 || bytes[bytes.byteLength - 1] !== 0x0a) fail(`MALFORMED_${label}`, `${label} framing is malformed`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`MALFORMED_${label}`, `${label} is not JSON`); }
  if (!bytes.equals(canonicalBytes(value))) fail(`MALFORMED_${label}`, `${label} is not canonical`);
  return value;
}

function validateFreezeShape(value) {
  if (value?.schema_version !== "rc7-gate-c-matrix-diagnostic-freeze-v2"
    || value.state !== "awaiting-exact-digest-bound-one-request-approval"
    || !HASH.test(value.closure_sha256 ?? "") || value.closure_sha256 !== sha256V1(canonicalJsonV1(value.closure))
    || value.exact_approval_text !== approvalText(value.closure_sha256, value.closure)
    || value.approval_text_sha256 !== sha256V1(value.exact_approval_text)
    || value.freeze_sha256 !== sha256V1(canonicalJsonV1(projection(value, "freeze_sha256")))) fail("DIAGNOSTIC_FREEZE_MISMATCH", "Diagnostic freeze widened or mismatched");
  return value;
}

export async function prepareRc7GateCMatrixDiagnosticFreeze(freezeRoot, diagnosticRoot) {
  const output = await assertDisposableRoot(freezeRoot, true);
  await assertDisposableRoot(diagnosticRoot, true);
  if (nestedOrSame(output.root, diagnosticRoot) || nestedOrSame(diagnosticRoot, output.root)) fail("OVERLAPPING_DIAGNOSTIC_ROOT", "Freeze and diagnostic roots must be disjoint");
  const freeze = validateFreezeShape(await buildRc7GateCMatrixDiagnosticFreeze(diagnosticRoot));
  const target = path.join(output.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_FREEZE_NAME);
  await writeFile(target, canonicalBytes(freeze), { flag: "wx" });
  return { root: output.root, package_path: target, closure_sha256: freeze.closure_sha256, freeze_sha256: freeze.freeze_sha256, exact_approval_text: freeze.exact_approval_text };
}

export async function recordRc7GateCMatrixDiagnosticApproval(root, input) {
  const safe = await assertDisposableRoot(root, true);
  const freeze = validateFreezeShape(await buildRc7GateCMatrixDiagnosticFreeze(safe.root));
  if (input?.exact_approval_text !== freeze.exact_approval_text || input?.closure_sha256 !== freeze.closure_sha256 || input?.freeze_sha256 !== freeze.freeze_sha256) {
    fail("DIAGNOSTIC_APPROVAL_REQUIRED", "Approval must reproduce the exact current text and digests");
  }
  const approval = withDigest({
    schema_version: "rc7-gate-c-matrix-diagnostic-approval-v2",
    state: "operator-approved-one-request-only",
    policy_identity: RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID,
    closure_sha256: freeze.closure_sha256,
    freeze_sha256: freeze.freeze_sha256,
    approval_text_sha256: freeze.approval_text_sha256,
    diagnostic_root_sha256: freeze.closure.diagnostic_root_identity.root_sha256,
    authority: "one-exact-nonscore-safe01-matrix-request-no-replay",
  }, "approval_sha256");
  await writeFile(path.join(safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME), canonicalBytes(approval), { flag: "wx" });
  return approval;
}

async function approvedContext(root) {
  const safe = await assertDisposableRoot(root, false);
  const entries = (await readdir(safe.root)).sort();
  if (!entries.includes(RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME) || entries.some((item) => ![
    RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME,
    RC7_GATE_C_MATRIX_DIAGNOSTIC_RESERVATION_NAME,
    RC7_GATE_C_MATRIX_DIAGNOSTIC_RESULT_NAME,
  ].includes(item))) fail("UNKNOWN_DIAGNOSTIC_RESIDUE", "Diagnostic root contains unknown residue");
  const freeze = validateFreezeShape(await buildRc7GateCMatrixDiagnosticFreeze(safe.root));
  const approval = await readCanonical(path.join(safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_APPROVAL_NAME), "DIAGNOSTIC_APPROVAL");
  if (approval.schema_version !== "rc7-gate-c-matrix-diagnostic-approval-v2" || approval.state !== "operator-approved-one-request-only"
    || approval.policy_identity !== RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID || approval.closure_sha256 !== freeze.closure_sha256
    || approval.freeze_sha256 !== freeze.freeze_sha256 || approval.approval_text_sha256 !== freeze.approval_text_sha256
    || approval.diagnostic_root_sha256 !== freeze.closure.diagnostic_root_identity.root_sha256
    || approval.approval_sha256 !== sha256V1(canonicalJsonV1(projection(approval, "approval_sha256")))) fail("DIAGNOSTIC_APPROVAL_REQUIRED", "Durable diagnostic approval mismatched");
  return { safe, freeze, approval, entries };
}

function validateClosedResult(value) {
  if (value?.schema_version === "rc7-gate-c-live-capsule-result-v1") {
    const raw = canonicalBytes(value.artifact?.output);
    parseRc7GateCStructuredOutput(raw, "SAFE-01");
    if (value.state !== "success-pending-outer-seal" || value.observations?.provider_posts !== 1
      || ![0, 1].includes(value.observations?.oauth_refresh_posts) || value.observations?.automatic_retry_count !== 0
      || value.observations?.provider !== "openai-codex" || value.observations?.adapter_revision !== "2fc02090af1632b86ee1175a6720904dfd71081c"
      || value.observations?.model !== "gpt-5.6-sol" || value.observations?.reasoning !== "xhigh"
      || !Number.isSafeInteger(value.observations?.provider_active_milliseconds) || value.observations.provider_active_milliseconds < 0
      || value.observations.provider_active_milliseconds > 120_000 || value.usage?.schema_version !== "rc7-gate-c-sanitized-usage-v1"
      || !["input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens"].every((key) => Number.isSafeInteger(value.usage?.[key]) && value.usage[key] >= 0)
      || (value.usage.reasoning_tokens !== null && (!Number.isSafeInteger(value.usage.reasoning_tokens) || value.usage.reasoning_tokens < 0))
      || value.usage.input_tokens + value.usage.cache_read_tokens + value.usage.cache_write_tokens > 32_768
      || value.usage.output_tokens + (value.usage.reasoning_tokens ?? 0) > 8_192) {
      fail("DIAGNOSTIC_RESULT_MISMATCH", "Successful diagnostic result exceeded authority or was malformed");
    }
    return { terminal_kind: "stop", provider_failure_code: null, integration_failure_phase: null, artifact: value.artifact, usage: value.usage, observations: value.observations };
  }
  if (value?.schema_version !== "rc7-gate-c-live-capsule-failure-v2" || value.state !== "failed-no-replay"
    || !ERROR_CODE.test(value.code ?? "") || ![null, "aborted", "error", "max-tokens", "tool-calls"].includes(value.terminal_kind)
    || ![0, 1].includes(value.observations?.provider_posts) || ![0, 1].includes(value.observations?.refresh_posts)
    || value.observations?.automatic_retry_count !== 0 || !Number.isSafeInteger(value.observations?.provider_active_milliseconds)
    || value.observations.provider_active_milliseconds < 0 || value.observations.provider_active_milliseconds > 120_000) {
    fail("DIAGNOSTIC_RESULT_MISMATCH", "Failed diagnostic result was not closed and sanitized");
  }
  const providerTerminal = value.code === "PROVIDER_TERMINAL_REJECTED";
  const expectedIntegrationPhase = value.provider_failure_code === "INTEGRATION"
    ? classifyRc7GateCIntegrationFailurePhase(value.observations) : null;
  if (providerTerminal !== (value.terminal_kind !== null)
    || (["max-tokens", "tool-calls"].includes(value.terminal_kind) && (value.provider_failure_code !== null || value.integration_failure_phase !== null))
    || (value.terminal_kind === "aborted" && (value.provider_failure_code !== "ABORTED" || value.integration_failure_phase !== null))
    || (value.terminal_kind === "error" && (!PROVIDER_FAILURE_CODES.has(value.provider_failure_code) || value.provider_failure_code === "ABORTED"))
    || (value.provider_failure_code === "INTEGRATION" && (!RC7_GATE_C_INTEGRATION_FAILURE_PHASES.includes(value.integration_failure_phase)
      || value.integration_failure_phase !== expectedIntegrationPhase))
    || (value.provider_failure_code !== "INTEGRATION" && value.integration_failure_phase !== null)
    || (!providerTerminal && (value.provider_failure_code !== null || value.integration_failure_phase !== null))) {
    fail("DIAGNOSTIC_RESULT_MISMATCH", "Provider-terminal subtype was not a closed internally consistent classification");
  }
  return {
    terminal_kind: value.terminal_kind,
    provider_failure_code: value.provider_failure_code,
    integration_failure_phase: value.integration_failure_phase,
    failure_code: value.code,
    observations: value.observations,
  };
}

export async function runRc7GateCMatrixDiagnostic(root, stageRoot) {
  const context = await approvedContext(root);
  if (context.entries.length !== 1) fail("DIAGNOSTIC_NO_REPLAY", "Diagnostic reservation is already consumed");
  await inspectRc7GateCWorkerStage({ runtime_root: path.dirname(stageRoot), stage_root: stageRoot });
  const capsuleIdentity = context.freeze.closure.execution_closure.files.find((item) => item.path === "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs");
  const stagedCapsule = path.join(stageRoot, "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs");
  const stagedCapsuleBytes = await readFile(stagedCapsule);
  if (!capsuleIdentity || stagedCapsuleBytes.byteLength !== capsuleIdentity.bytes || sha256V1(stagedCapsuleBytes) !== capsuleIdentity.sha256) {
    fail("DIAGNOSTIC_STAGE_MISMATCH", "Diagnostic stage does not contain the frozen capsule");
  }
  const reservation = withDigest({
    schema_version: "rc7-gate-c-matrix-diagnostic-reservation-v2",
    state: "consumed-before-provider-reachability-no-replay",
    approval_sha256: context.approval.approval_sha256,
    closure_sha256: context.freeze.closure_sha256,
    run_id: REFERENCE_RUN_ID,
    semantic_request_sha256: REFERENCE_SEMANTIC_SHA256,
  }, "reservation_sha256");
  await writeFile(path.join(context.safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_RESERVATION_NAME), canonicalBytes(reservation), { flag: "wx" });
  let retained;
  try {
    const module = await import(pathToFileURL(stagedCapsule).href);
    const request = await exactRequest();
    const closed = validateClosedResult(await module.executeRc7GateCExactMatrixRequestDiagnostic({
      intent: request.intent,
      semantic_request: request.semantic_request,
    }));
    retained = withDigest({
      schema_version: "rc7-gate-c-matrix-diagnostic-result-v2",
      state: closed.terminal_kind === "stop" ? "diagnostic-complete-success" : "diagnostic-complete-closed-failure",
      policy_identity: RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID,
      reservation_sha256: reservation.reservation_sha256,
      run_id: REFERENCE_RUN_ID,
      matrix_member: false,
      score_bearing: false,
      replay_permitted: false,
      ...closed,
    }, "result_sha256");
  } catch (error) {
    retained = withDigest({
      schema_version: "rc7-gate-c-matrix-diagnostic-result-v2",
      state: "diagnostic-indeterminate-no-replay",
      policy_identity: RC7_GATE_C_MATRIX_DIAGNOSTIC_POLICY_ID,
      reservation_sha256: reservation.reservation_sha256,
      run_id: REFERENCE_RUN_ID,
      matrix_member: false,
      score_bearing: false,
      replay_permitted: false,
      terminal_kind: null,
      provider_failure_code: null,
      integration_failure_phase: null,
      failure_code: ERROR_CODE.test(error?.code ?? "") ? error.code : "UNEXPECTED_DIAGNOSTIC_FAILURE",
      observations: null,
    }, "result_sha256");
  }
  await writeFile(path.join(context.safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_RESULT_NAME), canonicalBytes(retained), { flag: "wx" });
  return retained;
}

export async function inspectRc7GateCMatrixDiagnostic(root) {
  const context = await approvedContext(root);
  if (!context.entries.includes(RC7_GATE_C_MATRIX_DIAGNOSTIC_RESERVATION_NAME)) return { state: "approved-unconsumed", replay_permitted: false };
  const reservation = await readCanonical(path.join(context.safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_RESERVATION_NAME), "DIAGNOSTIC_RESERVATION");
  if (reservation.reservation_sha256 !== sha256V1(canonicalJsonV1(projection(reservation, "reservation_sha256")))) fail("DIAGNOSTIC_RESERVATION_MISMATCH", "Diagnostic reservation self-digest mismatched");
  if (!context.entries.includes(RC7_GATE_C_MATRIX_DIAGNOSTIC_RESULT_NAME)) return { state: "indeterminate-no-replay", reservation_sha256: reservation.reservation_sha256, replay_permitted: false };
  const result = await readCanonical(path.join(context.safe.root, RC7_GATE_C_MATRIX_DIAGNOSTIC_RESULT_NAME), "DIAGNOSTIC_RESULT");
  if (result.result_sha256 !== sha256V1(canonicalJsonV1(projection(result, "result_sha256"))) || result.reservation_sha256 !== reservation.reservation_sha256) {
    fail("DIAGNOSTIC_RESULT_MISMATCH", "Diagnostic result identity mismatched");
  }
  return { state: result.state, result_sha256: result.result_sha256, terminal_kind: result.terminal_kind, provider_failure_code: result.provider_failure_code, integration_failure_phase: result.integration_failure_phase, replay_permitted: false };
}

export function formatRc7GateCMatrixDiagnosticError(error) {
  return { ok: false, code: ERROR_CODE.test(error?.code ?? "") ? error.code : "UNEXPECTED_ERROR", message: error?.message ?? String(error) };
}

export const __test = Object.freeze({
  REFERENCE_RUN_ID,
  REFERENCE_SEMANTIC_BYTES,
  REFERENCE_SEMANTIC_SHA256,
  approvalText,
  sha256Bytes: sha256V1,
  validateClosedResult,
  validateFreezeShape,
});
