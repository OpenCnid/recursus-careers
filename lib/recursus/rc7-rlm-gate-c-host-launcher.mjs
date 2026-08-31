import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { lstat, open, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildRc7GateCFinalApprovalFreezeForApprovedLedger,
  preflightRc7GateCLiveDispatch,
} from "./rc7-rlm-gate-c-broker.mjs";
import {
  buildRc7GateCSmokeFinalApprovalFreezeForApprovedLedger,
  preflightRc7GateCSmokeLiveDispatch,
} from "./rc7-rlm-gate-c-smoke.mjs";
import {
  buildRc7GateCTreatmentProofFreezeForApprovedLedger,
  preflightRc7GateCTreatmentProofLiveDispatch,
} from "./rc7-rlm-gate-c-treatment-proof.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { inspectRc7GateCWorkerStage } from "./rc7-rlm-gate-c-worker.mjs";

export const RC7_GATE_C_HOST_HANDOFF_SCHEMA = "rc7-gate-c-host-handoff-v1";
export const RC7_GATE_C_HOST_ACK_SCHEMA = "rc7-gate-c-host-handoff-ack-v1";
export const RC7_GATE_C_HOST_COMMIT_SCHEMA = "rc7-gate-c-host-handoff-commit-v1";
export const RC7_GATE_C_HOST_LAUNCHER_ID = "rc7-gate-c-host-preflight-anonymous-pipe-launcher-v3";
export const RC7_GATE_C_HOST_NODE_RUNTIME = Object.freeze({
  version: "24.19.0",
  byte_count: 92_825_416,
  sha256: "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237",
});

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const HASH = /^[0-9a-f]{64}$/u;
const MAX_HANDOFF_BYTES = 524_288;
const MAX_ACK_BYTES = 32_768;
const MAX_RESULT_BYTES = 1_048_576;
const ACK_TIMEOUT_MS = 30_000;
const PROCESS_TIMEOUT_MS = 345_000;
const HOST_LOCK_NAME = ".gate-c-host-launch.lock";
const ACTIVE_DISPATCHES = new Set();
const CONSUMED_HANDOFFS = new Set();
const SMOKE_PERMISSION_POLICY_ID = "rc7-gate-c-safe01-direct-live-launch-smoke-v6";
const DSH_HOME_ENVIRONMENT_VARIABLE = "DSH_HOME";
const DSH_PROFILE_NAME = "recursus";
const DSH_PROFILE_MARKER = ".recursus-profile.json";
const DSH_CREDENTIAL_REFERENCE = "OPENAI_CODEX_OAUTH";

export class Rc7GateCHostLauncherError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCHostLauncherError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7GateCHostLauncherError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_HOST_HANDOFF", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("HOST_HANDOFF_IDENTITY_MISMATCH", `${label} keys mismatched`);
}

function projection(value, digestField) {
  const copy = structuredClone(value);
  delete copy[digestField];
  return copy;
}

function withDigest(value, digestField) {
  return { ...value, [digestField]: sha256V1(canonicalJsonV1(value)) };
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

export function preflightRc7GateCCredentialHomeEnvironment(environment = process.env) {
  const candidate = environment?.[DSH_HOME_ENVIRONMENT_VARIABLE];
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.trim() !== candidate || candidate.includes("\u0000") || !path.isAbsolute(candidate)) {
    fail("HOST_DSH_HOME_REQUIRED", "The trusted host requires one exact absolute DSH_HOME before provider reservation");
  }
  const resolved = path.resolve(candidate);
  if (candidate !== resolved || resolved === path.parse(resolved).root) {
    fail("HOST_DSH_HOME_UNSAFE", "The trusted host DSH_HOME is broad or noncanonical");
  }
  const relativeToRepository = path.relative(REPOSITORY_ROOT, resolved);
  const repositoryOverlap = relativeToRepository === "" || (!relativeToRepository.startsWith("..") && !path.isAbsolute(relativeToRepository));
  const relativeFromCandidate = path.relative(resolved, REPOSITORY_ROOT);
  const candidateContainsRepository = relativeFromCandidate === "" || (!relativeFromCandidate.startsWith("..") && !path.isAbsolute(relativeFromCandidate));
  if (repositoryOverlap || candidateContainsRepository) fail("HOST_DSH_HOME_UNSAFE", "The trusted host DSH_HOME overlaps the repository");
  let homeStat;
  let physicalHome;
  try {
    homeStat = lstatSync(resolved);
    physicalHome = realpathSync.native(resolved);
  } catch {
    fail("HOST_DSH_HOME_UNAVAILABLE", "The trusted host DSH_HOME is unavailable");
  }
  const samePhysicalHome = process.platform === "win32"
    ? physicalHome.toLowerCase() === resolved.toLowerCase()
    : physicalHome === resolved;
  if (!homeStat.isDirectory() || homeStat.isSymbolicLink() || !samePhysicalHome) {
    fail("HOST_DSH_HOME_UNSAFE", "The trusted host DSH_HOME is not one exact physical directory");
  }
  const profileDirectory = path.join(resolved, "profiles", DSH_PROFILE_NAME);
  const markerPath = path.join(profileDirectory, DSH_PROFILE_MARKER);
  let profileStat;
  let markerStat;
  let marker;
  try {
    profileStat = lstatSync(profileDirectory);
    markerStat = lstatSync(markerPath);
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    fail("HOST_DSH_PROFILE_REQUIRED", "The trusted host DSH_HOME lacks the required Recursus profile marker");
  }
  if (!profileStat.isDirectory() || profileStat.isSymbolicLink() || !markerStat.isFile() || markerStat.isSymbolicLink()) {
    fail("HOST_DSH_PROFILE_UNSAFE", "The trusted host Recursus profile marker is not one exact regular file");
  }
  const markerKeys = [
    "assemblyId", "credentialReferences", "distributionSha256", "lockfileSha256", "packageCount", "profileName", "schemaVersion",
  ];
  const references = marker?.credentialReferences;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)
    || canonicalJsonV1(Object.keys(marker).sort()) !== canonicalJsonV1(markerKeys.sort())
    || marker.schemaVersion !== 1 || marker.profileName !== DSH_PROFILE_NAME
    || typeof marker.assemblyId !== "string" || marker.assemblyId.length === 0
    || !HASH.test(marker.distributionSha256 ?? "") || !HASH.test(marker.lockfileSha256 ?? "")
    || !Number.isSafeInteger(marker.packageCount) || marker.packageCount < 1
    || !Array.isArray(references) || references.some((reference) => typeof reference !== "string" || !/^[A-Z][A-Z0-9_]*$/u.test(reference))
    || new Set(references).size !== references.length || !references.includes(DSH_CREDENTIAL_REFERENCE)) {
    fail("HOST_DSH_PROFILE_MISMATCH", "The trusted host Recursus profile marker does not bind the required credential reference");
  }
  return Object.freeze({
    schema_version: "rc7-gate-c-credential-home-environment-preflight-v2",
    state: "recursus-profile-marker-verified-credential-opaque-uninspected",
    environment_variable: DSH_HOME_ENVIRONMENT_VARIABLE,
    profile_name: DSH_PROFILE_NAME,
    credential_reference: DSH_CREDENTIAL_REFERENCE,
  });
}

function credentialOpaqueChildEnvironment(environment = process.env) {
  preflightRc7GateCCredentialHomeEnvironment(environment);
  return {
    DSH_HOME: path.resolve(environment[DSH_HOME_ENVIRONMENT_VARIABLE]),
    SystemRoot: "C:\\Windows",
    WINDIR: "C:\\Windows",
  };
}

function parseCanonical(bytes, maximum, label) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 3 || bytes.byteLength > maximum || bytes.includes(0)) fail("MALFORMED_HOST_HANDOFF", `${label} bytes are missing, oversized, or contain NUL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail("MALFORMED_HOST_HANDOFF", `${label} is not JSON`); }
  if (!bytes.equals(canonicalBytes(value))) fail("MALFORMED_HOST_HANDOFF", `${label} is not canonical JSON with one LF`);
  return value;
}

function validateTransportDescriptor(value) {
  exactKeys(value, ["ack_fd", "commit_fd", "handoff_fd", "kind", "path_authority"], "handoff transport");
  if (value.kind !== "anonymous-inherited-pipes" || value.handoff_fd !== 3 || value.ack_fd !== 4 || value.commit_fd !== 5
    || value.path_authority !== "none-no-filesystem-handoff") fail("HOST_HANDOFF_TRANSPORT_MISMATCH", "Host handoff must use the exact anonymous inherited-pipe contract");
  return value;
}

function assertNoHostOnlyBytes(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current)) {
      if (/(?:approval_text|operator_approval|evaluator_oracle|credential_path|credential_value)/iu.test(key)) fail("HOST_ONLY_BYTES_LEAKED", `Handoff contains prohibited host-only field ${key}`);
      pending.push(child);
    }
  }
}

function validateBrokerResult(value) {
  exactKeys(value, ["dispatch", "durable_handoff", "expected_closure", "gate_b", "sealed", "wire_contract"], "broker preflight result");
  if (value.sealed?.schema_version === "rc7-gate-c-smoke-sealed-worker-request-v6") {
    exactKeys(value.expected_closure, [
      "activation_sha256", "smoke_registration_sha256", "smoke_module_sha256", "broker_module_sha256",
      "worker_package_sha256", "live_capsule_sha256", "worker_stage_manifest_sha256", "permission_policy_identity",
    ], "smoke broker expected closure");
    for (const [key, item] of Object.entries(value.expected_closure)) {
      if (key === "permission_policy_identity" ? item !== SMOKE_PERMISSION_POLICY_ID : !HASH.test(item ?? "")) {
        fail("HOST_HANDOFF_IDENTITY_MISMATCH", "Smoke expected closure contains a malformed identity");
      }
    }
  } else {
    exactKeys(value.expected_closure, ["activation_sha256", "broker_package_sha256", "preregistration_sha256", "scorer_contract_sha256", "worker_package_sha256"], "broker expected closure");
    for (const digest of Object.values(value.expected_closure)) if (!HASH.test(digest ?? "")) fail("HOST_HANDOFF_IDENTITY_MISMATCH", "Expected closure contains a malformed digest");
  }
  exactKeys(value.wire_contract, [
    "adapter", "adapter_revision", "all_other_network", "automatic_retries", "configured_snapshot", "generation_https_posts",
    "max_output_plus_reasoning_tokens", "model", "oauth_refresh_https_posts", "provider", "provider_active_timeout_seconds",
    "provider_endpoint", "reasoning", "refresh_endpoint", "schema_version",
  ], "wire contract");
  const smoke = value.sealed?.schema_version === "rc7-gate-c-smoke-sealed-worker-request-v6";
  if (smoke) {
    exactKeys(value.gate_b, [
      "schema_version", "authority_profile", "state", "selected_route", "activation_sha256", "intent_sha256",
      "dispatch_sha256", "container_id", "image_id", "docker_executable_sha256", "outer_seccomp_inspect_sha256",
      "network", "direct_container_provider_access", "input_mount_sha256", "launcher_parent_intent_sha256",
      "launcher_parent_dispatch_sha256", "launcher_parent_semantic_request_sha256", "phase_two_tsync_proven",
    ], "smoke broker-derived Gate B evidence");
    exactKeys(value.durable_handoff, [
      "schema_version", "state", "authority_profile", "activation_sha256", "dispatch_sha256", "reservation_key",
      "handoff_nonce", "sealed_request_sha256", "gate_b_attestation_sha256", "durable_handoff_sha256",
    ], "smoke durable provider handoff");
  } else {
    exactKeys(value.gate_b, [
      "activation_sha256", "container_id", "direct_container_provider_access", "dispatch_sha256", "docker_executable_sha256",
      "image_id", "input_mount_sha256", "intent_sha256", "network", "outer_seccomp_inspect_sha256", "phase_two_tsync_proven",
      "launcher_parent_dispatch_sha256", "launcher_parent_intent_sha256", "launcher_parent_semantic_request_sha256",
      "schema_version", "selected_route", "state",
    ], "broker-derived Gate B evidence");
    exactKeys(value.durable_handoff, [
      "activation_sha256", "dispatch_sha256", "durable_handoff_sha256", "gate_b_attestation_sha256", "handoff_nonce",
      "reservation_key", "schema_version", "sealed_request_sha256", "state",
    ], "durable provider handoff");
  }
  if (!value.sealed || !value.dispatch || !HASH.test(value.dispatch.dispatch_sha256 ?? "")
    || value.dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(value.dispatch, "dispatch_sha256")))
    || !HASH.test(value.sealed.sealed_request_sha256 ?? "")
    || value.sealed.sealed_request_sha256 !== sha256V1(canonicalJsonV1(projection(value.sealed, "sealed_request_sha256")))
    || value.sealed.activation_sha256 !== value.expected_closure.activation_sha256
    || value.dispatch.activation_sha256 !== value.expected_closure.activation_sha256
    || value.sealed.intent?.intent_sha256 !== value.dispatch.intent_sha256
    || value.sealed.permit?.permit_sha256 !== value.dispatch.permit_sha256
    || value.gate_b.activation_sha256 !== value.dispatch.activation_sha256
    || value.gate_b.intent_sha256 !== value.dispatch.intent_sha256
    || value.gate_b.dispatch_sha256 !== value.dispatch.dispatch_sha256
    || value.gate_b.selected_route !== value.dispatch.selected_route
    || value.gate_b.phase_two_tsync_proven !== false
    || value.durable_handoff.schema_version !== (smoke ? "rc7-gate-c-smoke-durable-provider-handoff-v6" : "rc7-gate-c-durable-provider-handoff-v1")
    || value.durable_handoff.state !== "preflight-consumed-provider-reachability-committed"
    || (smoke && value.durable_handoff.authority_profile !== "safe01-direct-live-launch-smoke")
    || value.durable_handoff.activation_sha256 !== value.dispatch.activation_sha256
    || value.durable_handoff.dispatch_sha256 !== value.dispatch.dispatch_sha256
    || value.durable_handoff.reservation_key !== value.dispatch.reservation_key
    || value.durable_handoff.sealed_request_sha256 !== value.sealed.sealed_request_sha256
    || value.durable_handoff.durable_handoff_sha256 !== sha256V1(canonicalJsonV1(projection(value.durable_handoff, "durable_handoff_sha256")))
    || value.wire_contract.schema_version !== "rc7-gate-c-exact-wire-contract-v1") fail("HOST_HANDOFF_IDENTITY_MISMATCH", "Broker preflight result does not close over one exact durable dispatch");
  if (smoke) {
    for (const key of Object.keys(value.expected_closure)) {
      if (value.sealed[key] !== value.expected_closure[key]) fail("HOST_HANDOFF_IDENTITY_MISMATCH", `Smoke sealed request ${key} differs from the broker expected closure`);
    }
    if (value.dispatch.schema_version !== "rc7-gate-c-smoke-dispatch-checkpoint-v6"
      || value.dispatch.authority_profile !== "safe01-direct-live-launch-smoke"
      || value.dispatch.permission_policy_identity !== SMOKE_PERMISSION_POLICY_ID
      || value.dispatch.matrix_member !== false || value.dispatch.score_bearing !== false
      || value.gate_b.schema_version !== "rc7-gate-c-smoke-broker-derived-gate-b-evidence-v6"
      || value.gate_b.authority_profile !== "safe01-direct-live-launch-smoke"
      || value.gate_b.state !== "not-applicable-direct-route" || value.gate_b.selected_route !== "rc-direct"
      || value.gate_b.container_id !== null || value.gate_b.image_id !== null || value.gate_b.docker_executable_sha256 !== null
      || value.gate_b.outer_seccomp_inspect_sha256 !== null || value.gate_b.network !== "not-applicable-no-container"
      || value.gate_b.direct_container_provider_access !== "not-applicable-no-container" || value.gate_b.input_mount_sha256 !== null
      || value.gate_b.launcher_parent_intent_sha256 !== null || value.gate_b.launcher_parent_dispatch_sha256 !== null
      || value.gate_b.launcher_parent_semantic_request_sha256 !== null) {
      fail("HOST_HANDOFF_IDENTITY_MISMATCH", "Smoke broker result widened beyond the direct non-score-bearing authority profile");
    }
  }
  assertNoHostOnlyBytes(value);
  return value;
}

function buildHandoffRecord(brokerResult, nonce) {
  validateBrokerResult(brokerResult);
  if (!HASH.test(nonce ?? "")) fail("HOST_HANDOFF_NONCE_MISMATCH", "Host handoff requires one fresh 256-bit nonce");
  if (brokerResult.durable_handoff.handoff_nonce !== nonce) fail("HOST_HANDOFF_NONCE_MISMATCH", "Broker durable handoff and anonymous-pipe nonce differ");
  const value = withDigest({
    schema_version: RC7_GATE_C_HOST_HANDOFF_SCHEMA,
    state: "host-preflight-complete-one-use",
    nonce,
    broker_result: structuredClone(brokerResult),
  }, "handoff_sha256");
  const bytes = canonicalBytes(value);
  if (bytes.byteLength > MAX_HANDOFF_BYTES) fail("HOST_HANDOFF_OVERSIZED", "Host handoff exceeds its closed byte ceiling");
  return { value, bytes };
}

function validateHandoffRecord(value) {
  exactKeys(value, ["broker_result", "handoff_sha256", "nonce", "schema_version", "state"], "host handoff");
  if (value.schema_version !== RC7_GATE_C_HOST_HANDOFF_SCHEMA || value.state !== "host-preflight-complete-one-use" || !HASH.test(value.nonce ?? "")
    || value.handoff_sha256 !== sha256V1(canonicalJsonV1(projection(value, "handoff_sha256")))) fail("HOST_HANDOFF_IDENTITY_MISMATCH", "Host handoff schema, state, nonce, or digest mismatched");
  validateBrokerResult(value.broker_result);
  return value;
}

function validateAck(value, expected, consumed = CONSUMED_HANDOFFS) {
  exactKeys(value, ["ack_sha256", "capsule_sha256", "dispatch_sha256", "handoff_sha256", "nonce", "schema_version", "stage_manifest_sha256", "state"], "capsule acknowledgment");
  if (value.schema_version !== RC7_GATE_C_HOST_ACK_SCHEMA || value.state !== "accepted-before-credential-or-provider-authority"
    || value.nonce !== expected.handoff.nonce || value.handoff_sha256 !== expected.handoff.handoff_sha256
    || value.dispatch_sha256 !== expected.handoff.broker_result.dispatch.dispatch_sha256
    || value.stage_manifest_sha256 !== expected.stage_manifest_sha256 || value.capsule_sha256 !== expected.capsule_sha256
    || value.ack_sha256 !== sha256V1(canonicalJsonV1(projection(value, "ack_sha256")))) fail("HOST_HANDOFF_ACK_MISMATCH", "Capsule acknowledgment is stale, forged, or bound to another stage or dispatch");
  if (consumed.has(value.handoff_sha256)) fail("HOST_HANDOFF_REPLAY", "Host handoff was already acknowledged and cannot be replayed");
  consumed.add(value.handoff_sha256);
  return value;
}

function buildCommit(handoff, ack) {
  return withDigest({
    schema_version: RC7_GATE_C_HOST_COMMIT_SCHEMA,
    state: "host-ack-validated-execute-once",
    nonce: handoff.nonce,
    handoff_sha256: handoff.handoff_sha256,
    ack_sha256: ack.ack_sha256,
  }, "commit_sha256");
}

function validateCommit(value, handoff, ack) {
  exactKeys(value, ["ack_sha256", "commit_sha256", "handoff_sha256", "nonce", "schema_version", "state"], "host commit");
  if (value.schema_version !== RC7_GATE_C_HOST_COMMIT_SCHEMA || value.state !== "host-ack-validated-execute-once"
    || value.nonce !== handoff.nonce || value.handoff_sha256 !== handoff.handoff_sha256 || value.ack_sha256 !== ack.ack_sha256
    || value.commit_sha256 !== sha256V1(canonicalJsonV1(projection(value, "commit_sha256")))) fail("HOST_HANDOFF_COMMIT_MISMATCH", "Host commit is forged or bound to another acknowledgment");
  return value;
}

function freezeStageManifestSha256(freeze) {
  if (freeze?.schema_version === "rc7-gate-c-smoke-final-approval-freeze-v6"
    || freeze?.schema_version === "rc7-gate-c-treatment-proof-freeze-v1") {
    return freeze.closure?.execution_closure?.worker_stage_manifest_sha256;
  }
  return freeze?.closure?.worker_stage_manifest_sha256;
}

function freezeLiveCapsuleSha256(freeze) {
  if (freeze?.schema_version === "rc7-gate-c-smoke-final-approval-freeze-v6") {
    return freeze.closure?.execution_closure?.live_capsule_module?.sha256;
  }
  if (freeze?.schema_version === "rc7-gate-c-treatment-proof-freeze-v1") {
    return freeze.closure?.execution_closure?.live_capsule_sha256;
  }
  return freeze?.closure?.live_capsule_sha256;
}

function validateStageIdentity(stage, freeze, input, capsule) {
  if (stage.runtime_root !== path.resolve(input.runtime_root) || stage.stage_root !== path.resolve(input.stage_root)
    || stage.stage_manifest_sha256 !== freezeStageManifestSha256(freeze)
    || capsule.path !== path.join(path.resolve(input.stage_root), "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs")
    || capsule.sha256 !== freezeLiveCapsuleSha256(freeze)) fail("HOST_STAGE_IDENTITY_MISMATCH", "Runtime, stage manifest, or live capsule identity differs from the current freeze");
  return { stage_manifest_sha256: stage.stage_manifest_sha256, capsule_sha256: capsule.sha256, capsule_path: capsule.path };
}

async function verifyCapsule(stageRoot, freeze) {
  const target = path.join(path.resolve(stageRoot), "lib", "recursus", "rc7-rlm-gate-c-live-capsule.mjs");
  const before = await lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || path.resolve(await realpath(target)) !== target) fail("HOST_STAGE_IDENTITY_MISMATCH", "Live capsule is missing, linked, or aliased");
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || after.dev !== opened.dev || after.ino !== opened.ino
      || bytes.byteLength !== Number(after.size)
      || sha256V1(bytes) !== freezeLiveCapsuleSha256(freeze)) fail("HOST_STAGE_IDENTITY_MISMATCH", "Live capsule was replaced or differs from the current freeze");
    return { path: target, byte_count: bytes.byteLength, sha256: sha256V1(bytes) };
  } finally { await handle.close(); }
}

async function verifyPinnedHostNodeRuntime() {
  const target = path.resolve(process.execPath);
  const before = await lstat(target, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || path.resolve(await realpath(target)) !== target
    || Number(before.size) !== RC7_GATE_C_HOST_NODE_RUNTIME.byte_count || process.versions.node !== RC7_GATE_C_HOST_NODE_RUNTIME.version) fail("HOST_RUNTIME_IDENTITY_MISMATCH", "Host launcher Node runtime path, version, or size mismatched");
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (opened.dev !== before.dev || opened.ino !== before.ino || after.dev !== opened.dev || after.ino !== opened.ino
      || bytes.byteLength !== RC7_GATE_C_HOST_NODE_RUNTIME.byte_count || sha256V1(bytes) !== RC7_GATE_C_HOST_NODE_RUNTIME.sha256) fail("HOST_RUNTIME_IDENTITY_MISMATCH", "Host launcher Node runtime was replaced or its digest mismatched");
  } finally { await handle.close(); }
  return RC7_GATE_C_HOST_NODE_RUNTIME;
}

async function acquireHostLock(ledgerRoot, identity) {
  const root = path.resolve(ledgerRoot);
  if (path.resolve(await realpath(root)) !== root || root === REPOSITORY_ROOT || root.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) fail("HOST_LOCK_PATH_MISMATCH", "Host lock root is aliased or repository-contained");
  const target = path.join(root, HOST_LOCK_NAME);
  let handle;
  try { handle = await open(target, "wx"); } catch (error) {
    if (error?.code === "EEXIST") fail("HOST_LAUNCH_CONCURRENT", "Another host launcher owns this exact ledger");
    throw error;
  }
  try {
    const value = withDigest({
      schema_version: "rc7-gate-c-host-launch-lock-v2",
      state: "parent-owned-before-child-spawn",
      normalized_ledger_root: root.toLowerCase(),
      activation_sha256: identity.activation_sha256,
      run_id: identity.run_id,
      dispatch_sha256: identity.dispatch_sha256,
      durable_handoff_sha256: identity.durable_handoff_sha256,
      handoff_sha256: identity.handoff_sha256,
      nonce: identity.nonce,
      parent_pid: process.pid,
      child_pid: null,
    }, "host_lock_sha256");
    await handle.writeFile(canonicalBytes(value));
    await handle.sync();
    return { handle, target, value };
  } catch (error) {
    await handle.close();
    await rm(target, { force: true });
    throw error;
  }
}

async function updateHostLock(lock, state, childPid) {
  if (!Number.isSafeInteger(childPid) || childPid < 1 || ![
    "child-spawned-before-handoff", "handoff-written-awaiting-ack", "ack-validated-before-commit", "commit-sent-awaiting-result",
  ].includes(state)) fail("HOST_LOCK_IDENTITY_MISMATCH", "Host launch lifecycle update is malformed");
  const owned = await lock.handle.stat({ bigint: true });
  const current = await lstat(lock.target, { bigint: true });
  if (owned.dev !== current.dev || owned.ino !== current.ino) fail("HOST_LOCK_OWNERSHIP_LOST", "Host launch lock was replaced while owned");
  const value = withDigest({ ...projection(lock.value, "host_lock_sha256"), state, child_pid: childPid }, "host_lock_sha256");
  const payload = canonicalBytes(value);
  await lock.handle.write(payload, 0, payload.byteLength, 0);
  await lock.handle.truncate(payload.byteLength);
  await lock.handle.sync();
  lock.value = value;
  return value;
}

async function releaseHostLock(lock) {
  const owned = await lock.handle.stat({ bigint: true });
  const current = await lstat(lock.target, { bigint: true });
  if (owned.dev !== current.dev || owned.ino !== current.ino) fail("HOST_LOCK_OWNERSHIP_LOST", "Host launch lock was replaced while owned");
  await lock.handle.close();
  await rm(lock.target);
}

function readBoundedStream(stream, maximum, timeoutMs, timeoutCode) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      settle(reject, new Rc7GateCHostLauncherError(timeoutCode, "Child protocol timed out"));
      stream.destroy();
    }, timeoutMs);
    stream.on("data", (chunk) => {
      if (settled) return;
      size += chunk.byteLength;
      if (size > maximum) {
        settle(reject, new Rc7GateCHostLauncherError("HOST_CHILD_OUTPUT_OVERSIZED", "Child protocol output exceeded its bound"));
        stream.destroy();
      } else chunks.push(chunk);
    });
    stream.once("error", (error) => settle(reject, error));
    stream.once("end", () => settle(resolve, Buffer.concat(chunks)));
    stream.once("close", () => settle(reject, new Rc7GateCHostLauncherError("HOST_CHILD_FAILED", "Child protocol stream closed before completion")));
  });
}

function writePipe(stream, bytes) {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(bytes, resolve);
  });
}

function observePromise(promise) {
  return promise.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason }),
  );
}

function unwrapObserved(outcome) {
  if (outcome.status === "rejected") throw outcome.reason;
  return outcome.value;
}

function childBootstrapSource() {
  return String.raw`
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const canonical = value => { if (value===null) return "null"; if (typeof value==="string") return JSON.stringify(value); if (typeof value==="number"||typeof value==="boolean") return JSON.stringify(value); if (Array.isArray(value)) return "["+value.map(canonical).join(",")+"]"; return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}"; };
const closedCode = error => typeof error?.code === "string" && /^[A-Z][A-Z0-9_-]{1,63}$/.test(error.code) ? error.code : "HOST_CHILD_FAILED";
try {
const capsulePath=process.argv[1], stageManifest=process.argv[2], capsuleSha=process.argv[3]; const capsuleBytes=await import("node:fs/promises").then(m=>m.readFile(capsulePath)); if(createHash("sha256").update(capsuleBytes).digest("hex")!==capsuleSha) throw Object.assign(new Error("capsule mismatch"),{code:"HOST_STAGE_IDENTITY_MISMATCH"});
const capsule=await import(pathToFileURL(capsulePath).href); if(typeof capsule.acceptRc7GateCHostHandoff!=="function"||typeof capsule.executeRc7GateCLiveCapsuleFromHostHandoff!=="function") throw Object.assign(new Error("handoff export unavailable"),{code:"CAPSULE_HANDOFF_EXPORT_UNAVAILABLE"});
const accepted=await capsule.acceptRc7GateCHostHandoff();
if(accepted.stage.stage_manifest_sha256!==stageManifest||accepted.capsule_sha256!==capsuleSha) throw Object.assign(new Error("capsule trust mismatch"),{code:"HOST_HANDOFF_TRUST_MISMATCH"});
const result=await capsule.executeRc7GateCLiveCapsuleFromHostHandoff(); process.stdout.write(canonical(result)+"\n\n");
} catch (error) { writeFileSync(2, closedCode(error)+"\n"); process.exit(1); }
`;
}

function closedChildFailureCode(stderr) {
  const value = stderr.toString("utf8");
  return /^[A-Z][A-Z0-9_-]{1,63}\n$/u.test(value) ? value.trim() : "HOST_CHILD_FAILED";
}

const productionController = Object.freeze({
  async exchange({ abortSignal, handoffBytes, capsulePath, capsuleSha256, stageManifestSha256, processTimeoutMs, onAck, onLifecycle }) {
    if (!Number.isSafeInteger(processTimeoutMs) || processTimeoutMs < 1 || processTimeoutMs > PROCESS_TIMEOUT_MS) fail("HOST_PROCESS_TIMEOUT_MISMATCH", "Host process timeout exceeds the closed ceiling");
    if (!(abortSignal instanceof AbortSignal)) fail("HOST_PROCESS_TIMEOUT_MISMATCH", "Host process requires the executor-owned abort signal");
    const child = spawn(process.execPath, ["--input-type=module", "--eval", childBootstrapSource(), capsulePath, stageManifestSha256, capsuleSha256], {
      cwd: path.dirname(path.dirname(path.dirname(capsulePath))),
      env: credentialOpaqueChildEnvironment(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "pipe", "pipe", "pipe"],
    });
    const stdoutOutcome = observePromise(readBoundedStream(child.stdout, MAX_RESULT_BYTES, processTimeoutMs, "HOST_CHILD_TIMEOUT"));
    const stderrOutcome = observePromise(readBoundedStream(child.stderr, MAX_ACK_BYTES, processTimeoutMs, "HOST_CHILD_TIMEOUT"));
    const exitOutcome = observePromise(new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    }));
    let killed = false;
    const kill = () => { killed = true; child.kill(); };
    const processTimer = setTimeout(kill, processTimeoutMs);
    if (abortSignal.aborted) kill();
    else abortSignal.addEventListener("abort", kill, { once: true });
    const ackOutcome = observePromise(readBoundedStream(child.stdio[4], MAX_ACK_BYTES, ACK_TIMEOUT_MS, "HOST_ACK_TIMEOUT"));
    let handoffWriteOutcome = null;
    let commitWriteOutcome = null;
    try {
      await onLifecycle("child-spawned-before-handoff", child.pid);
      handoffWriteOutcome = observePromise(writePipe(child.stdio[3], handoffBytes));
      const handoffGate = await Promise.race([
        handoffWriteOutcome.then((outcome) => ({ state: "handoff", outcome })),
        ackOutcome.then((outcome) => ({ state: "ack", outcome })),
        exitOutcome.then((outcome) => ({ state: "exit", outcome })),
      ]);
      if (handoffGate.state === "exit") {
        const stderr = unwrapObserved(await stderrOutcome);
        fail("HOST_CHILD_PRE_ACK_FAILED", "One-shot capsule child exited before provider authority", {
          child_failure_code: closedChildFailureCode(stderr),
          exit: unwrapObserved(handoffGate.outcome),
        });
      }
      const earlyAck = handoffGate.state === "ack" ? unwrapObserved(handoffGate.outcome) : null;
      unwrapObserved(await handoffWriteOutcome);
      await onLifecycle("handoff-written-awaiting-ack", child.pid);
      const preAckValue = earlyAck ?? await (async () => {
        const preAck = await Promise.race([
          ackOutcome.then((outcome) => ({ state: "ack", outcome })),
          exitOutcome.then((outcome) => ({ state: "exit", outcome })),
        ]);
        const value = unwrapObserved(preAck.outcome);
        if (preAck.state === "exit") {
          const stderr = unwrapObserved(await stderrOutcome);
          fail("HOST_CHILD_PRE_ACK_FAILED", "One-shot capsule child exited before provider authority", {
            child_failure_code: closedChildFailureCode(stderr),
            exit: value,
          });
        }
        return value;
      })();
      const commitBytes = onAck(preAckValue);
      await onLifecycle("ack-validated-before-commit", child.pid);
      commitWriteOutcome = observePromise(writePipe(child.stdio[5], commitBytes));
      unwrapObserved(await commitWriteOutcome);
      await onLifecycle("commit-sent-awaiting-result", child.pid);
      const [stdoutResult, stderrResult, exitResult] = await Promise.all([stdoutOutcome, stderrOutcome, exitOutcome]);
      const stdout = unwrapObserved(stdoutResult);
      const stderr = unwrapObserved(stderrResult);
      const exit = unwrapObserved(exitResult);
      if (killed || exit.code !== 0 || exit.signal !== null) fail(killed ? "HOST_CHILD_TIMEOUT" : "HOST_CHILD_FAILED", "One-shot capsule child failed closed", {
        exit,
        child_failure_code: closedChildFailureCode(stderr),
      });
      return { result_bytes: stdout, transport: validateTransportDescriptor({ kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" }) };
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      for (const stream of child.stdio) stream?.destroy?.();
      const settled = await Promise.all([stdoutOutcome, stderrOutcome, exitOutcome, ackOutcome,
        ...(handoffWriteOutcome === null ? [] : [handoffWriteOutcome]),
        ...(commitWriteOutcome === null ? [] : [commitWriteOutcome])]);
      const childFailureCode = settled[1].status === "fulfilled" ? closedChildFailureCode(settled[1].value) : "HOST_CHILD_FAILED";
      if (error?.code === "MALFORMED_HOST_HANDOFF" && childFailureCode !== "HOST_CHILD_FAILED") {
        fail("HOST_CHILD_PRE_ACK_FAILED", "One-shot capsule child rejected the handoff before provider authority", {
          child_failure_code: childFailureCode,
        });
      }
      throw error;
    } finally {
      clearTimeout(processTimer);
      abortSignal.removeEventListener("abort", kill);
      for (const stream of child.stdio) stream?.destroy?.();
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
  },
});

async function runHostLauncher(input, dependencies) {
  exactKeys(input, ["abort_signal", "dispatch_sha256", "gate_b_attestation", "ledger_root", "process_timeout_ms", "runtime_root", "sealed_request", "stage_root"], "host launch input");
  if (!HASH.test(input.dispatch_sha256 ?? "") || ACTIVE_DISPATCHES.has(input.dispatch_sha256)) fail("HOST_LAUNCH_CONCURRENT", "Dispatch is malformed or already active in this host process");
  if (!(input.abort_signal instanceof AbortSignal)) fail("HOST_PROCESS_TIMEOUT_MISMATCH", "Host launch requires the executor-owned abort signal");
  if (input.abort_signal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired before host preflight");
  const requestKind = input.sealed_request?.intent?.request_kind;
  if ((requestKind === "top-level" && input.process_timeout_ms !== PROCESS_TIMEOUT_MS)
    || (requestKind === "recursive-child" && (!Number.isSafeInteger(input.process_timeout_ms) || input.process_timeout_ms < 1 || input.process_timeout_ms > 120_000))
    || !["top-level", "recursive-child"].includes(requestKind)) fail("HOST_PROCESS_TIMEOUT_MISMATCH", "Host process timeout is not the exact route-specific ceiling");
  ACTIVE_DISPATCHES.add(input.dispatch_sha256);
  let lock;
  try {
    const freeze = await dependencies.freeze(input.ledger_root);
    const firstStage = await dependencies.inspectStage({ runtime_root: input.runtime_root, stage_root: input.stage_root });
    const firstCapsule = await dependencies.verifyCapsule(input.stage_root, freeze);
    const identity = validateStageIdentity(firstStage, freeze, input, firstCapsule);
    const nonce = dependencies.nonce();
    if (!HASH.test(nonce ?? "")) fail("HOST_HANDOFF_NONCE_MISMATCH", "Host launcher nonce source returned a malformed value");
    const brokerResult = validateBrokerResult(await dependencies.preflight({
      ledger_root: input.ledger_root,
      sealed_request: input.sealed_request,
      dispatch_sha256: input.dispatch_sha256,
      gate_b_attestation: input.gate_b_attestation,
      handoff_nonce: nonce,
    }));
    const secondStage = await dependencies.inspectStage({ runtime_root: input.runtime_root, stage_root: input.stage_root });
    const secondCapsule = await dependencies.verifyCapsule(input.stage_root, freeze);
    if (canonicalJsonV1(validateStageIdentity(secondStage, freeze, input, secondCapsule)) !== canonicalJsonV1(identity)) fail("HOST_STAGE_IDENTITY_MISMATCH", "Stage changed across host preflight");
    const handoff = buildHandoffRecord(brokerResult, nonce);
    if (input.abort_signal.aborted) fail("ATTEMPT_EXECUTION_TIMEOUT", "Executor-owned attempt deadline expired before the one-shot capsule handoff");
    lock = await dependencies.acquireLock(input.ledger_root, {
      activation_sha256: brokerResult.expected_closure.activation_sha256,
      run_id: input.sealed_request.intent.run_id,
      dispatch_sha256: input.dispatch_sha256,
      durable_handoff_sha256: brokerResult.durable_handoff.durable_handoff_sha256,
      handoff_sha256: handoff.value.handoff_sha256,
      nonce,
    });
    const exchanged = await dependencies.controller.exchange({
      abortSignal: input.abort_signal,
      handoffBytes: handoff.bytes,
      capsulePath: identity.capsule_path,
      capsuleSha256: identity.capsule_sha256,
      stageManifestSha256: identity.stage_manifest_sha256,
      processTimeoutMs: input.process_timeout_ms,
      onAck: (ackBytes) => {
        const ack = validateAck(parseCanonical(ackBytes, MAX_ACK_BYTES, "capsule acknowledgment"), { handoff: handoff.value, ...identity }, dependencies.consumed);
        return canonicalBytes(buildCommit(handoff.value, ack));
      },
      onLifecycle: (state, childPid) => dependencies.updateLock?.(lock, state, childPid),
    });
    validateTransportDescriptor(exchanged.transport);
    const result = parseCanonical(exchanged.result_bytes, MAX_RESULT_BYTES, "capsule result");
    return {
      schema_version: "rc7-gate-c-host-launch-result-v1",
      state: "one-shot-child-complete",
      dispatch_sha256: input.dispatch_sha256,
      handoff_sha256: handoff.value.handoff_sha256,
      transport: exchanged.transport,
      result,
      same_host_governance_nonclaim: "same-host stage, pipe, process, and acknowledgment checks are governance evidence, not cryptographic proof against a hostile host administrator",
    };
  } finally {
    try { if (lock) await dependencies.releaseLock(lock); } finally { ACTIVE_DISPATCHES.delete(input.dispatch_sha256); }
  }
}

const productionDependencies = Object.freeze({
  freeze: buildRc7GateCFinalApprovalFreezeForApprovedLedger,
  inspectStage: inspectRc7GateCWorkerStage,
  verifyCapsule,
  preflight: preflightRc7GateCLiveDispatch,
  nonce: () => randomBytes(32).toString("hex"),
  acquireLock: acquireHostLock,
  updateLock: updateHostLock,
  releaseLock: releaseHostLock,
  controller: productionController,
  consumed: CONSUMED_HANDOFFS,
});

const smokeProductionDependencies = Object.freeze({
  freeze: buildRc7GateCSmokeFinalApprovalFreezeForApprovedLedger,
  inspectStage: inspectRc7GateCWorkerStage,
  verifyCapsule,
  preflight: preflightRc7GateCSmokeLiveDispatch,
  nonce: () => randomBytes(32).toString("hex"),
  acquireLock: acquireHostLock,
  updateLock: updateHostLock,
  releaseLock: releaseHostLock,
  controller: productionController,
  consumed: CONSUMED_HANDOFFS,
});

const treatmentProofProductionDependencies = Object.freeze({
  freeze: buildRc7GateCTreatmentProofFreezeForApprovedLedger,
  inspectStage: inspectRc7GateCWorkerStage,
  verifyCapsule,
  preflight: preflightRc7GateCTreatmentProofLiveDispatch,
  nonce: () => randomBytes(32).toString("hex"),
  acquireLock: acquireHostLock,
  updateLock: updateHostLock,
  releaseLock: releaseHostLock,
  controller: productionController,
  consumed: CONSUMED_HANDOFFS,
});

export async function launchRc7GateCLiveCapsuleFromHost(input) {
  await verifyPinnedHostNodeRuntime();
  return runHostLauncher(input, productionDependencies);
}

export async function launchRc7GateCSmokeLiveCapsuleFromHost(input) {
  preflightRc7GateCCredentialHomeEnvironment();
  await verifyPinnedHostNodeRuntime();
  return runHostLauncher(input, smokeProductionDependencies);
}

export async function launchRc7GateCTreatmentProofLiveCapsuleFromHost(input) {
  preflightRc7GateCCredentialHomeEnvironment();
  await verifyPinnedHostNodeRuntime();
  return runHostLauncher(input, treatmentProofProductionDependencies);
}

export async function preflightRc7GateCTreatmentProofHostStage(input) {
  exactKeys(input, ["ledger_root", "runtime_root", "stage_root"], "treatment-proof host-stage preflight input");
  const freeze = await buildRc7GateCTreatmentProofFreezeForApprovedLedger(input.ledger_root);
  const stage = await inspectRc7GateCWorkerStage({ runtime_root: input.runtime_root, stage_root: input.stage_root });
  const capsule = await verifyCapsule(input.stage_root, freeze);
  const identity = validateStageIdentity(stage, freeze, input, capsule);
  return {
    schema_version: "rc7-gate-c-treatment-proof-host-stage-preflight-v1",
    state: "source-stage-identity-verified-before-reservation",
    stage_manifest_sha256: identity.stage_manifest_sha256,
    capsule_sha256: identity.capsule_sha256,
  };
}

export function rc7GateCHostLauncherContract() {
  return {
    schema_version: "rc7-gate-c-host-launcher-contract-v2",
    identity: RC7_GATE_C_HOST_LAUNCHER_ID,
    node_runtime: RC7_GATE_C_HOST_NODE_RUNTIME,
    preflight_location: "trusted-host-before-staged-capsule",
    transport: validateTransportDescriptor({ kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" }),
    protocol: ["host-preflight", "fresh-256-bit-nonce", "handoff-and-eof", "capsule-pre-credential-ack", "host-validated-commit", "one-shot-execution", "process-termination"],
    handoff_includes: ["broker-derived-sealed", "durable-dispatch", "expected-closure", "wire-contract", "broker-derived-gate-b-evidence", "nonce"],
    handoff_excludes: ["approval-text", "operator-record", "evaluator-or-oracle-bytes", "credential-reference-path-or-value", "DSH_HOME-path-or-value"],
    child_environment: "exactly DSH_HOME, SystemRoot, and WINDIR; before reservation DSH_HOME must be one physical external directory whose recursus profile marker binds OPENAI_CODEX_OAUTH, while credential path and value remain opaque and uninspected",
    capsule_integration: "exact acceptRc7GateCHostHandoff and executeRc7GateCLiveCapsuleFromHostHandoff exports are implemented and verified before credential reachability",
    same_host_governance_nonclaim: "same-host stage, pipe, process, and acknowledgment checks are governance evidence, not cryptographic proof against a hostile host administrator",
  };
}

export const __test = Object.freeze({
  MAX_HANDOFF_BYTES,
  HOST_LOCK_NAME,
  canonicalBytes,
  parseCanonical,
  validateTransportDescriptor,
  validateBrokerResult,
  buildHandoffRecord,
  validateHandoffRecord,
  validateAck,
  buildCommit,
  validateCommit,
  validateStageIdentity,
  preflightRc7GateCCredentialHomeEnvironment,
  credentialOpaqueChildEnvironment,
  verifyPinnedHostNodeRuntime,
  childBootstrapSource,
  closedChildFailureCode,
  productionController,
  runHostLauncher,
});
