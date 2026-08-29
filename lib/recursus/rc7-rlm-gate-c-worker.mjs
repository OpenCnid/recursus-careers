import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { RC7_GATE_C_MAX_OUTPUT_BYTES, parseRc7GateCStructuredOutput } from "./rc7-rlm-gate-c-output-grammar.mjs";

export const RC7_GATE_C_WORKER_ID = "rc7-gate-c-credential-opaque-worker-v1";
export const RC7_GATE_C_WORKER_SCHEMA = "rc7-gate-c-worker-conformance-v1";
export const RC7_GATE_C_SEMANTIC_REQUEST_SCHEMA = "rc7-gate-c-semantic-request-v1";
export const RC7_GATE_C_SEALED_REQUEST_SCHEMA = "rc7-gate-c-sealed-worker-request-v1";
export const RC7_GATE_C_WORKER_TERMINAL = "WORKER_CONFORMANT_PROVIDER_UNREACHABLE";
export const RC7_GATE_C_WORKER_STAGE_SCHEMA = "rc7-gate-c-worker-stage-v1";
export const RC7_GATE_C_WORKER_STAGE_MANIFEST = "gate-c-worker-stage-manifest.json";
export const RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES = 32_768;
export const RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS = 8_192;
export const RC7_GATE_C_PROVIDER_TIMEOUT_MS = 120_000;

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const HASH = /^[0-9a-f]{64}$/u;
const SESSION = /^[0-9a-f]{32,64}$/u;
const PROVIDER_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token";
const MAX_REASONING_STREAM_BYTES = 1_048_576;
const PROVIDER_TERMINAL_FAILURE_CODES = new Set([
  "ABORTED",
  "AUTH",
  "CONTEXT_WINDOW_EXCEEDED",
  "EMPTY_RESPONSE",
  "INTEGRATION",
  "INVALID_REQUEST",
  "MALFORMED_RESPONSE",
  "PERMISSION",
  "RATE_LIMIT",
  "TIMEOUT",
  "UNAVAILABLE",
]);
export const RC7_GATE_C_INTEGRATION_FAILURE_PHASES = Object.freeze([
  "NO_NETWORK_POST_ADMITTED",
  "OAUTH_REFRESH_POST_ADMITTED_NO_PROVIDER_POST",
  "PROVIDER_POST_ADMITTED",
]);
const SMOKE_AUTHORITY_PROFILE = "safe01-direct-live-launch-smoke";
const SMOKE_BROKER_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-broker-v6";
const SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v6";
const SMOKE_RUN_ID = "c64d76145abe5b7dc8526e6bba97e88bedded2d548a0bebc8498e6d8de213b28";
const SMOKE_REFERENCE_MATRIX_RUN_ID = "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff";
const SMOKE_SOURCE_PACK_ID = "CAREER-BENCH-V1-SAFE-01-VISIBLE";
const SMOKE_SOURCE_PACK_SHA256 = "74b5520b80c94f14d283b68e69636b730607deca592361fca004f47e308ac74e";
const SMOKE_SEMANTIC_REQUEST_SHA256 = "bc7ae0845b8445b929e3a4a3fe7184dba7d6ead3e1f4fa633eefe2a5aaf69985";
const SMOKE_SEMANTIC_REQUEST_BYTE_COUNT = 5_075;
const PROTECTED_SEGMENTS = new Set([
  ".aws", ".azure", ".config", ".gnupg", ".kube", ".ssh", "credential", "credentials", "keychain", "secrets", "tokens", "wallet",
]);
const STAGE_SOURCE_PATHS = Object.freeze([
  "lib/recursus/prompt-context-v1.mjs",
  "lib/recursus/rc7-rlm-gate-c-broker.mjs",
  "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs",
  "lib/recursus/rc7-rlm-gate-c-output-grammar.mjs",
  "lib/recursus/rc7-rlm-gate-c-preregistration.mjs",
  "lib/recursus/rc7-rlm-qualification.mjs",
  "lib/recursus/rc7-rlm-gate-c-scorer.mjs",
  "lib/recursus/rc7-rlm-gate-c-worker.mjs",
]);

export const RC7_GATE_C_RUNTIME_CLOSURE = Object.freeze({
  identity: "rc7-gate-c-openai-codex-runtime-closure-v1",
  location_class: "caller-owned-disposable-external-runtime-profile",
  node: { minimum_version: "22.19.0", conformance_version: "24.19.0" },
  package_profile: {
    package_json: { byte_count: 1125, sha256: "0db22f9de1a35f8db9c23c4fe7dd34906634a667f446876fc1ea4ec09752353d" },
    pnpm_lock: { byte_count: 206121, sha256: "414047d61397cacb7968e10597e3408ad254bbaa3e1f37d71a007932bf10986d" },
    package_manager: "pnpm@11.19.0",
    frozen_offline_reinstall: "passed",
  },
  adapter: {
    package: "deepseek-openai-codex@0.1.0",
    revision: "2fc02090af1632b86ee1175a6720904dfd71081c",
    package_json_sha256: "607dd298d584546c6068cb4ad809810a2442e2118d9669d28bbccff70843cb08",
    built_index_sha256: "c124e8f8ccaa5c154a8f66811fcec89b29a71b734c0ccfce404a613318780cfb",
  },
  credentials: {
    package: "@deepseek-ai/dsh-credentials-local@0.1.0-rc.7",
    registry_integrity: "sha512-3HB4nHXzR3HreJE4MfVSX45Am1/JiKFSDOYmrnyX7kK3Hvb9qH1J2Mm4gCzNislCemhZ+wlYQgevrvyH1L1PvQ==",
    package_json_sha256: "5869682edbdd471e74ef5a3c2fda0b239a84f4d2436320c4b8edbb5f784ebffa",
    built_index_sha256: "2712e84ba906eb294e4afb62b0ebb73e23476825c130ad35f7cce1f37a4692ac",
    reference_placement: "compiled-live-capsule-constant-only",
  },
  dependencies: {
    cordis: { version: "4.0.1", package_json_sha256: "905ee8bf60012c7b87386466d89de3eb42eeb5dca5752f840efa4602d35bd609" },
    dsh_credentials: { version: "0.1.0-rc.7", package_json_sha256: "35514ad41871804c017875651ea550086e5cdb2158e415b4b50a28be30fee3bc" },
    dsh_llm: { version: "0.1.0-rc.7", package_json_sha256: "9c16418058e2a33de00b03c576bf26d6ea1624553a9aa2b9476888298b35e37b" },
    pi_ai: { version: "0.84.2", package_json_sha256: "9575365ce609dca8e1fd4fa72471d55006e1e0f81310c0808f93abc4bc14bbf9" },
  },
  installed_tree: {
    schema_version: "rc7-gate-c-installed-runtime-tree-v1",
    record_encoding: "concatenated-canonical-json-v1-record-lines",
    entry_count: 21_534,
    file_count: 17_369,
    directory_count: 2_840,
    link_count: 1_325,
    total_file_bytes: 106_004_588,
    records_sha256: "e2f8070ed558af1f60c648d43d0141d33a6fe16fb5489e0d782c879e9aa42d9d",
  },
});

export class Rc7GateCWorkerError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCWorkerError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7GateCWorkerError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_WORKER_INPUT", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("MALFORMED_WORKER_INPUT", `${label} keys mismatched`);
}

function digestProjection(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

function validateDigest(value, field, label) {
  if (!HASH.test(value?.[field] ?? "") || value[field] !== sha256V1(canonicalJsonV1(digestProjection(value, field)))) fail("IDENTITY_MISMATCH", `${label} digest mismatched`);
}

function positiveInteger(value, maximum, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail("MALFORMED_WORKER_INPUT", `${label} is malformed or over budget`);
}

function urlForbidden(text) {
  if (/(?:ftp:\/\/|file:\/\/|\\\\[^\\])/iu.test(text)) return true;
  const matches = text.match(/https?:\/\/[^\s"<>]+/giu) ?? [];
  return matches.some((raw) => {
    try {
      const value = new URL(raw.replace(/[),.;]+$/u, ""));
      return value.protocol !== "https:" || value.username.length > 0 || value.password.length > 0 || value.port.length > 0 || !value.hostname.endsWith(".test");
    } catch {
      return true;
    }
  });
}

export function buildRc7GateCSemanticRequest({ system_text: systemText, user_text: userText, session_id: sessionId }) {
  if (typeof systemText !== "string" || systemText.length === 0 || typeof userText !== "string" || userText.length === 0 || !SESSION.test(sessionId ?? "")) fail("MALFORMED_SEMANTIC_REQUEST", "Semantic prompt blocks or session identity are malformed");
  const value = {
    schema_version: RC7_GATE_C_SEMANTIC_REQUEST_SCHEMA,
    provider: "openai-codex",
    adapter: "deepseek-openai-codex",
    adapter_revision: RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision,
    model: "gpt-5.6-sol",
    configured_snapshot: "gpt-5.6-sol",
    reasoning_effort: "xhigh",
    system_text: systemText,
    user_text: userText,
    tools: [],
    max_output_plus_reasoning_tokens: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
    timeout_ms: RC7_GATE_C_PROVIDER_TIMEOUT_MS,
    automatic_retries: 0,
    transport: "sse",
    session_id: sessionId,
  };
  validateRc7GateCSemanticRequest(value);
  return value;
}

export function validateRc7GateCSemanticRequest(value) {
  exactKeys(value, [
    "schema_version", "provider", "adapter", "adapter_revision", "model", "configured_snapshot",
    "reasoning_effort", "system_text", "user_text", "tools", "max_output_plus_reasoning_tokens",
    "timeout_ms", "automatic_retries", "transport", "session_id",
  ], "semantic request");
  if (value.schema_version !== RC7_GATE_C_SEMANTIC_REQUEST_SCHEMA || value.provider !== "openai-codex"
    || value.adapter !== "deepseek-openai-codex" || value.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || value.model !== "gpt-5.6-sol" || value.configured_snapshot !== "gpt-5.6-sol" || value.reasoning_effort !== "xhigh"
    || typeof value.system_text !== "string" || value.system_text.length === 0 || typeof value.user_text !== "string" || value.user_text.length === 0
    || !Array.isArray(value.tools) || value.tools.length !== 0 || value.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS
    || value.timeout_ms !== RC7_GATE_C_PROVIDER_TIMEOUT_MS || value.automatic_retries !== 0 || value.transport !== "sse"
    || !SESSION.test(value.session_id ?? "")) fail("MALFORMED_SEMANTIC_REQUEST", "Semantic request identity or closed authority mismatched");
  if (urlForbidden(value.system_text) || urlForbidden(value.user_text)) fail("EXTERNAL_URL_DENIED", "Semantic request contains an external URL");
  const bytes = Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
  if (bytes.byteLength > RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES || bytes.includes(0)) fail("INPUT_BUDGET_EXCEEDED", "Semantic request byte ceiling exceeded");
  return { value, bytes, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
}

function expectedProviderWireBody(semantic) {
  return {
    model: semantic.model,
    store: false,
    stream: true,
    instructions: semantic.system_text,
    input: [{ role: "user", content: [{ type: "input_text", text: semantic.user_text }] }],
    text: { verbosity: "low" },
    include: ["reasoning.encrypted_content"],
    prompt_cache_key: semantic.session_id,
    tool_choice: "auto",
    parallel_tool_calls: true,
    reasoning: { effort: semantic.reasoning_effort, summary: "auto" },
    max_output_tokens: semantic.max_output_plus_reasoning_tokens,
  };
}

/**
 * Validate the final decoded provider wire body, immediately before native
 * fetch. This deliberately requires max_output_tokens on the wire; the
 * repository-owned live guard constructs and revalidates that exact final body
 * from the pinned adapter's narrower standard projection.
 */
export function validateRc7GateCProviderWireRequest(value, semanticValue) {
  const semantic = validateRc7GateCSemanticRequest(semanticValue).value;
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalJsonV1(value) !== canonicalJsonV1(expectedProviderWireBody(semantic))) {
    fail("PROVIDER_WIRE_CONTRACT_MISMATCH", "Provider wire body widened or mismatched the frozen semantic request");
  }
  return value;
}

/**
 * Close the pinned adapter's exact standard body and add the one field that
 * Pi 0.84.2 drops on that path. The returned value is then independently
 * validated as the complete provider wire request before native fetch.
 */
export function buildRc7GateCProviderWireRequest(adapterValue, semanticValue) {
  const semantic = validateRc7GateCSemanticRequest(semanticValue).value;
  const expected = expectedProviderWireBody(semantic);
  const pinnedAdapterBody = structuredClone(expected);
  delete pinnedAdapterBody.max_output_tokens;
  if (!adapterValue || typeof adapterValue !== "object" || Array.isArray(adapterValue)
    || canonicalJsonV1(adapterValue) !== canonicalJsonV1(pinnedAdapterBody)) {
    fail("ADAPTER_WIRE_PROJECTION_MISMATCH", "Pinned adapter body widened or mismatched before output-ceiling projection");
  }
  validateRc7GateCProviderWireRequest(expected, semantic);
  return expected;
}

function validateSmokeIntent(intent) {
  exactKeys(intent, [
    "schema_version", "authority_profile", "broker_identity", "permission_policy_identity", "smoke_registration_sha256",
    "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route", "matrix_member", "score_bearing",
    "route_visible_source_pack_id", "route_visible_source_pack_sha256", "request_kind", "child_sequence",
    "semantic_request_sha256", "semantic_request_byte_count", "provider", "adapter", "adapter_revision", "model",
    "configured_snapshot", "reasoning", "max_output_plus_reasoning_tokens", "provider_active_timeout_seconds",
    "automatic_retries", "reservation_consumed_before_provider_reachability", "activation_state", "intent_sha256",
  ], "smoke request intent");
  if (intent.schema_version !== "rc7-gate-c-smoke-request-intent-v6" || intent.authority_profile !== SMOKE_AUTHORITY_PROFILE
    || intent.broker_identity !== SMOKE_BROKER_ID || intent.permission_policy_identity !== SMOKE_PERMISSION_POLICY_ID
    || !HASH.test(intent.smoke_registration_sha256 ?? "") || intent.run_id !== SMOKE_RUN_ID
    || intent.reference_matrix_run_id !== SMOKE_REFERENCE_MATRIX_RUN_ID || intent.case_id !== "SAFE-01"
    || intent.arm !== "rc-direct" || intent.selected_route !== "rc-direct" || intent.matrix_member !== false
    || intent.score_bearing !== false || intent.route_visible_source_pack_id !== SMOKE_SOURCE_PACK_ID
    || intent.route_visible_source_pack_sha256 !== SMOKE_SOURCE_PACK_SHA256 || intent.request_kind !== "top-level"
    || intent.child_sequence !== 0 || intent.semantic_request_sha256 !== SMOKE_SEMANTIC_REQUEST_SHA256
    || intent.semantic_request_byte_count !== SMOKE_SEMANTIC_REQUEST_BYTE_COUNT || intent.provider !== "openai-codex"
    || intent.adapter !== "deepseek-openai-codex" || intent.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || intent.model !== "gpt-5.6-sol" || intent.configured_snapshot !== "gpt-5.6-sol" || intent.reasoning !== "xhigh"
    || intent.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS
    || intent.provider_active_timeout_seconds !== RC7_GATE_C_PROVIDER_TIMEOUT_MS / 1000 || intent.automatic_retries !== 0
    || intent.reservation_consumed_before_provider_reachability !== true
    || intent.activation_state !== "denied-awaiting-exact-smoke-activation") {
    fail("INTENT_IDENTITY_MISMATCH", "Smoke request intent authority mismatched");
  }
  validateDigest(intent, "intent_sha256", "smoke request intent");
  return intent;
}

function validateIntent(intent) {
  if (intent?.schema_version === "rc7-gate-c-smoke-request-intent-v6") return validateSmokeIntent(intent);
  exactKeys(intent, [
    "schema_version", "broker_identity", "permission_policy_identity", "preregistration_sha256", "run_id", "case_id",
    "arm", "selected_route", "repeat_index", "route_visible_source_pack_id", "route_visible_source_pack_sha256",
    "evaluator_contract_id", "evaluator_contract_sha256", "request_kind", "child_sequence", "semantic_request_sha256",
    "semantic_request_byte_count", "provider", "adapter", "adapter_revision", "model", "configured_snapshot", "reasoning",
    "max_output_plus_reasoning_tokens", "provider_active_timeout_seconds", "automatic_retries",
    "reservation_consumed_before_provider_reachability", "activation_state", "intent_sha256",
  ], "request intent");
  if (intent.schema_version !== "rc7-gate-c-request-intent-v2" || intent.broker_identity !== "rc7-gate-c-credential-opaque-sealed-request-broker-v2"
    || intent.permission_policy_identity !== "rc7-rlm-gate-c-docker-contained-brokered-ablation-v2" || !HASH.test(intent.preregistration_sha256 ?? "")
    || !HASH.test(intent.run_id ?? "") || !HASH.test(intent.semantic_request_sha256 ?? "") || intent.provider !== "openai-codex"
    || intent.adapter !== "deepseek-openai-codex" || intent.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || intent.model !== "gpt-5.6-sol" || intent.configured_snapshot !== "gpt-5.6-sol" || intent.reasoning !== "xhigh"
    || intent.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS
    || intent.provider_active_timeout_seconds !== RC7_GATE_C_PROVIDER_TIMEOUT_MS / 1000 || intent.automatic_retries !== 0
    || intent.reservation_consumed_before_provider_reachability !== true || intent.activation_state !== "denied-awaiting-exact-digest-bound-activation"
    || !["LAB-01", "PAPER-01", "REPO-01", "FACT-01", "FACT-03", "SAFE-01"].includes(intent.case_id)
    || !["rc-direct", "rc-rlm"].includes(intent.arm) || !["rc-direct", "rc-rlm"].includes(intent.selected_route)
    || typeof intent.route_visible_source_pack_id !== "string" || !HASH.test(intent.route_visible_source_pack_sha256 ?? "")
    || typeof intent.evaluator_contract_id !== "string" || !HASH.test(intent.evaluator_contract_sha256 ?? "")
    || !Number.isSafeInteger(intent.repeat_index) || intent.repeat_index < 1 || intent.repeat_index > 3
    || !["top-level", "recursive-child"].includes(intent.request_kind) || !Number.isSafeInteger(intent.child_sequence)
    || !Number.isSafeInteger(intent.semantic_request_byte_count) || intent.semantic_request_byte_count < 1
    || intent.semantic_request_byte_count > RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES) fail("INTENT_IDENTITY_MISMATCH", "Request intent authority mismatched");
  validateDigest(intent, "intent_sha256", "request intent");
  return intent;
}

function validateSmokePermit(permit, requiredState) {
  exactKeys(permit, [
    "schema_version", "authority_profile", "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256",
    "broker_module_sha256", "worker_package_sha256", "live_capsule_sha256", "worker_stage_manifest_sha256",
    "permission_policy_identity", "intent_sha256", "run_id", "request_kind", "child_sequence",
    "semantic_request_sha256", "semantic_request_byte_count", "dispatch_nonce", "state", "permit_sha256",
  ], "smoke dispatch permit");
  if (permit.schema_version !== "rc7-gate-c-smoke-dispatch-permit-v6" || permit.authority_profile !== SMOKE_AUTHORITY_PROFILE
    || permit.permission_policy_identity !== SMOKE_PERMISSION_POLICY_ID || !HASH.test(permit.activation_sha256 ?? "")
    || !HASH.test(permit.smoke_registration_sha256 ?? "") || !HASH.test(permit.smoke_module_sha256 ?? "")
    || !HASH.test(permit.broker_module_sha256 ?? "") || !HASH.test(permit.worker_package_sha256 ?? "")
    || !HASH.test(permit.live_capsule_sha256 ?? "") || !HASH.test(permit.worker_stage_manifest_sha256 ?? "")
    || !HASH.test(permit.intent_sha256 ?? "") || permit.run_id !== SMOKE_RUN_ID || permit.request_kind !== "top-level"
    || permit.child_sequence !== 0 || permit.semantic_request_sha256 !== SMOKE_SEMANTIC_REQUEST_SHA256
    || permit.semantic_request_byte_count !== SMOKE_SEMANTIC_REQUEST_BYTE_COUNT || !HASH.test(permit.dispatch_nonce ?? "")
    || permit.state !== requiredState) fail("PERMIT_IDENTITY_MISMATCH", "Smoke dispatch permit authority mismatched");
  validateDigest(permit, "permit_sha256", "smoke dispatch permit");
  return permit;
}

function validatePermit(permit, requiredState = "reserved-provider-reachable-once") {
  if (permit?.schema_version === "rc7-gate-c-smoke-dispatch-permit-v6") return validateSmokePermit(permit, requiredState);
  exactKeys(permit, [
    "schema_version", "activation_sha256", "preregistration_sha256", "broker_package_sha256", "worker_package_sha256",
    "scorer_contract_sha256", "intent_sha256", "run_id", "request_kind", "child_sequence", "semantic_request_sha256",
    "semantic_request_byte_count", "dispatch_nonce", "state", "permit_sha256",
  ], "dispatch permit");
  if (permit.schema_version !== "rc7-gate-c-dispatch-permit-v2" || !HASH.test(permit.activation_sha256 ?? "")
    || !HASH.test(permit.preregistration_sha256 ?? "") || !HASH.test(permit.broker_package_sha256 ?? "")
    || !HASH.test(permit.worker_package_sha256 ?? "") || !HASH.test(permit.scorer_contract_sha256 ?? "")
    || !HASH.test(permit.intent_sha256 ?? "") || !HASH.test(permit.run_id ?? "") || !HASH.test(permit.semantic_request_sha256 ?? "")
    || !HASH.test(permit.dispatch_nonce ?? "") || permit.state !== requiredState
    || !Number.isSafeInteger(permit.semantic_request_byte_count)) fail("PERMIT_IDENTITY_MISMATCH", "Dispatch permit authority mismatched");
  validateDigest(permit, "permit_sha256", "dispatch permit");
  return permit;
}

export function validateRc7GateCSealedWorkerRequest(value, expected, requiredPermitState = "reserved-provider-reachable-once") {
  if (value?.schema_version === "rc7-gate-c-smoke-sealed-worker-request-v6") {
    exactKeys(expected, [
      "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256", "broker_module_sha256",
      "worker_package_sha256", "live_capsule_sha256", "worker_stage_manifest_sha256", "permission_policy_identity",
    ], "smoke worker expected closure");
    for (const [key, item] of Object.entries(expected)) {
      if (key === "permission_policy_identity" ? item !== SMOKE_PERMISSION_POLICY_ID : !HASH.test(item)) {
        fail("IDENTITY_MISMATCH", "Smoke expected closure contains a malformed identity");
      }
    }
    exactKeys(value, [
      "schema_version", "authority_profile", "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256",
      "broker_module_sha256", "worker_package_sha256", "live_capsule_sha256", "worker_stage_manifest_sha256",
      "permission_policy_identity", "intent", "permit", "semantic_request", "semantic_request_sha256",
      "semantic_request_byte_count", "sealed_request_sha256",
    ], "smoke sealed worker request");
    if (value.authority_profile !== SMOKE_AUTHORITY_PROFILE) fail("SCHEMA_MISMATCH", "Smoke sealed worker request authority profile mismatched");
    for (const key of Object.keys(expected)) if (value[key] !== expected[key]) fail("IDENTITY_MISMATCH", `Smoke sealed worker request ${key} mismatched`);
    const intent = validateSmokeIntent(value.intent);
    if (!['reserved-provider-reachable-once', 'reserved-test-only-provider-unreachable'].includes(requiredPermitState)) fail("PERMIT_IDENTITY_MISMATCH", "Smoke sealed worker request permit state is not recognized");
    const permit = validateSmokePermit(value.permit, requiredPermitState);
    const semantic = validateRc7GateCSemanticRequest(value.semantic_request);
    if (value.semantic_request_sha256 !== semantic.sha256 || value.semantic_request_byte_count !== semantic.byte_count
      || semantic.sha256 !== SMOKE_SEMANTIC_REQUEST_SHA256 || semantic.byte_count !== SMOKE_SEMANTIC_REQUEST_BYTE_COUNT
      || intent.semantic_request_sha256 !== semantic.sha256 || intent.semantic_request_byte_count !== semantic.byte_count
      || permit.semantic_request_sha256 !== semantic.sha256 || permit.semantic_request_byte_count !== semantic.byte_count
      || permit.activation_sha256 !== value.activation_sha256 || permit.smoke_registration_sha256 !== value.smoke_registration_sha256
      || permit.smoke_module_sha256 !== value.smoke_module_sha256 || permit.broker_module_sha256 !== value.broker_module_sha256
      || permit.worker_package_sha256 !== value.worker_package_sha256 || permit.live_capsule_sha256 !== value.live_capsule_sha256
      || permit.worker_stage_manifest_sha256 !== value.worker_stage_manifest_sha256
      || permit.permission_policy_identity !== value.permission_policy_identity || permit.intent_sha256 !== intent.intent_sha256
      || permit.run_id !== intent.run_id || permit.request_kind !== intent.request_kind || permit.child_sequence !== intent.child_sequence
      || value.sealed_request_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "sealed_request_sha256")))) {
      fail("SEALED_REQUEST_MISMATCH", "Smoke sealed worker request identities do not close over one exact request");
    }
    return { value, intent, permit, semantic };
  }
  exactKeys(expected, ["activation_sha256", "broker_package_sha256", "preregistration_sha256", "scorer_contract_sha256", "worker_package_sha256"], "worker expected closure");
  for (const item of Object.values(expected)) if (!HASH.test(item)) fail("IDENTITY_MISMATCH", "Expected closure contains a malformed digest");
  exactKeys(value, [
    "schema_version", "activation_sha256", "preregistration_sha256", "broker_package_sha256", "worker_package_sha256",
    "scorer_contract_sha256", "intent", "permit", "semantic_request", "semantic_request_sha256",
    "semantic_request_byte_count", "sealed_request_sha256",
  ], "sealed worker request");
  if (value.schema_version !== RC7_GATE_C_SEALED_REQUEST_SCHEMA) fail("SCHEMA_MISMATCH", "Sealed worker request schema mismatched");
  for (const key of Object.keys(expected)) if (value[key] !== expected[key]) fail("IDENTITY_MISMATCH", `Sealed worker request ${key} mismatched`);
  const intent = validateIntent(value.intent);
  if (!["reserved-provider-reachable-once", "reserved-test-only-provider-unreachable"].includes(requiredPermitState)) fail("PERMIT_IDENTITY_MISMATCH", "Sealed worker request permit state is not a closed recognized state");
  const permit = validatePermit(value.permit, requiredPermitState);
  const semantic = validateRc7GateCSemanticRequest(value.semantic_request);
  if (value.semantic_request_sha256 !== semantic.sha256 || value.semantic_request_byte_count !== semantic.byte_count
    || intent.semantic_request_sha256 !== semantic.sha256 || intent.semantic_request_byte_count !== semantic.byte_count
    || permit.semantic_request_sha256 !== semantic.sha256 || permit.semantic_request_byte_count !== semantic.byte_count
    || permit.activation_sha256 !== value.activation_sha256 || permit.preregistration_sha256 !== value.preregistration_sha256
    || permit.broker_package_sha256 !== value.broker_package_sha256 || permit.worker_package_sha256 !== value.worker_package_sha256
    || permit.scorer_contract_sha256 !== value.scorer_contract_sha256 || permit.intent_sha256 !== intent.intent_sha256
    || permit.run_id !== intent.run_id || permit.request_kind !== intent.request_kind || permit.child_sequence !== intent.child_sequence
    || value.sealed_request_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "sealed_request_sha256")))) fail("SEALED_REQUEST_MISMATCH", "Sealed worker request identities do not close over one exact request");
  return { value, intent, permit, semantic };
}

export function decideRc7GateCFetch(input, counters = { provider_posts: 0, refresh_posts: 0 }) {
  exactKeys(input, ["body_present", "method", "redirect", "url"], "fetch decision input");
  exactKeys(counters, ["provider_posts", "refresh_posts"], "fetch counters");
  positiveInteger(counters.provider_posts, 1, "provider fetch count");
  positiveInteger(counters.refresh_posts, 1, "refresh fetch count");
  if (input.method !== "POST" || input.redirect !== "error" || input.body_present !== true || typeof input.url !== "string") fail("NETWORK_AUTHORITY_DENIED", "Only a non-redirecting POST with a body is permitted");
  let parsed;
  try { parsed = new URL(input.url); } catch { fail("NETWORK_AUTHORITY_DENIED", "Malformed URL denied"); }
  if (parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash || parsed.protocol !== "https:") fail("NETWORK_AUTHORITY_DENIED", "URL authority widening denied");
  if (parsed.href === PROVIDER_ENDPOINT) {
    if (counters.provider_posts !== 0) fail("PROVIDER_REQUEST_BUDGET_EXCEEDED", "Second provider POST denied");
    return { decision: "allow-provider-once", counters: { provider_posts: 1, refresh_posts: counters.refresh_posts } };
  }
  if (parsed.href === REFRESH_ENDPOINT) {
    if (counters.refresh_posts !== 0) fail("REFRESH_REQUEST_BUDGET_EXCEEDED", "Second OAuth refresh POST denied");
    return { decision: "allow-refresh-once", counters: { provider_posts: counters.provider_posts, refresh_posts: 1 } };
  }
  fail("NETWORK_AUTHORITY_DENIED", "Unregistered network destination denied");
}

/**
 * Classify only the local guarded-fetch admission phase for a sanitized
 * INTEGRATION terminal. This never claims remote receipt, response, or cause.
 */
export function classifyRc7GateCIntegrationFailurePhase(observations) {
  exactKeys(observations, ["automatic_retry_count", "provider_active_milliseconds", "provider_posts", "refresh_posts"], "integration failure observations");
  positiveInteger(observations.provider_posts, 1, "integration provider fetch count");
  positiveInteger(observations.refresh_posts, 1, "integration refresh fetch count");
  if (observations.automatic_retry_count !== 0 || !Number.isSafeInteger(observations.provider_active_milliseconds)
    || observations.provider_active_milliseconds < 0 || observations.provider_active_milliseconds > RC7_GATE_C_PROVIDER_TIMEOUT_MS) {
    fail("MALFORMED_WORKER_INPUT", "Integration failure observations are malformed or over budget");
  }
  if (observations.provider_posts === 1) return "PROVIDER_POST_ADMITTED";
  if (observations.refresh_posts === 1) return "OAUTH_REFRESH_POST_ADMITTED_NO_PROVIDER_POST";
  return "NO_NETWORK_POST_ADMITTED";
}

export function createRc7GateCStreamState() {
  return {
    schema_version: "rc7-gate-c-stream-reducer-state-v2",
    phase: "streaming",
    open_blocks: {},
    ended_indexes: [],
    text: "",
    text_utf8_bytes: 0,
    reasoning_utf8_bytes: 0,
    usage: null,
    terminal_kind: null,
    provider_failure_code: null,
    chunk_count: 0,
  };
}

function validateStreamState(state) {
  exactKeys(state, ["schema_version", "phase", "open_blocks", "ended_indexes", "text", "text_utf8_bytes", "reasoning_utf8_bytes", "usage", "terminal_kind", "provider_failure_code", "chunk_count"], "stream reducer state");
  if (state.schema_version !== "rc7-gate-c-stream-reducer-state-v2" || !["streaming", "usage-seen", "finished"].includes(state.phase)) fail("MALFORMED_STREAM", "Stream reducer state mismatched");
}

function validateTerminalReason(reason) {
  if (!reason || typeof reason !== "object" || Array.isArray(reason) || typeof reason.kind !== "string") fail("MALFORMED_STREAM", "Finish reason is malformed");
  if (["stop", "max-tokens", "tool-calls"].includes(reason.kind)) {
    exactKeys(reason, ["kind"], "finish reason");
    return { terminal_kind: reason.kind, provider_failure_code: null };
  }
  if (!["aborted", "error"].includes(reason.kind)) fail("MALFORMED_STREAM", "Finish reason is unknown");
  exactKeys(reason, ["failure", "kind"], "finish reason");
  if (!reason.failure || typeof reason.failure !== "object" || Array.isArray(reason.failure)) fail("MALFORMED_STREAM", "Finish failure is malformed");
  const failureKeys = Object.keys(reason.failure).sort();
  if (canonicalJsonV1(failureKeys) !== canonicalJsonV1(["code", "message"])
    && canonicalJsonV1(failureKeys) !== canonicalJsonV1(["code", "message", "requestId"])) fail("MALFORMED_STREAM", "Finish failure keys mismatched");
  if (!PROVIDER_TERMINAL_FAILURE_CODES.has(reason.failure.code) || typeof reason.failure.message !== "string"
    || reason.failure.message.length === 0 || Buffer.byteLength(reason.failure.message, "utf8") > 1_024
    || (reason.failure.requestId !== undefined && (typeof reason.failure.requestId !== "string" || reason.failure.requestId.length === 0
      || Buffer.byteLength(reason.failure.requestId, "utf8") > 256))) fail("MALFORMED_STREAM", "Finish failure is not one closed sanitized adapter failure");
  if (reason.kind === "aborted" && reason.failure.code !== "ABORTED") fail("MALFORMED_STREAM", "Aborted terminal and provider failure code differ");
  if (reason.kind === "error" && reason.failure.code === "ABORTED") fail("MALFORMED_STREAM", "Error terminal and provider failure code differ");
  return { terminal_kind: reason.kind, provider_failure_code: reason.failure.code };
}

function streamIndex(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 7) fail("MALFORMED_STREAM", "Stream block index is malformed");
  return String(value);
}

function boundedToken(value, maximum, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail("USAGE_BUDGET_EXCEEDED", `${label} is malformed or exceeds the frozen ceiling`);
  return value;
}

export function reduceRc7GateCStreamChunk(previous, chunk) {
  validateStreamState(previous);
  if (previous.phase === "finished") fail("MALFORMED_STREAM", "Chunk after finish denied");
  if (!chunk || typeof chunk !== "object" || Array.isArray(chunk) || typeof chunk.type !== "string") fail("MALFORMED_STREAM", "Stream chunk is malformed");
  const state = structuredClone(previous);
  state.chunk_count += 1;
  if (state.chunk_count > 65_536) fail("MALFORMED_STREAM", "Stream chunk ceiling exceeded");
  if (chunk.type === "block-start") {
    exactKeys(chunk, ["blockType", "index", "type"], "block-start chunk");
    const index = streamIndex(chunk.index);
    if (!['text', 'reasoning'].includes(chunk.blockType) || state.phase !== "streaming" || state.open_blocks[index] || state.ended_indexes.includes(chunk.index)) fail("MALFORMED_STREAM", "Block start ordering or type mismatched");
    state.open_blocks[index] = { block_type: chunk.blockType, accumulated: "" };
    return state;
  }
  if (chunk.type === "text-delta" || chunk.type === "reasoning-delta") {
    exactKeys(chunk, ["index", "text", "type"], `${chunk.type} chunk`);
    const index = streamIndex(chunk.index);
    const expected = chunk.type === "text-delta" ? "text" : "reasoning";
    if (state.phase !== "streaming" || state.open_blocks[index]?.block_type !== expected || typeof chunk.text !== "string") fail("MALFORMED_STREAM", "Delta ordering or type mismatched");
    state.open_blocks[index].accumulated += chunk.text;
    const byteCount = Buffer.byteLength(state.open_blocks[index].accumulated, "utf8");
    if (expected === "text" && state.text_utf8_bytes + byteCount > RC7_GATE_C_MAX_OUTPUT_BYTES) fail("OUTPUT_BUDGET_EXCEEDED", "Model output byte ceiling exceeded before persistence");
    if (expected === "reasoning" && state.reasoning_utf8_bytes + byteCount > MAX_REASONING_STREAM_BYTES) fail("OUTPUT_BUDGET_EXCEEDED", "Reasoning stream byte ceiling exceeded before discard");
    return state;
  }
  if (chunk.type === "block-end") {
    exactKeys(chunk, ["block", "index", "type"], "block-end chunk");
    const index = streamIndex(chunk.index);
    const open = state.open_blocks[index];
    if (state.phase !== "streaming" || !open || !chunk.block || chunk.block.type !== open.block_type || typeof chunk.block.text !== "string" || chunk.block.text !== open.accumulated) fail("MALFORMED_STREAM", "Block end does not match accumulated content");
    if (open.block_type === "text") {
      state.text += open.accumulated;
      state.text_utf8_bytes = Buffer.byteLength(state.text, "utf8");
      if (state.text_utf8_bytes > RC7_GATE_C_MAX_OUTPUT_BYTES) fail("OUTPUT_BUDGET_EXCEEDED", "Model output byte ceiling exceeded before persistence");
    } else {
      state.reasoning_utf8_bytes += Buffer.byteLength(open.accumulated, "utf8");
    }
    delete state.open_blocks[index];
    state.ended_indexes.push(chunk.index);
    return state;
  }
  if (chunk.type === "usage") {
    exactKeys(chunk, ["type", "usage"], "usage chunk");
    if (state.phase !== "streaming" || Object.keys(state.open_blocks).length !== 0 || state.usage !== null) fail("MALFORMED_STREAM", "Usage ordering mismatched");
    if (!chunk.usage || typeof chunk.usage !== "object" || Array.isArray(chunk.usage)) fail("MALFORMED_STREAM", "Usage is malformed");
    const keys = Object.keys(chunk.usage);
    if (!keys.includes("inputTokens") || !keys.includes("outputTokens") || keys.some((key) => !["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"].includes(key))) fail("MALFORMED_STREAM", "Usage keys mismatched");
    const usage = {
      input_tokens: boundedToken(chunk.usage.inputTokens, RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES, "input tokens"),
      output_tokens: boundedToken(chunk.usage.outputTokens, RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS, "output tokens"),
      cache_read_tokens: boundedToken(chunk.usage.cacheReadTokens ?? 0, RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES, "cache-read tokens"),
      cache_write_tokens: boundedToken(chunk.usage.cacheWriteTokens ?? 0, RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES, "cache-write tokens"),
      reasoning_tokens: chunk.usage.reasoningTokens === undefined ? null : boundedToken(chunk.usage.reasoningTokens, RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS, "reasoning tokens"),
    };
    if (usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens > RC7_GATE_C_MAX_SEMANTIC_REQUEST_BYTES) fail("USAGE_BUDGET_EXCEEDED", "Input, cache-read, and cache-write accounting exceeds the per-request input ceiling");
    if (usage.output_tokens + (usage.reasoning_tokens ?? 0) > RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS) fail("USAGE_BUDGET_EXCEEDED", "Visible output plus separately reported reasoning exceeds the per-request output-plus-reasoning ceiling");
    state.usage = usage;
    state.phase = "usage-seen";
    return state;
  }
  if (chunk.type === "finish") {
    const keys = Object.keys(chunk).sort();
    if (canonicalJsonV1(keys) !== canonicalJsonV1(["reason", "type"]) && canonicalJsonV1(keys) !== canonicalJsonV1(["reason", "replayState", "type"])) fail("MALFORMED_STREAM", "Finish keys mismatched");
    if (state.phase !== "usage-seen") fail("MALFORMED_STREAM", "Finish ordering mismatched");
    if (chunk.replayState !== undefined && Buffer.byteLength(canonicalJsonV1(chunk.replayState), "utf8") > RC7_GATE_C_MAX_OUTPUT_BYTES) fail("MALFORMED_STREAM", "Discarded replay state is oversized");
    const terminal = validateTerminalReason(chunk.reason);
    state.terminal_kind = terminal.terminal_kind;
    state.provider_failure_code = terminal.provider_failure_code;
    state.phase = "finished";
    return state;
  }
  fail("TOOL_OR_UNKNOWN_CHUNK_DENIED", "Tool or unknown stream chunk denied");
}

export function finalizeRc7GateCStream(state, expectedCaseId) {
  validateStreamState(state);
  if (state.phase !== "finished" || state.usage === null || Object.keys(state.open_blocks).length !== 0) fail("UNTRUSTED_TERMINAL", "Only one complete terminal can close a provider stream");
  if (state.terminal_kind !== "stop" || state.provider_failure_code !== null) fail("PROVIDER_TERMINAL_REJECTED", "A closed non-stop provider terminal cannot publish a route artifact", {
    terminal_kind: state.terminal_kind,
    provider_failure_code: state.provider_failure_code,
  });
  const raw = Buffer.from(state.text, "utf8");
  const parsed = parseRc7GateCStructuredOutput(raw, expectedCaseId);
  const artifact = {
    schema_version: "rc7-gate-c-route-output-artifact-v1",
    case_id: expectedCaseId,
    output_utf8_byte_count: raw.byteLength,
    output_sha256: parsed.normalized_sha256,
    output: parsed.value,
  };
  const usage = { schema_version: "rc7-gate-c-sanitized-usage-v1", ...state.usage };
  return {
    artifact,
    artifact_bytes: Buffer.from(`${canonicalJsonV1(artifact)}\n`, "utf8"),
    usage,
    usage_bytes: Buffer.from(`${canonicalJsonV1(usage)}\n`, "utf8"),
  };
}

export function buildRc7GateCSealedResult(input) {
  exactKeys(input, ["activation_sha256", "artifact_sha256", "authority_sha256", "cleanup_sha256", "dispatch_nonce", "intent_sha256", "permission_sha256", "permit_sha256", "provenance_sha256", "usage_sha256"], "sealed result input");
  for (const value of Object.values(input)) if (!HASH.test(value)) fail("IDENTITY_MISMATCH", "Sealed result input contains a malformed digest");
  const value = {
    schema_version: "rc7-gate-c-sealed-worker-result-v1",
    state: "trusted-sealed",
    ...input,
  };
  value.sealed_result_sha256 = sha256V1(canonicalJsonV1(value));
  return value;
}

function normalizedPath(target) {
  return process.platform === "win32" ? path.resolve(target).toLowerCase() : path.resolve(target);
}

function nestedOrSame(candidate, parent) {
  const relative = path.relative(normalizedPath(parent), normalizedPath(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function protectedPath(target) {
  return path.resolve(target).split(path.sep).some((segment) => PROTECTED_SEGMENTS.has(segment.toLowerCase()));
}

function exactSelfStagedContext(runtimeRoot, stageRoot, moduleRoot = REPOSITORY_ROOT) {
  return typeof runtimeRoot === "string" && typeof stageRoot === "string"
    && normalizedPath(stageRoot) === normalizedPath(moduleRoot)
    && normalizedPath(path.dirname(stageRoot)) === normalizedPath(runtimeRoot);
}

async function exactDirectory(target, label) {
  let stat;
  try { stat = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_STAGE_ROOT", `${label} does not exist`);
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("ALIASED_STAGE_ROOT", `${label} must be a physical directory`);
  const physical = await realpath(target);
  if (normalizedPath(physical) !== normalizedPath(target)) fail("ALIASED_STAGE_ROOT", `${label} must not be aliased`);
  return physical;
}

async function verifyExactFile(root, relativePath, expected, { allow_internal_ancestor_alias: allowInternalAncestorAlias = false } = {}) {
  const target = path.join(root, ...relativePath.split("/"));
  if (!nestedOrSame(target, root)) fail("RUNTIME_PROFILE_MISMATCH", "Runtime file escaped its root");
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} must be a physical file`);
  const physical = await realpath(target);
  if (allowInternalAncestorAlias) {
    if (!nestedOrSame(physical, root)) fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} resolved outside the runtime root`);
  } else if (normalizedPath(physical) !== normalizedPath(target)) {
    fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} must not traverse an aliased ancestor`);
  }
  const bytes = await readFile(target);
  if (expected.byte_count !== undefined && bytes.byteLength !== expected.byte_count) fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} byte count mismatched`);
  if (sha256V1(bytes) !== expected.sha256) fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} digest mismatched`);
  return bytes;
}

function runtimeRelativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function validateRuntimeLinkTarget(runtimeRoot, relativePath, physical) {
  const pnpmStore = path.join(runtimeRoot, "node_modules", ".pnpm");
  if (!nestedOrSame(physical, pnpmStore)) fail("RUNTIME_ALIAS_MISMATCH", `${relativePath} link escaped the exact internal pnpm store`);
  return runtimeRelativePath(runtimeRoot, physical);
}

async function collectRuntimeTree(runtimeRoot) {
  const recordsHash = createHash("sha256");
  let entryCount = 0;
  let fileCount = 0;
  let directoryCount = 0;
  let linkCount = 0;
  let totalFileBytes = 0;

  const addRecord = (record) => {
    recordsHash.update(canonicalJsonV1(record));
    entryCount += 1;
  };

  const visit = async (absolutePath, relativePath) => {
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      const physical = await realpath(absolutePath);
      addRecord({ path: relativePath, type: "link", target: validateRuntimeLinkTarget(runtimeRoot, relativePath, physical) });
      linkCount += 1;
      return;
    }
    const physical = await realpath(absolutePath);
    if (normalizedPath(physical) !== normalizedPath(absolutePath)) fail("RUNTIME_ALIAS_MISMATCH", `${relativePath} traversed an undeclared alias`);
    if (stat.isDirectory()) {
      addRecord({ path: relativePath, type: "directory" });
      directoryCount += 1;
      const names = (await readdir(absolutePath)).sort((left, right) => left.localeCompare(right, "en"));
      for (const name of names) {
        const childRelative = `${relativePath}/${name}`;
        await visit(path.join(absolutePath, name), childRelative);
      }
      return;
    }
    if (!stat.isFile()) fail("RUNTIME_PROFILE_MISMATCH", `${relativePath} is not a regular file, directory, or declared internal link`);
    const bytes = await readFile(absolutePath);
    addRecord({ path: relativePath, type: "file", byte_count: bytes.byteLength, sha256: sha256V1(bytes) });
    fileCount += 1;
    totalFileBytes += bytes.byteLength;
  };

  for (const relativePath of ["package.json", "pnpm-lock.yaml", "node_modules"]) {
    await visit(path.join(runtimeRoot, relativePath), relativePath);
  }
  return {
    schema_version: "rc7-gate-c-installed-runtime-tree-v1",
    record_encoding: "concatenated-canonical-json-v1-record-lines",
    entry_count: entryCount,
    file_count: fileCount,
    directory_count: directoryCount,
    link_count: linkCount,
    total_file_bytes: totalFileBytes,
    records_sha256: recordsHash.digest("hex"),
  };
}

async function validateRuntimeRoot(runtimeRoot, stageRoot) {
  const selfStaged = exactSelfStagedContext(runtimeRoot, stageRoot);
  if (typeof runtimeRoot !== "string" || !path.isAbsolute(runtimeRoot) || path.resolve(runtimeRoot) === path.parse(path.resolve(runtimeRoot)).root
    || protectedPath(runtimeRoot) || (!selfStaged && (nestedOrSame(runtimeRoot, REPOSITORY_ROOT) || nestedOrSame(REPOSITORY_ROOT, runtimeRoot)))
    || nestedOrSame(runtimeRoot, homedir()) || nestedOrSame(homedir(), runtimeRoot)) fail("UNSAFE_RUNTIME_ROOT", "Runtime root is broad, protected, repository-contained, or user-layer-contained");
  const root = await exactDirectory(runtimeRoot, "runtime root");
  const installedTree = await collectRuntimeTree(root);
  if (canonicalJsonV1(installedTree) !== canonicalJsonV1(RC7_GATE_C_RUNTIME_CLOSURE.installed_tree)) fail("RUNTIME_PROFILE_MISMATCH", "Installed executable and transitive lockfile closure mismatched");
  await Promise.all([
    verifyExactFile(root, "package.json", RC7_GATE_C_RUNTIME_CLOSURE.package_profile.package_json),
    verifyExactFile(root, "pnpm-lock.yaml", RC7_GATE_C_RUNTIME_CLOSURE.package_profile.pnpm_lock),
    verifyExactFile(root, "node_modules/deepseek-openai-codex/package.json", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.adapter.package_json_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/deepseek-openai-codex/lib/index.js", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.adapter.built_index_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/@deepseek-ai/dsh-credentials-local/package.json", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.credentials.package_json_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/@deepseek-ai/dsh-credentials-local/lib/index.js", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.credentials.built_index_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/@deepseek-ai/cordis/package.json", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.dependencies.cordis.package_json_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/@deepseek-ai/dsh-credentials/package.json", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.dependencies.dsh_credentials.package_json_sha256 }, { allow_internal_ancestor_alias: true }),
    verifyExactFile(root, "node_modules/@deepseek-ai/dsh-llm/package.json", { sha256: RC7_GATE_C_RUNTIME_CLOSURE.dependencies.dsh_llm.package_json_sha256 }, { allow_internal_ancestor_alias: true }),
  ]);
  return root;
}

async function validateStageRoot(runtimeRoot, stageRoot, requireEmpty) {
  const selfStaged = exactSelfStagedContext(runtimeRoot, stageRoot);
  if (typeof stageRoot !== "string" || !path.isAbsolute(stageRoot) || protectedPath(stageRoot)
    || (!selfStaged && nestedOrSame(stageRoot, REPOSITORY_ROOT)) || nestedOrSame(stageRoot, homedir())) fail("UNSAFE_STAGE_ROOT", "Stage root is protected, repository-contained, or user-layer-contained");
  const root = await exactDirectory(stageRoot, "stage root");
  if (normalizedPath(path.dirname(root)) !== normalizedPath(runtimeRoot)) fail("OVERLAPPING_STAGE_ROOT", "Stage root must be one exact direct child of the verified disposable runtime root");
  if (requireEmpty && (await readdir(root)).length !== 0) fail("NONEMPTY_STAGE_ROOT", "Stage root must start empty");
  return root;
}

function stageManifestProjection(value) {
  return digestProjection(value, "stage_manifest_sha256");
}

export async function buildRc7GateCWorkerStageManifest() {
  const files = [];
  for (const relativePath of STAGE_SOURCE_PATHS) {
    const bytes = await readFile(path.join(REPOSITORY_ROOT, ...relativePath.split("/")));
    files.push({ path: relativePath, byte_count: bytes.byteLength, sha256: sha256V1(bytes) });
  }
  const value = {
    schema_version: RC7_GATE_C_WORKER_STAGE_SCHEMA,
    state: "provider-free-staged-activation-denied",
    runtime_closure_sha256: sha256V1(canonicalJsonV1(RC7_GATE_C_RUNTIME_CLOSURE)),
    entrypoint: "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs",
    files,
    module_resolution: "stage root is one physical direct child of the exact disposable runtime root; bare imports resolve only through that parent runtime profile",
    execution_rule: "entrypoint import and live capsule execution remain denied until exact activation, one consumed dispatch, broker preflight, and the credential-opaque one-shot host policy are active; untrusted RLM Python remains separately confined by the Gate B-derived Docker network-none boundary",
    accounting: { provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0, live_capsule_imports: 0, network_actions: 0 },
    terminal_decision: RC7_GATE_C_WORKER_TERMINAL,
  };
  value.stage_manifest_sha256 = sha256V1(canonicalJsonV1(stageManifestProjection(value)));
  return value;
}

export function validateRc7GateCWorkerStageManifest(value) {
  exactKeys(value, [
    "accounting", "entrypoint", "execution_rule", "files", "module_resolution", "runtime_closure_sha256",
    "schema_version", "stage_manifest_sha256", "state", "terminal_decision",
  ], "worker stage manifest");
  if (value.schema_version !== RC7_GATE_C_WORKER_STAGE_SCHEMA || value.state !== "provider-free-staged-activation-denied"
    || value.entrypoint !== "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs" || canonicalJsonV1(value.files.map((item) => item.path)) !== canonicalJsonV1(STAGE_SOURCE_PATHS)
    || value.runtime_closure_sha256 !== sha256V1(canonicalJsonV1(RC7_GATE_C_RUNTIME_CLOSURE))
    || value.accounting.provider_calls !== 0 || value.accounting.simulated_provider_requests !== 0 || value.accounting.credential_accesses !== 0
    || value.accounting.live_capsule_imports !== 0 || value.accounting.network_actions !== 0
    || value.terminal_decision !== RC7_GATE_C_WORKER_TERMINAL
    || value.stage_manifest_sha256 !== sha256V1(canonicalJsonV1(stageManifestProjection(value)))) fail("WORKER_STAGE_MISMATCH", "Worker stage manifest widened or mismatched");
  return value;
}

export async function prepareRc7GateCWorkerStage({ runtime_root: runtimeRoot, stage_root: stageRoot }) {
  const runtime = await validateRuntimeRoot(runtimeRoot, null);
  const stage = await validateStageRoot(runtime, stageRoot, true);
  const manifest = await buildRc7GateCWorkerStageManifest();
  validateRc7GateCWorkerStageManifest(manifest);
  await mkdir(path.join(stage, "lib"));
  await mkdir(path.join(stage, "lib", "recursus"));
  for (const file of manifest.files) {
    const source = path.join(REPOSITORY_ROOT, ...file.path.split("/"));
    const target = path.join(stage, ...file.path.split("/"));
    const bytes = await readFile(source);
    if (bytes.byteLength !== file.byte_count || sha256V1(bytes) !== file.sha256) fail("WORKER_STAGE_MISMATCH", "Worker source changed during staging");
    await writeFile(target, bytes, { flag: "wx" });
  }
  await writeFile(path.join(stage, RC7_GATE_C_WORKER_STAGE_MANIFEST), Buffer.from(`${canonicalJsonV1(manifest)}\n`, "utf8"), { flag: "wx" });
  return { runtime_root: runtime, stage_root: stage, stage_manifest_sha256: manifest.stage_manifest_sha256, terminal_decision: manifest.terminal_decision, accounting: manifest.accounting };
}

export async function inspectRc7GateCWorkerStage({ runtime_root: runtimeRoot, stage_root: stageRoot }) {
  const runtime = await validateRuntimeRoot(runtimeRoot, stageRoot);
  const stage = await validateStageRoot(runtime, stageRoot, false);
  if (canonicalJsonV1((await readdir(stage)).sort()) !== canonicalJsonV1([RC7_GATE_C_WORKER_STAGE_MANIFEST, "lib"].sort())
    || canonicalJsonV1((await readdir(path.join(stage, "lib"))).sort()) !== canonicalJsonV1(["recursus"])
    || canonicalJsonV1((await readdir(path.join(stage, "lib", "recursus"))).sort()) !== canonicalJsonV1(STAGE_SOURCE_PATHS.map((item) => path.basename(item)).sort())) fail("WORKER_STAGE_RESIDUE", "Worker stage contains missing or extra entries");
  const bytes = await readFile(path.join(stage, RC7_GATE_C_WORKER_STAGE_MANIFEST));
  let manifest;
  try { manifest = JSON.parse(bytes.toString("utf8")); } catch { fail("WORKER_STAGE_MISMATCH", "Worker stage manifest is not JSON"); }
  validateRc7GateCWorkerStageManifest(manifest);
  if (!bytes.equals(Buffer.from(`${canonicalJsonV1(manifest)}\n`, "utf8"))) fail("WORKER_STAGE_MISMATCH", "Worker stage manifest is not canonical JSON");
  const expected = await buildRc7GateCWorkerStageManifest();
  if (canonicalJsonV1(manifest) !== canonicalJsonV1(expected)) fail("WORKER_STAGE_MISMATCH", "Worker stage is stale");
  for (const file of manifest.files) await verifyExactFile(stage, file.path, file);
  return { runtime_root: runtime, stage_root: stage, stage_manifest_sha256: manifest.stage_manifest_sha256, terminal_decision: manifest.terminal_decision, accounting: manifest.accounting };
}

export async function buildRc7GateCWorkerConformancePackage() {
  const moduleBytes = await readFile(MODULE_PATH);
  const capsulePath = path.join(path.dirname(MODULE_PATH), "rc7-rlm-gate-c-live-capsule.mjs");
  const capsuleBytes = await readFile(capsulePath);
  const workerStage = await buildRc7GateCWorkerStageManifest();
  const value = {
    schema_version: RC7_GATE_C_WORKER_SCHEMA,
    identity: RC7_GATE_C_WORKER_ID,
    state: "provider-free-conformed-activation-denied",
    module: { path: "lib/recursus/rc7-rlm-gate-c-worker.mjs", byte_count: moduleBytes.byteLength, sha256: sha256V1(moduleBytes) },
    live_capsule: { path: "lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", byte_count: capsuleBytes.byteLength, sha256: sha256V1(capsuleBytes), load_rule: "only after durable one-use dispatch consumption and exact preflight" },
    worker_stage: workerStage,
    runtime_closure: RC7_GATE_C_RUNTIME_CLOSURE,
    semantic_request: {
      projection: "standard adapter system slot plus exactly one user text message",
      historical_system_messages: 0,
      tools: 0,
      stop: "absent",
      temperature: "absent",
      max_output_plus_reasoning_tokens: RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS,
      timeout_ms: RC7_GATE_C_PROVIDER_TIMEOUT_MS,
      retries: 0,
      transport: "sse",
    },
    credential_boundary: {
      host_preflight_access: "denied",
      argv_input_output_path_or_value: "denied",
      compiled_reference_location: "live-capsule-only",
      adapter_runtime_resolve: "allowed-once-after-consumed-permit",
      adapter_runtime_refresh_set: "allowed-only-if-the-single-call-requires-refresh-and-the-provider-is-writable",
      list_describe_validate_login_logout_delete: "denied",
      availability_preflight: "intentionally-unknown",
    },
    network_boundary: {
      provider: { method: "POST", url: PROVIDER_ENDPOINT, ceiling: 1 },
      oauth_refresh: { method: "POST", url: REFRESH_ENDPOINT, ceiling: 1 },
      redirect: "error",
      all_other_fetch_authority: "denied-by-pinned-one-shot-capsule",
      host_os_egress_nonclaim: "the trusted provider capsule is not an OS sandbox and the JavaScript fetch gate is not a DNS or kernel boundary; the untrusted RLM Python process has no host network authority and remains in the separately inspected Docker network-none container",
    },
    artifacts: {
      raw_reasoning_retained: false,
      raw_provider_error_retained: false,
      replay_state_retained: false,
      maximum_route_output_utf8_bytes: RC7_GATE_C_MAX_OUTPUT_BYTES,
      terminal_rule: "exactly one closed terminal; no partial model artifact",
    },
    provider_free_fault_results: {
      categories: [
        "sealed-input-schema-and-identity", "semantic-request-byte-and-authority", "fetch-decision-url-method-and-count",
        "stream-order-and-block-lifecycle", "tool-chunk-denial", "usage-and-output-bounds", "canonical-output-validation",
        "deterministic-artifact-and-seal", "credential-path-and-operation-static-denial", "provider-free-import-surface",
      ],
      provider_calls: 0,
      simulated_provider_requests: 0,
      credential_accesses: 0,
    },
    accounting: {
      rlm_executions: 0,
      provider_calls: 0,
      simulated_provider_requests: 0,
      credential_accesses: 0,
      live_capsule_invocations: 0,
      network_or_live_browsing_actions: 0,
      external_mutations: 0,
    },
    terminal_decision: RC7_GATE_C_WORKER_TERMINAL,
    non_claims: [
      "no provider availability or response was tested",
      "no credential existence, source, readability, or refresh writability was inspected",
      "no JavaScript fetch guard is claimed as a standalone OS egress boundary",
      "no provider cost, subscription debit, separate reasoning usage, or live output quality is established",
    ],
  };
  value.worker_package_sha256 = sha256V1(canonicalJsonV1(value));
  return value;
}

export function validateRc7GateCWorkerConformancePackage(value) {
  exactKeys(value, [
    "schema_version", "identity", "state", "module", "live_capsule", "worker_stage", "runtime_closure", "semantic_request",
    "credential_boundary", "network_boundary", "artifacts", "provider_free_fault_results", "accounting",
    "terminal_decision", "non_claims", "worker_package_sha256",
  ], "worker conformance package");
  if (value.schema_version !== RC7_GATE_C_WORKER_SCHEMA || value.identity !== RC7_GATE_C_WORKER_ID
    || value.state !== "provider-free-conformed-activation-denied" || value.terminal_decision !== RC7_GATE_C_WORKER_TERMINAL
    || validateRc7GateCWorkerStageManifest(value.worker_stage) !== value.worker_stage
    || canonicalJsonV1(value.runtime_closure) !== canonicalJsonV1(RC7_GATE_C_RUNTIME_CLOSURE)
    || value.semantic_request.max_output_plus_reasoning_tokens !== RC7_GATE_C_MAX_OUTPUT_PLUS_REASONING_TOKENS
    || value.accounting.provider_calls !== 0 || value.accounting.simulated_provider_requests !== 0
    || value.accounting.credential_accesses !== 0 || value.accounting.live_capsule_invocations !== 0
    || value.worker_package_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "worker_package_sha256")))) fail("WORKER_CONFORMANCE_MISMATCH", "Worker conformance package widened or mismatched");
  return value;
}

export const __test = Object.freeze({
  REPOSITORY_ROOT,
  MODULE_PATH,
  PROVIDER_ENDPOINT,
  REFRESH_ENDPOINT,
  MAX_REASONING_STREAM_BYTES,
  digestProjection,
  expectedProviderWireBody,
  collectRuntimeTree,
  exactSelfStagedContext,
  validateRuntimeLinkTarget,
});
