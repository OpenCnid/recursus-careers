import { closeSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { constants as zlibConstants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

import {
  RC7_GATE_C_PROVIDER_TIMEOUT_MS,
  buildRc7GateCProviderWireRequest,
  buildRc7GateCSealedResult,
  classifyRc7GateCIntegrationFailurePhase,
  createRc7GateCStreamState,
  decideRc7GateCFetch,
  finalizeRc7GateCStream,
  inspectRc7GateCWorkerStage,
  reduceRc7GateCStreamChunk,
  validateRc7GateCSealedWorkerRequest,
  validateRc7GateCProviderWireRequest,
} from "./rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

const HASH = /^[0-9a-f]{64}$/u;
const CREDENTIAL_REFERENCE = "OPENAI_CODEX_OAUTH";
const MODULE_PATH = fileURLToPath(import.meta.url);
const STAGE_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const RUNTIME_ROOT = path.dirname(STAGE_ROOT);
const MAX_PROVIDER_WIRE_BYTES = 262_144;
const SMOKE_AUTHORITY_PROFILE = "safe01-direct-live-launch-smoke";
const SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v6";
const SMOKE_RUN_ID = "c64d76145abe5b7dc8526e6bba97e88bedded2d548a0bebc8498e6d8de213b28";
const SMOKE_REFERENCE_MATRIX_RUN_ID = "3c1216d5f6a5d60f2b187e0809532ae4e79991a804e71ea82eaad621cfb078ff";
const SMOKE_SEMANTIC_REQUEST_SHA256 = "bc7ae0845b8445b929e3a4a3fe7184dba7d6ead3e1f4fa633eefe2a5aaf69985";
const PROXY_VARIABLES = Object.freeze([
  "ALL_PROXY", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
  "all_proxy", "https_proxy", "http_proxy", "no_proxy",
]);
let liveCapsuleStarted = false;
let acceptedHostHandoff = null;

function fail(code) {
  const error = new Error(code);
  error.name = "Rc7GateCLiveCapsuleError";
  error.code = code;
  throw error;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`MALFORMED_${label.toUpperCase().replaceAll(" ", "_")}`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail(`MALFORMED_${label.toUpperCase().replaceAll(" ", "_")}`);
}

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === "string") return input.url;
  fail("NETWORK_AUTHORITY_DENIED");
}

function selectedBody(input, init) {
  return Object.hasOwn(init, "body") ? init.body : input?.body;
}

function selectedHeader(input, init, expectedName) {
  const headers = Object.hasOwn(init, "headers") ? init.headers : input?.headers;
  if (headers === undefined || headers === null) return null;
  if (typeof headers.get === "function") return headers.get(expectedName);
  if (Array.isArray(headers)) {
    const match = headers.find(([name]) => String(name).toLowerCase() === expectedName);
    return match === undefined ? null : String(match[1]);
  }
  if (typeof headers === "object") {
    const key = Object.keys(headers).find((name) => name.toLowerCase() === expectedName);
    return key === undefined ? null : String(headers[key]);
  }
  fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
}

function decodedProviderWire(input, init) {
  const body = selectedBody(input, init);
  let raw;
  if (typeof body === "string") raw = Buffer.from(body, "utf8");
  else if (body instanceof ArrayBuffer) raw = Buffer.from(body);
  else if (ArrayBuffer.isView(body)) raw = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  else fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  if (raw.byteLength === 0 || raw.byteLength > MAX_PROVIDER_WIRE_BYTES) fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  const contentEncoding = selectedHeader(input, init, "content-encoding");
  if (contentEncoding === null || contentEncoding === "identity") return { bytes: raw, content_encoding: "identity" };
  if (contentEncoding !== "zstd") fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  try {
    return { bytes: zstdDecompressSync(raw, { maxOutputLength: MAX_PROVIDER_WIRE_BYTES }), content_encoding: "zstd" };
  } catch {
    fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  }
}

function buildProviderBody(input, init, semantic) {
  if (selectedHeader(input, init, "content-length") !== null) fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  const decoded = decodedProviderWire(input, init);
  const { bytes } = decoded;
  if (bytes.byteLength > MAX_PROVIDER_WIRE_BYTES || bytes.includes(0)) fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("PROVIDER_WIRE_CONTRACT_MISMATCH"); }
  const projected = buildRc7GateCProviderWireRequest(value, semantic);
  validateRc7GateCProviderWireRequest(projected, semantic);
  const projectedBytes = Buffer.from(canonicalJsonV1(projected), "utf8");
  if (projectedBytes.byteLength > MAX_PROVIDER_WIRE_BYTES) fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  if (decoded.content_encoding === "identity") return projectedBytes;
  const compressed = zstdCompressSync(projectedBytes, {
    params: { [zlibConstants.ZSTD_c_compressionLevel]: 3 },
  });
  if (compressed.byteLength > MAX_PROVIDER_WIRE_BYTES) fail("PROVIDER_WIRE_CONTRACT_MISMATCH");
  return compressed;
}

function installSingleUseFetchGuard(semantic) {
  const nativeFetch = globalThis.fetch;
  if (typeof nativeFetch !== "function") fail("FETCH_UNAVAILABLE");
  let counters = { provider_posts: 0, refresh_posts: 0 };
  let enabled = true;
  const guarded = async (input, init = {}) => {
    if (!enabled) fail("LIVE_CAPSULE_PROCESS_REUSE_DENIED");
    const method = String(init.method ?? input?.method ?? "GET").toUpperCase();
    const bodyPresent = selectedBody(input, init) !== null && selectedBody(input, init) !== undefined;
    const decision = decideRc7GateCFetch({ url: requestUrl(input), method, redirect: "error", body_present: bodyPresent }, counters);
    const forwardedBody = decision.decision === "allow-provider-once" ? buildProviderBody(input, init, semantic) : selectedBody(input, init);
    counters = decision.counters;
    return nativeFetch(input, { ...init, method, redirect: "error", body: forwardedBody });
  };
  Object.defineProperty(globalThis, "fetch", { value: guarded, configurable: false, enumerable: true, writable: false });
  return Object.freeze({
    snapshot: () => ({ ...counters }),
    disable: () => { enabled = false; },
  });
}

function scrubProxyAuthority() {
  for (const name of PROXY_VARIABLES) delete process.env[name];
}

function closedFailure(error, authorityProfile = null, observations = null) {
  const workerCode = typeof error?.code === "string" && /^[A-Z][A-Z0-9_-]{1,63}$/u.test(error.code) ? error.code : "LIVE_CAPSULE_FAILED";
  if (authorityProfile === SMOKE_AUTHORITY_PROFILE) {
    const terminalKind = workerCode === "PROVIDER_TERMINAL_REJECTED" && ["aborted", "error", "max-tokens", "tool-calls"].includes(error?.details?.terminal_kind)
      ? error.details.terminal_kind : null;
    const providerFailureCode = workerCode === "PROVIDER_TERMINAL_REJECTED" && typeof error?.details?.provider_failure_code === "string"
      && /^[A-Z][A-Z0-9_]{1,63}$/u.test(error.details.provider_failure_code) ? error.details.provider_failure_code : null;
    const integrationFailurePhase = providerFailureCode === "INTEGRATION" && observations !== null
      ? classifyRc7GateCIntegrationFailurePhase(observations) : null;
    return {
      schema_version: "rc7-gate-c-live-capsule-failure-v4",
      state: "failed-no-replay",
      code: workerCode,
      terminal_kind: terminalKind,
      provider_failure_code: providerFailureCode,
      integration_failure_phase: integrationFailurePhase,
    };
  }
  return { schema_version: "rc7-gate-c-live-capsule-failure-v1", state: "failed-no-replay", code: workerCode };
}

function closedFailureResultFromValidatedPreflight(error, preflight, observations) {
  return {
    ...closedFailure(error, preflight?.value?.authority_profile ?? null, observations),
    observations,
  };
}

function finalizeStreamBeforeSuccessPostcondition(stream, expectedCaseId, fetchGuard) {
  const finalized = finalizeRc7GateCStream(stream, expectedCaseId);
  const counts = fetchGuard.snapshot();
  if (counts.provider_posts !== 1 || counts.refresh_posts > 1) fail("PROVIDER_DISPATCH_COUNT_MISMATCH");
  return { finalized, counts };
}

function digestProjection(value, key) {
  const projection = { ...value };
  delete projection[key];
  return projection;
}

function exactFdJson(fd, label, maximum = 1_048_576) {
  let bytes;
  try { bytes = readFileSync(fd); } catch { fail(`${label}_READ_FAILED`); }
  try { closeSync(fd); } catch {}
  if (bytes.byteLength < 3 || bytes.byteLength > maximum || bytes[bytes.byteLength - 1] !== 0x0a) fail(`${label}_MALFORMED`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(`${label}_MALFORMED`); }
  if (!bytes.equals(Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8"))) fail(`${label}_NONCANONICAL`);
  return value;
}

function writeFdJson(fd, value, label) {
  try { writeFileSync(fd, `${canonicalJsonV1(value)}\n`, { encoding: "utf8" }); } catch { fail(`${label}_WRITE_FAILED`); }
  try { closeSync(fd); } catch {}
}

function validateDispatch(value) {
  if (value?.schema_version === "rc7-gate-c-smoke-dispatch-checkpoint-v6") {
    exactKeys(value, [
      "schema_version", "authority_profile", "activation_sha256", "permission_policy_identity", "intent_sha256",
      "permit_sha256", "dispatch_nonce", "run_id", "reference_matrix_run_id", "case_id", "arm", "selected_route",
      "matrix_member", "score_bearing", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key",
      "reservation_ordinal", "state", "dispatch_sha256",
    ], "smoke host dispatch");
    if (value.authority_profile !== SMOKE_AUTHORITY_PROFILE || value.permission_policy_identity !== SMOKE_PERMISSION_POLICY_ID
      || value.state !== "consumed-provider-reachable-handoff-started" || !HASH.test(value.activation_sha256 ?? "")
      || !HASH.test(value.intent_sha256 ?? "") || !HASH.test(value.permit_sha256 ?? "") || !HASH.test(value.dispatch_nonce ?? "")
      || value.run_id !== SMOKE_RUN_ID || value.reference_matrix_run_id !== SMOKE_REFERENCE_MATRIX_RUN_ID
      || value.case_id !== "SAFE-01" || value.arm !== "rc-direct" || value.selected_route !== "rc-direct"
      || value.matrix_member !== false || value.score_bearing !== false || value.request_kind !== "top-level"
      || value.child_sequence !== 0 || value.semantic_request_sha256 !== SMOKE_SEMANTIC_REQUEST_SHA256
      || !HASH.test(value.reservation_key ?? "") || value.reservation_ordinal !== 1
      || value.dispatch_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "dispatch_sha256")))) fail("HOST_DISPATCH_MISMATCH");
    return value;
  }
  exactKeys(value, [
    "schema_version", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "case_id",
    "arm", "selected_route", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key",
    "reservation_ordinal", "state", "dispatch_sha256",
  ], "host dispatch");
  if (value.schema_version !== "rc7-gate-c-dispatch-checkpoint-v2" || value.state !== "consumed-provider-reachable-handoff-started"
    || !HASH.test(value.activation_sha256 ?? "") || !HASH.test(value.intent_sha256 ?? "") || !HASH.test(value.permit_sha256 ?? "")
    || !HASH.test(value.dispatch_nonce ?? "") || !HASH.test(value.run_id ?? "") || !HASH.test(value.semantic_request_sha256 ?? "")
    || !HASH.test(value.reservation_key ?? "") || !Number.isSafeInteger(value.reservation_ordinal)
    || value.reservation_ordinal < 1 || value.reservation_ordinal > 72 || !["rc-direct", "rc-rlm"].includes(value.arm)
    || !["rc-direct", "rc-rlm"].includes(value.selected_route) || !["top-level", "recursive-child"].includes(value.request_kind)
    || !Number.isSafeInteger(value.child_sequence)
    || value.dispatch_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "dispatch_sha256")))) fail("HOST_DISPATCH_MISMATCH");
  return value;
}

function validateWireContract(value, sealed) {
  exactKeys(value, [
    "schema_version", "provider_endpoint", "refresh_endpoint", "provider", "adapter", "adapter_revision", "model",
    "configured_snapshot", "reasoning", "max_output_plus_reasoning_tokens", "provider_active_timeout_seconds",
    "automatic_retries", "generation_https_posts", "oauth_refresh_https_posts", "all_other_network",
  ], "host wire contract");
  const intent = sealed.intent;
  if (value.schema_version !== "rc7-gate-c-exact-wire-contract-v1" || value.provider_endpoint !== "https://chatgpt.com/backend-api/codex/responses"
    || value.refresh_endpoint !== "https://auth.openai.com/oauth/token" || value.provider !== intent.provider
    || value.adapter !== intent.adapter || value.adapter_revision !== intent.adapter_revision || value.model !== intent.model
    || value.configured_snapshot !== intent.configured_snapshot || value.reasoning !== intent.reasoning
    || value.max_output_plus_reasoning_tokens !== intent.max_output_plus_reasoning_tokens
    || value.provider_active_timeout_seconds !== intent.provider_active_timeout_seconds || value.automatic_retries !== 0
    || value.generation_https_posts !== 1 || value.oauth_refresh_https_posts !== 1 || value.all_other_network !== "denied") fail("HOST_WIRE_CONTRACT_MISMATCH");
  return value;
}

function validateGateB(value, dispatch) {
  if (dispatch.schema_version === "rc7-gate-c-smoke-dispatch-checkpoint-v6") {
    exactKeys(value, [
      "schema_version", "authority_profile", "state", "selected_route", "activation_sha256", "intent_sha256",
      "dispatch_sha256", "container_id", "image_id", "docker_executable_sha256", "outer_seccomp_inspect_sha256",
      "network", "direct_container_provider_access", "input_mount_sha256", "launcher_parent_intent_sha256",
      "launcher_parent_dispatch_sha256", "launcher_parent_semantic_request_sha256", "phase_two_tsync_proven",
    ], "smoke host Gate B evidence");
    if (value.schema_version !== "rc7-gate-c-smoke-broker-derived-gate-b-evidence-v6"
      || value.authority_profile !== SMOKE_AUTHORITY_PROFILE || value.state !== "not-applicable-direct-route"
      || value.selected_route !== "rc-direct" || value.activation_sha256 !== dispatch.activation_sha256
      || value.intent_sha256 !== dispatch.intent_sha256 || value.dispatch_sha256 !== dispatch.dispatch_sha256
      || value.container_id !== null || value.image_id !== null || value.docker_executable_sha256 !== null
      || value.outer_seccomp_inspect_sha256 !== null || value.network !== "not-applicable-no-container"
      || value.direct_container_provider_access !== "not-applicable-no-container" || value.input_mount_sha256 !== null
      || value.launcher_parent_intent_sha256 !== null || value.launcher_parent_dispatch_sha256 !== null
      || value.launcher_parent_semantic_request_sha256 !== null || value.phase_two_tsync_proven !== false) fail("HOST_GATE_B_MISMATCH");
    return value;
  }
  exactKeys(value, [
    "schema_version", "state", "selected_route", "activation_sha256", "intent_sha256", "dispatch_sha256",
    "container_id", "image_id", "docker_executable_sha256", "outer_seccomp_inspect_sha256", "network",
    "direct_container_provider_access", "input_mount_sha256", "launcher_parent_intent_sha256",
    "launcher_parent_dispatch_sha256", "launcher_parent_semantic_request_sha256", "phase_two_tsync_proven",
  ], "host Gate B evidence");
  if (value.schema_version !== "rc7-gate-c-broker-derived-gate-b-evidence-v1" || value.selected_route !== dispatch.selected_route
    || value.activation_sha256 !== dispatch.activation_sha256 || value.intent_sha256 !== dispatch.intent_sha256
    || value.dispatch_sha256 !== dispatch.dispatch_sha256 || value.phase_two_tsync_proven !== false) fail("HOST_GATE_B_MISMATCH");
  if (dispatch.request_kind === "top-level") {
    const expectedState = dispatch.selected_route === "rc-direct" ? "not-applicable-direct-route" : "not-applicable-top-level-host-provider";
    if (value.state !== expectedState || value.container_id !== null || value.image_id !== null
      || value.docker_executable_sha256 !== null || value.outer_seccomp_inspect_sha256 !== null
      || value.network !== "not-applicable-no-container" || value.direct_container_provider_access !== "not-applicable-no-container"
      || value.input_mount_sha256 !== null || value.launcher_parent_intent_sha256 !== null
      || value.launcher_parent_dispatch_sha256 !== null || value.launcher_parent_semantic_request_sha256 !== null) fail("HOST_GATE_B_MISMATCH");
  } else if (value.state !== "broker-verified-live-rlm-container" || !HASH.test(value.container_id ?? "")
    || !/^sha256:[0-9a-f]{64}$/u.test(value.image_id ?? "") || !HASH.test(value.docker_executable_sha256 ?? "")
    || !HASH.test(value.outer_seccomp_inspect_sha256 ?? "") || value.network !== "none"
    || value.direct_container_provider_access !== "denied-network-none" || !HASH.test(value.input_mount_sha256 ?? "")
    || !HASH.test(value.launcher_parent_intent_sha256 ?? "") || !HASH.test(value.launcher_parent_dispatch_sha256 ?? "")
    || value.launcher_parent_semantic_request_sha256 !== value.input_mount_sha256) fail("HOST_GATE_B_MISMATCH");
  return value;
}

function validateBrokerResult(value) {
  exactKeys(value, ["sealed", "dispatch", "durable_handoff", "expected_closure", "wire_contract", "gate_b"], "host broker result");
  if (value.sealed?.schema_version === "rc7-gate-c-smoke-sealed-worker-request-v6") {
    exactKeys(value.expected_closure, [
      "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256", "broker_module_sha256",
      "worker_package_sha256", "live_capsule_sha256", "worker_stage_manifest_sha256", "permission_policy_identity",
    ], "smoke host expected closure");
  } else {
    exactKeys(value.expected_closure, ["activation_sha256", "broker_package_sha256", "preregistration_sha256", "scorer_contract_sha256", "worker_package_sha256"], "host expected closure");
  }
  const sealed = validateRc7GateCSealedWorkerRequest(value.sealed, value.expected_closure);
  const dispatch = validateDispatch(value.dispatch);
  if (dispatch.schema_version === "rc7-gate-c-smoke-dispatch-checkpoint-v6") {
    exactKeys(value.durable_handoff, [
      "schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key",
      "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256",
    ], "smoke durable provider handoff");
  } else {
    exactKeys(value.durable_handoff, [
      "activation_sha256", "dispatch_sha256", "durable_handoff_sha256", "gate_b_attestation_sha256", "handoff_nonce",
      "reservation_key", "schema_version", "sealed_request_sha256", "state",
    ], "durable provider handoff");
  }
  if (dispatch.activation_sha256 !== sealed.value.activation_sha256 || dispatch.intent_sha256 !== sealed.intent.intent_sha256
    || dispatch.permit_sha256 !== sealed.permit.permit_sha256 || dispatch.dispatch_nonce !== sealed.permit.dispatch_nonce
    || dispatch.run_id !== sealed.intent.run_id || dispatch.case_id !== sealed.intent.case_id || dispatch.arm !== sealed.intent.arm
    || dispatch.selected_route !== sealed.intent.selected_route || dispatch.request_kind !== sealed.intent.request_kind
    || dispatch.child_sequence !== sealed.intent.child_sequence || dispatch.semantic_request_sha256 !== sealed.semantic.sha256
    || value.durable_handoff.schema_version !== (dispatch.schema_version === "rc7-gate-c-smoke-dispatch-checkpoint-v6" ? "rc7-gate-c-smoke-durable-provider-handoff-v6" : "rc7-gate-c-durable-provider-handoff-v1")
    || value.durable_handoff.state !== "preflight-consumed-provider-reachability-committed"
    || (dispatch.schema_version === "rc7-gate-c-smoke-dispatch-checkpoint-v6" && value.durable_handoff.authority_profile !== SMOKE_AUTHORITY_PROFILE)
    || value.durable_handoff.activation_sha256 !== dispatch.activation_sha256
    || value.durable_handoff.dispatch_sha256 !== dispatch.dispatch_sha256
    || value.durable_handoff.reservation_key !== dispatch.reservation_key
    || value.durable_handoff.sealed_request_sha256 !== sealed.value.sealed_request_sha256
    || value.durable_handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value.durable_handoff, "durable_handoff_sha256")))) fail("HOST_BROKER_RESULT_MISMATCH");
  const wire = validateWireContract(value.wire_contract, sealed);
  const gateB = validateGateB(value.gate_b, dispatch);
  return { value, sealed, dispatch, wire, gateB };
}

function validateHostHandoff(value) {
  exactKeys(value, ["schema_version", "state", "nonce", "broker_result", "handoff_sha256"], "host handoff");
  if (value.schema_version !== "rc7-gate-c-host-handoff-v1" || value.state !== "host-preflight-complete-one-use"
    || !HASH.test(value.nonce ?? "") || value.handoff_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "handoff_sha256")))) fail("HOST_HANDOFF_MISMATCH");
  return { value, broker: validateBrokerResult(value.broker_result) };
}

function validateHostCommit(value, accepted) {
  exactKeys(value, ["schema_version", "state", "nonce", "handoff_sha256", "ack_sha256", "commit_sha256"], "host handoff commit");
  if (value.schema_version !== "rc7-gate-c-host-handoff-commit-v1" || value.state !== "host-ack-validated-execute-once"
    || value.nonce !== accepted.handoff.value.nonce || value.handoff_sha256 !== accepted.handoff.value.handoff_sha256
    || value.ack_sha256 !== accepted.ack.ack_sha256
    || value.commit_sha256 !== sha256V1(canonicalJsonV1(digestProjection(value, "commit_sha256")))) fail("HOST_HANDOFF_COMMIT_MISMATCH");
  return value;
}

async function acceptHostHandoffWithIo(io, trust) {
  exactKeys(io, ["read_commit", "read_handoff", "write_ack"], "host handoff io");
  exactKeys(trust, ["capsule_sha256", "stage_manifest_sha256"], "host handoff trust");
  if (!HASH.test(trust.capsule_sha256 ?? "") || !HASH.test(trust.stage_manifest_sha256 ?? "")) fail("HOST_HANDOFF_TRUST_MISMATCH");
  const handoff = validateHostHandoff(await io.read_handoff());
  const ack = {
    schema_version: "rc7-gate-c-host-handoff-ack-v1", state: "accepted-before-credential-or-provider-authority",
    nonce: handoff.value.nonce, handoff_sha256: handoff.value.handoff_sha256,
    dispatch_sha256: handoff.broker.dispatch.dispatch_sha256, stage_manifest_sha256: trust.stage_manifest_sha256,
    capsule_sha256: trust.capsule_sha256,
  };
  ack.ack_sha256 = sha256V1(canonicalJsonV1(ack));
  await io.write_ack(ack);
  const commit = validateHostCommit(await io.read_commit(), { handoff, ack });
  return Object.freeze({ handoff, ack, commit, stage: { stage_manifest_sha256: trust.stage_manifest_sha256 }, capsule_sha256: trust.capsule_sha256 });
}

/**
 * Accept one host-owned broker preflight through anonymous pipes 3/4/5. This
 * function validates and commits authority, but never imports credentials or a
 * provider adapter. It is safe for provider-free conformance subprocesses.
 */
export async function acceptRc7GateCHostHandoff() {
  if (liveCapsuleStarted || acceptedHostHandoff !== null) fail("LIVE_CAPSULE_PROCESS_REUSE_DENIED");
  liveCapsuleStarted = true;
  const stage = await inspectRc7GateCWorkerStage({ runtime_root: RUNTIME_ROOT, stage_root: STAGE_ROOT });
  const capsuleSha256 = sha256V1(readFileSync(MODULE_PATH));
  acceptedHostHandoff = await acceptHostHandoffWithIo({
    read_handoff: () => exactFdJson(3, "HOST_HANDOFF"),
    write_ack: (ack) => writeFdJson(4, ack, "HOST_HANDOFF_ACK"),
    read_commit: () => exactFdJson(5, "HOST_HANDOFF_COMMIT", 16_384),
  }, { stage_manifest_sha256: stage.stage_manifest_sha256, capsule_sha256: capsuleSha256 });
  return acceptedHostHandoff;
}

/** Legacy direct caller entry is permanently denied; only fd3/4/5 handoff is live. */
export async function executeRc7GateCLiveCapsule() {
  fail("HOST_HANDOFF_REQUIRED");
}

/**
 * Execute once only after the host has independently validated the durable
 * broker result and acknowledged this capsule's current stage/capsule bytes.
 * The exact commit is consumed before credential or provider imports occur.
 */
export async function executeRc7GateCLiveCapsuleFromHostHandoff() {
  const accepted = acceptedHostHandoff ?? await acceptRc7GateCHostHandoff();
  acceptedHostHandoff = null;
  const preflight = accepted.handoff.broker.sealed;
  scrubProxyAuthority();
  const fetchGuard = installSingleUseFetchGuard(preflight.semantic.value);
  let adapter;
  let root;
  let stream = createRc7GateCStreamState();
  let providerStartedAt = null;
  try {
    const [{ Context }, { default: LocalCredentialProvider }, { credentialRef }, { createUserMessage }, adapterModule] = await Promise.all([
      import("@deepseek-ai/cordis"),
      import("@deepseek-ai/dsh-credentials-local"),
      import("@deepseek-ai/dsh-credentials"),
      import("@deepseek-ai/dsh-llm"),
      import("deepseek-openai-codex"),
    ]);
    root = new Context();
    await root.plugin(LocalCredentialProvider, { watch: false });
    const credentialStore = new adapterModule.DshPiCredentialStore(root.credentials, {
      reference: credentialRef(CREDENTIAL_REFERENCE),
      acquireTimeoutMs: 5_000,
      staleMs: 30_000,
    });
    adapter = new adapterModule.OpenAICodexAdapter({ credentials: credentialStore, timeoutMs: RC7_GATE_C_PROVIDER_TIMEOUT_MS });
    const message = createUserMessage({ content: [{ type: "text", text: preflight.semantic.value.user_text }], source: { kind: "user" } });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RC7_GATE_C_PROVIDER_TIMEOUT_MS);
    timeout.unref?.();
    try {
      providerStartedAt = Date.now();
      for await (const chunk of adapter.stream({
        provider: "openai-codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        system: preflight.semantic.value.system_text,
        messages: [message],
        tools: [],
        maxTokens: 8_192,
        sessionId: preflight.semantic.value.session_id,
        signal: controller.signal,
      })) stream = reduceRc7GateCStreamChunk(stream, chunk);
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
    const { finalized, counts } = finalizeStreamBeforeSuccessPostcondition(stream, preflight.intent.case_id, fetchGuard);
    return {
      schema_version: "rc7-gate-c-live-capsule-result-v1",
      state: "success-pending-outer-seal",
      artifact: finalized.artifact,
      usage: finalized.usage,
      observations: {
        provider_posts: counts.provider_posts,
        oauth_refresh_posts: counts.refresh_posts,
        adapter_revision: preflight.intent.adapter_revision,
        provider: preflight.intent.provider,
        model: preflight.intent.model,
        reasoning: preflight.intent.reasoning,
        provider_active_milliseconds: Math.max(0, Date.now() - providerStartedAt),
        automatic_retry_count: 0,
      },
    };
  } catch (error) {
    return closedFailureResultFromValidatedPreflight(error, preflight, {
        ...fetchGuard.snapshot(),
        provider_active_milliseconds: providerStartedAt === null ? 0 : Math.max(0, Date.now() - providerStartedAt),
        automatic_retry_count: 0,
      });
  } finally {
    try { adapter?.dispose(); } catch {}
    try { await root?.fiber.dispose(); } catch {}
    fetchGuard.disable();
  }
}

export function sealRc7GateCLiveCapsuleResult({ activation_sha256: activationSha256, intent_sha256: intentSha256, permit_sha256: permitSha256, dispatch_nonce: dispatchNonce, artifact, usage, provenance_sha256: provenanceSha256, permission_sha256: permissionSha256, authority_sha256: authoritySha256, cleanup_sha256: cleanupSha256 }) {
  if (!artifact || !usage) fail("MISSING_RESULT_ARTIFACT");
  const artifactSha256 = sha256V1(`${canonicalJsonV1(artifact)}\n`);
  const usageSha256 = sha256V1(`${canonicalJsonV1(usage)}\n`);
  return buildRc7GateCSealedResult({
    activation_sha256: activationSha256,
    intent_sha256: intentSha256,
    permit_sha256: permitSha256,
    dispatch_nonce: dispatchNonce,
    artifact_sha256: artifactSha256,
    usage_sha256: usageSha256,
    provenance_sha256: provenanceSha256,
    permission_sha256: permissionSha256,
    authority_sha256: authoritySha256,
    cleanup_sha256: cleanupSha256,
  });
}

export const __test = Object.freeze({ acceptHostHandoffWithIo, closedFailure, closedFailureResultFromValidatedPreflight, finalizeStreamBeforeSuccessPostcondition });
