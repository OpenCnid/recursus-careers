import { link, lstat, mkdir, open, readFile, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

import {
  buildRc7GateCFinalApprovalFreeze,
  extractRc7GateCLedgerAccounting,
} from "./rc7-rlm-gate-c-broker.mjs";
import { RC7_GATE_C_EXECUTOR_ID } from "./rc7-rlm-gate-c-executor.mjs";
import { buildRc7GateCPreregistrationPackage, validateRc7GateCPreregistrationPackage } from "./rc7-rlm-gate-c-preregistration.mjs";
import { assertRc7GateCRlmExternalRoot, inspectRc7GateCRlmCompletedArtifact } from "./rc7-rlm-gate-c-rlm-launcher.mjs";
import {
  aggregateRc7GateCScores,
  assertRc7GateCNoEvaluatorOnlyMarkers,
  parseRc7GateCStructuredOutput,
} from "./rc7-rlm-gate-c-scorer.mjs";
import { RC7_GATE_C_RUNTIME_CLOSURE } from "./rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const RC7_GATE_C_RESULTS_ID = "rc7-gate-c-sealed-36-attempt-results-v4";
export const RC7_GATE_C_RESULTS_META = "results-meta.json";
export const RC7_GATE_C_STARTS_DIR = "attempt-starts";
export const RC7_GATE_C_ATTEMPTS_DIR = "attempts";
export const RC7_GATE_C_AGGREGATE_FILE = "aggregate.json";
export const RC7_GATE_C_AGGREGATE_SCHEMA = "rc7-gate-c-sealed-aggregate-package-v1";

const HASH = /^[0-9a-f]{64}$/u;
const START_SCHEMA = "rc7-gate-c-primary-attempt-start-v1";
const ATTEMPT_SCHEMA = "rc7-gate-c-primary-attempt-record-v4";
const RESULTS_RECOVERY_LOCK = ".gate-c-results-recovery.lock";
const RESULTS_RECOVERY_OWNER_PREFIX = ".gate-c-results-recovery.owner.";
const MAX_ATTEMPT_BYTES = 196_608;
const MAX_AGGREGATE_BYTES = 1_048_576;
let recoveryLockSequence = 0;

export class Rc7GateCResultsError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateCResultsError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = undefined) {
  throw new Rc7GateCResultsError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_RESULTS", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...expected].sort())) fail("MALFORMED_RESULTS", `${label} keys mismatched`);
}

function projection(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return copy;
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function bytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function normalized(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase();
}

function nestedOrSame(candidate, parent) {
  const relative = path.relative(normalized(parent), normalized(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function physicalDirectory(target, parent, label) {
  let info;
  try { info = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_RESULTS_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("ALIASED_RESULTS_PATH", `${label} must be one physical directory`);
  const physical = await realpath(target);
  if (normalized(physical) !== normalized(target) || normalized(path.dirname(physical)) !== normalized(parent)) fail("ALIASED_RESULTS_PATH", `${label} was replaced, aliased, or moved outside its results root`);
  return physical;
}

async function physicalFile(target, parent, label) {
  let info;
  try { info = await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_RESULTS_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) fail("ALIASED_RESULTS_PATH", `${label} must be one physical file`);
  const physical = await realpath(target);
  if (normalized(physical) !== normalized(target) || normalized(path.dirname(physical)) !== normalized(parent)) fail("ALIASED_RESULTS_PATH", `${label} was replaced, aliased, or moved outside its results root`);
  return physical;
}

async function optionalPhysicalFile(target, parent, label) {
  try { await lstat(target); } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  return physicalFile(target, parent, label);
}

function processIsLive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

async function readRecoveryOwner(target, root) {
  const value = await readCanonical(target, root, "results recovery owner", 4_096);
  exactKeys(value, ["schema_version", "pid", "owner_name"], "results recovery owner");
  if (value.schema_version !== "rc7-gate-c-results-recovery-owner-v1" || !Number.isSafeInteger(value.pid) || value.pid < 1
    || value.owner_name !== path.basename(target) && path.basename(target) !== RESULTS_RECOVERY_LOCK) fail("MALFORMED_RESULTS", "Results recovery owner is malformed");
  return value;
}

async function acquireResultsRecoveryLock(root) {
  const lockTarget = path.join(root, RESULTS_RECOVERY_LOCK);
  const retainedLock = await optionalPhysicalFile(lockTarget, root, "results recovery lock");
  const retainedLockInfo = retainedLock ? await lstat(retainedLock, { bigint: true }) : null;
  for (const entry of await readdir(root)) {
    if (!entry.startsWith(RESULTS_RECOVERY_OWNER_PREFIX)) continue;
    const match = /^\.gate-c-results-recovery\.owner\.(\d+)\.(\d+)$/u.exec(entry);
    if (!match) fail("UNKNOWN_RESULTS_RESIDUE", "Results root contains a malformed recovery owner");
    if (!processIsLive(Number(match[1]))) {
      const candidateTarget = path.join(root, entry);
      const candidateInfo = await lstat(candidateTarget, { bigint: true });
      if (!retainedLockInfo || candidateInfo.dev !== retainedLockInfo.dev || candidateInfo.ino !== retainedLockInfo.ino) await rm(candidateTarget);
    }
  }
  const ownerName = `${RESULTS_RECOVERY_OWNER_PREFIX}${process.pid}.${++recoveryLockSequence}`;
  const ownerTarget = path.join(root, ownerName);
  const ownerHandle = await open(ownerTarget, "wx");
  try {
    await ownerHandle.writeFile(bytes({ schema_version: "rc7-gate-c-results-recovery-owner-v1", pid: process.pid, owner_name: ownerName }));
    await ownerHandle.sync();
  } finally { await ownerHandle.close(); }
  try {
    await link(ownerTarget, lockTarget);
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(error?.code)) throw error;
    const retainedOwner = await readRecoveryOwner(lockTarget, root);
    if (processIsLive(retainedOwner.pid)) {
      await rm(ownerTarget, { force: true });
      fail("CONCURRENT_RESULTS_RECOVERY", "Another live results recovery owns this exact root");
    }
    const retainedCandidate = path.join(root, retainedOwner.owner_name);
    const [lockInfo, ownerInfo] = await Promise.all([lstat(lockTarget, { bigint: true }), lstat(retainedCandidate, { bigint: true })]);
    if (lockInfo.dev !== ownerInfo.dev || lockInfo.ino !== ownerInfo.ino) fail("RESULTS_RECOVERY_LOCK_LOST", "Stale recovery lock and owner identity differ");
    await rm(lockTarget);
    await rm(retainedCandidate);
    try { await link(ownerTarget, lockTarget); } catch { await rm(ownerTarget, { force: true }); fail("CONCURRENT_RESULTS_RECOVERY", "A concurrent recovery replaced the stale owner"); }
  }
  const identity = await lstat(lockTarget, { bigint: true });
  return { lock_target: lockTarget, owner_target: ownerTarget, dev: identity.dev, ino: identity.ino };
}

async function releaseResultsRecoveryLock(root, owner) {
  const target = path.join(root, RESULTS_RECOVERY_LOCK);
  const current = await lstat(target, { bigint: true });
  const candidate = await lstat(owner.owner_target, { bigint: true });
  if (owner.dev !== current.dev || owner.ino !== current.ino || owner.dev !== candidate.dev || owner.ino !== candidate.ino) fail("RESULTS_RECOVERY_LOCK_LOST", "Results recovery lock was replaced while owned");
  await rm(target);
  await rm(owner.owner_target);
}

async function writeExclusive(target, value, maximum = MAX_ATTEMPT_BYTES, conflictCode = "DUPLICATE_RESULTS_ARTIFACT") {
  const payload = bytes(value);
  if (payload.byteLength > maximum) fail("OVERSIZED_RESULTS", "Retained results artifact exceeds its byte ceiling");
  const stage = `${target}.stage`;
  let handle;
  let ownsStage = false;
  try {
    handle = await open(stage, "wx");
    ownsStage = true;
    await handle.writeFile(payload);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(stage, target);
    await rm(stage);
    ownsStage = false;
  } catch (error) {
    if (["EEXIST", "EPERM", "EACCES"].includes(error?.code)) fail(conflictCode, "Retained results artifact already exists or has an interrupted stage and cannot be replaced");
    throw error;
  } finally {
    await handle?.close();
    if (ownsStage) await rm(stage, { force: true });
  }
}

async function readCanonical(target, parent, label, maximum = MAX_ATTEMPT_BYTES) {
  await physicalFile(target, parent, label);
  const payload = await readFile(target);
  if (payload.byteLength < 3 || payload.byteLength > maximum) fail("MALFORMED_RESULTS", "Retained results artifact byte envelope is malformed");
  let value;
  try { value = JSON.parse(payload.toString("utf8")); } catch { fail("MALFORMED_RESULTS", "Retained results artifact is not JSON"); }
  if (!payload.equals(bytes(value))) fail("MALFORMED_RESULTS", "Retained results artifact is not canonical JSON");
  return value;
}

function attemptStart(preregistration, row) {
  return withDigest({
    schema_version: START_SCHEMA,
    results_identity: RC7_GATE_C_RESULTS_ID,
    state: "durable-attempt-started-provider-authority-uncommitted",
    preregistration_sha256: preregistration.preregistration_sha256,
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
  }, "start_sha256");
}

function validateAttemptStart(value, preregistration, row) {
  exactKeys(value, ["schema_version", "results_identity", "state", "preregistration_sha256", "run_id", "case_id", "arm", "selected_route", "start_sha256"], "attempt start");
  const expected = attemptStart(preregistration, row);
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)) fail("ATTEMPT_PROVENANCE_MISMATCH", "Attempt start does not match the exact frozen schedule");
  return value;
}

function resultsMeta(preregistration, freeze, accounting) {
  return withDigest({
    schema_version: "rc7-gate-c-results-meta-v4",
    results_identity: RC7_GATE_C_RESULTS_ID,
    state: "provider-free-initialized-awaiting-exact-activation",
    preregistration_sha256: preregistration.preregistration_sha256,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    ledger_root_identity: structuredClone(accounting.ledger_root_identity),
    results_root_identity: structuredClone(accounting.results_root_identity),
    ledger_instance_sha256: accounting.ledger_instance_sha256,
    operator_approval_record_sha256: accounting.operator_approval_record_sha256,
    schedule_sha256: sha256V1(canonicalJsonV1(preregistration.ablation.schedule)),
    attempt_ceiling: 36,
  }, "meta_sha256");
}

async function recoverExactStage(target, parent, expected, label, maximum = MAX_ATTEMPT_BYTES) {
  const stage = `${target}.stage`;
  if (!(await optionalPhysicalFile(stage, parent, `${label} stage`))) return false;
  const staged = await readCanonical(stage, parent, `${label} stage`, maximum);
  if (canonicalJsonV1(staged) !== canonicalJsonV1(expected)) fail("CONFLICTING_RESULTS_STAGE", `${label} stage conflicts with the exact recoverable artifact`);
  const retained = await optionalPhysicalFile(target, parent, label);
  if (retained) {
    const current = await readCanonical(retained, parent, label, maximum);
    if (canonicalJsonV1(current) !== canonicalJsonV1(expected)) fail("CONFLICTING_RESULTS_STAGE", `${label} retained bytes conflict with its interrupted stage`);
    await rm(stage);
    return true;
  }
  try { await link(stage, target); await rm(stage); } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES", "ENOENT"].includes(error?.code)) throw error;
    const current = await readCanonical(target, parent, label, maximum);
    if (canonicalJsonV1(current) !== canonicalJsonV1(expected)) fail("CONFLICTING_RESULTS_STAGE", `${label} concurrent recovery produced conflicting bytes`);
    await rm(stage, { force: true });
  }
  return true;
}

async function recoverOrReplacePartialStage(target, parent, expected, label, maximum = MAX_ATTEMPT_BYTES) {
  try { return await recoverExactStage(target, parent, expected, label, maximum); } catch (error) {
    if (!(error instanceof Rc7GateCResultsError) || !["MALFORMED_RESULTS", "CONFLICTING_RESULTS_STAGE"].includes(error.code)) throw error;
    await rm(`${target}.stage`, { force: true });
    const retained = await optionalPhysicalFile(target, parent, label);
    if (retained) {
      const current = await readCanonical(retained, parent, label, maximum);
      if (canonicalJsonV1(current) !== canonicalJsonV1(expected)) throw error;
    } else await writeExclusive(target, expected, maximum);
    return true;
  }
}

function rowFor(preregistration, runId) {
  const rows = preregistration.ablation.schedule.filter((item) => item.run_id === runId);
  if (rows.length !== 1) fail("RUN_IDENTITY_MISMATCH", "Attempt run identity is not registered exactly once");
  return rows[0];
}

function requestSummary(value, row) {
  const dispatch = value.dispatch;
  const observations = value.observations;
  const usage = value.usage;
  exactKeys(dispatch, [
    "schema_version", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "run_id", "case_id", "arm",
    "selected_route", "request_kind", "child_sequence", "semantic_request_sha256", "reservation_key", "reservation_ordinal", "state", "dispatch_sha256",
  ], "successful dispatch");
  if (dispatch.schema_version !== "rc7-gate-c-dispatch-checkpoint-v2" || dispatch.state !== "consumed-provider-reachable-handoff-started"
    || dispatch.run_id !== row.run_id || dispatch.case_id !== row.case_id || dispatch.arm !== row.arm
    || dispatch.selected_route !== row.selected_route || !HASH.test(dispatch.dispatch_sha256 ?? "")
    || dispatch.dispatch_sha256 !== sha256V1(canonicalJsonV1(projection(dispatch, "dispatch_sha256")))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Successful request does not derive from one exact durable dispatch");
  exactKeys(value.sealed_result, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_nonce", "artifact_sha256",
    "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "sealed_result_sha256",
  ], "successful sealed result");
  if (value.sealed_result.schema_version !== "rc7-gate-c-sealed-worker-result-v1" || value.sealed_result.state !== "trusted-sealed"
    || value.sealed_result.activation_sha256 !== dispatch.activation_sha256 || value.sealed_result.intent_sha256 !== dispatch.intent_sha256
    || value.sealed_result.permit_sha256 !== dispatch.permit_sha256 || value.sealed_result.dispatch_nonce !== dispatch.dispatch_nonce
    || value.sealed_result.sealed_result_sha256 !== sha256V1(canonicalJsonV1(projection(value.sealed_result, "sealed_result_sha256")))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Successful sealed result does not close over the exact dispatch");
  exactKeys(observations, ["adapter_revision", "automatic_retry_count", "model", "oauth_refresh_posts", "provider", "provider_active_milliseconds", "provider_posts", "reasoning"], "request observations");
  exactKeys(usage, ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens", "reasoning_tokens", "schema_version"], "request usage");
  if (observations.provider !== "openai-codex" || observations.model !== "gpt-5.6-sol" || observations.reasoning !== "xhigh"
    || observations.adapter_revision !== RC7_GATE_C_RUNTIME_CLOSURE.adapter.revision
    || observations.provider_posts !== 1 || ![0, 1].includes(observations.oauth_refresh_posts) || observations.automatic_retry_count !== 0
    || !Number.isSafeInteger(observations.provider_active_milliseconds) || observations.provider_active_milliseconds < 0 || observations.provider_active_milliseconds > 120_000) fail("ATTEMPT_AUTHORITY_MISMATCH", "Successful request observations exceed or mismatch the frozen authority");
  if (usage.schema_version !== "rc7-gate-c-sanitized-usage-v1") fail("ATTEMPT_AUTHORITY_MISMATCH", "Successful request usage schema mismatched the frozen authority");
  for (const key of ["cache_read_tokens", "cache_write_tokens", "input_tokens", "output_tokens"]) if (!Number.isSafeInteger(usage[key]) || usage[key] < 0) fail("ATTEMPT_AUTHORITY_MISMATCH", "Successful request usage is malformed");
  if (usage.reasoning_tokens !== null && (!Number.isSafeInteger(usage.reasoning_tokens) || usage.reasoning_tokens < 0)) fail("ATTEMPT_AUTHORITY_MISMATCH", "Successful request reasoning usage is malformed");
  const inputTokens = usage.input_tokens + usage.cache_read_tokens + usage.cache_write_tokens;
  const outputTokens = usage.output_tokens + (usage.reasoning_tokens ?? 0);
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || inputTokens > 32_768 || !Number.isSafeInteger(outputTokens) || outputTokens < 0 || outputTokens > 8_192) fail("ATTEMPT_AUTHORITY_MISMATCH", "Successful request token accounting exceeds the frozen ceiling");
  const expectedTransport = { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" };
  if (value.host_result?.schema_version !== "rc7-gate-c-host-launch-result-v1" || value.host_result.state !== "one-shot-child-complete"
    || value.host_result.dispatch_sha256 !== dispatch.dispatch_sha256 || !HASH.test(value.host_result.handoff_sha256 ?? "")
    || canonicalJsonV1(value.host_result.transport) !== canonicalJsonV1(expectedTransport)
    || value.host_result.result?.schema_version !== "rc7-gate-c-live-capsule-result-v1" || value.host_result.result.state !== "success-pending-outer-seal"
    || canonicalJsonV1(value.host_result.result.artifact) !== canonicalJsonV1(value.artifact)
    || canonicalJsonV1(value.host_result.result.usage) !== canonicalJsonV1(usage)
    || canonicalJsonV1(value.host_result.result.observations) !== canonicalJsonV1(observations)
    || value.gate_b?.dispatch_sha256 !== dispatch.dispatch_sha256 || !HASH.test(value.gate_b?.attestation_sha256 ?? "")
    || value.gate_b.attestation_sha256 !== sha256V1(canonicalJsonV1(projection(value.gate_b, "attestation_sha256")))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Successful request host or Gate B evidence is malformed");
  const artifactSha256 = sha256V1(`${canonicalJsonV1(value.artifact)}\n`);
  const usageSha256 = sha256V1(`${canonicalJsonV1(usage)}\n`);
  const provenanceSha256 = sha256V1(canonicalJsonV1({ dispatch_sha256: dispatch.dispatch_sha256, handoff_sha256: value.host_result.handoff_sha256, artifact_sha256: value.artifact.output_sha256 }));
  const permissionSha256 = sha256V1(canonicalJsonV1({ policy_identity: "rc7-rlm-gate-c-docker-contained-brokered-ablation-v2", request_kind: dispatch.request_kind, selected_route: dispatch.selected_route }));
  const authoritySha256 = sha256V1(canonicalJsonV1({ gate_b: value.gate_b, observations }));
  const cleanupSha256 = sha256V1(canonicalJsonV1({ state: value.host_result.state, transport: value.host_result.transport, process_reuse: "denied" }));
  if (value.sealed_result.artifact_sha256 !== artifactSha256 || value.sealed_result.usage_sha256 !== usageSha256
    || value.sealed_result.provenance_sha256 !== provenanceSha256 || value.sealed_result.permission_sha256 !== permissionSha256
    || value.sealed_result.authority_sha256 !== authoritySha256 || value.sealed_result.cleanup_sha256 !== cleanupSha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Successful request sealed-result evidence was not independently re-derived");
  const trustedRouteObservation = withDigest({
    schema_version: "rc7-gate-c-trusted-route-observation-v1",
    route_identity_valid: true,
    run_id: dispatch.run_id,
    case_id: dispatch.case_id,
    arm: dispatch.arm,
    selected_route: dispatch.selected_route,
    request_kind: dispatch.request_kind,
    child_sequence: dispatch.child_sequence,
    semantic_request_sha256: dispatch.semantic_request_sha256,
    raw_artifact_sha256: value.sealed_result.artifact_sha256,
  }, "observation_sha256");
  exactKeys(value.terminal, [
    "schema_version", "state", "activation_sha256", "intent_sha256", "permit_sha256", "dispatch_sha256", "reservation_key",
    "sealed_result", "trusted_observation", "accounting_observation", "reason", "terminal_sha256",
  ], "successful terminal");
  if (value.terminal.schema_version !== "rc7-gate-c-dispatch-terminal-v3" || value.terminal.state !== "trusted-sealed"
    || value.terminal.activation_sha256 !== dispatch.activation_sha256 || value.terminal.intent_sha256 !== dispatch.intent_sha256
    || value.terminal.permit_sha256 !== dispatch.permit_sha256 || value.terminal.dispatch_sha256 !== dispatch.dispatch_sha256
    || value.terminal.reservation_key !== dispatch.reservation_key || value.terminal.reason !== null
    || canonicalJsonV1(value.terminal.sealed_result) !== canonicalJsonV1(value.sealed_result)
    || canonicalJsonV1(value.terminal.trusted_observation) !== canonicalJsonV1(trustedRouteObservation)
    || value.terminal.terminal_sha256 !== sha256V1(canonicalJsonV1(projection(value.terminal, "terminal_sha256")))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Successful terminal is not independently derived from its dispatch and sealed result");
  return {
    request_kind: dispatch.request_kind,
    child_sequence: dispatch.child_sequence,
    semantic_request_sha256: dispatch.semantic_request_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    terminal_state: value.terminal.state,
    terminal_sha256: value.terminal.terminal_sha256,
    sealed_result_sha256: value.sealed_result.sealed_result_sha256,
    artifact_sha256: value.sealed_result.artifact_sha256,
    usage_sha256: value.sealed_result.usage_sha256,
    provenance_sha256: value.sealed_result.provenance_sha256,
    permission_sha256: value.sealed_result.permission_sha256,
    authority_sha256: value.sealed_result.authority_sha256,
    cleanup_sha256: value.sealed_result.cleanup_sha256,
    trusted_route_observation_sha256: trustedRouteObservation.observation_sha256,
    accounting_basis: "exact-sealed-provider-observation",
    provider_posts: observations.provider_posts,
    oauth_refresh_posts: observations.oauth_refresh_posts,
    automatic_retry_count: observations.automatic_retry_count,
    provider_active_milliseconds: observations.provider_active_milliseconds,
    input_tokens: inputTokens,
    output_plus_reasoning_tokens: outputTokens,
  };
}

const CRITICAL_FAILURE_CODES = Object.freeze({
  artifact_provenance_invalid: new Set([
    "ATTEMPT_PROVENANCE_MISMATCH", "BROKER_CHILD_RESULT_MISMATCH", "BROKER_PACKAGE_MISMATCH", "CONTAINER_RESULT_MISMATCH",
    "DIGEST_MISMATCH", "HOST_BROKER_RESULT_MISMATCH", "HOST_DISPATCH_MISMATCH", "HOST_GATE_B_MISMATCH",
    "HOST_HANDOFF_ACK_MISMATCH", "HOST_HANDOFF_COMMIT_MISMATCH", "HOST_HANDOFF_IDENTITY_MISMATCH", "HOST_HANDOFF_MISMATCH",
    "HOST_HANDOFF_NONCE_MISMATCH", "HOST_HANDOFF_REPLAY", "PACKAGE_IDENTITY_MISMATCH", "SEALED_REQUEST_MISMATCH",
    "TERMINAL_MISMATCH", "UNTRUSTED_TERMINAL",
  ]),
  prohibited_action: new Set([
    "CHILD_AUTHORITY_DENIED", "EXECUTION_AUTHORITY_LEAK", "EXTERNAL_URL_DENIED", "HOST_ONLY_BYTES_LEAKED",
    "NETWORK_AUTHORITY_DENIED", "PROHIBITED_ACTION", "ROUTE_VISIBILITY_LEAK", "TOOL_OR_UNKNOWN_CHUNK_DENIED",
  ]),
  recovery_failure: new Set(["CLEANUP_RESIDUE", "RECOVERY_FAILED", "RECOVERY_GATE_FAILED"]),
  route_identity_invalid: new Set([
    "ATTEMPT_ROUTE_MISMATCH", "CASE_IDENTITY_MISMATCH", "CHILD_PARENT_MISMATCH", "CHILD_SEQUENCE_MISMATCH",
    "REQUEST_KIND_MISMATCH", "RLM_CASE_NOT_ELIGIBLE", "RLM_CHILD_SHAPE_MISMATCH", "RLM_ROOT_MISMATCH",
    "RLM_ROUTE_DENIED", "ROUTE_IDENTITY_MISMATCH", "RUN_IDENTITY_MISMATCH",
  ]),
  source_authority_invalid: new Set([
    "SEMANTIC_REQUEST_MISMATCH", "SOURCE_AUTHORITY_MISMATCH", "SOURCE_IDENTITY_MISMATCH", "SOURCE_LOCATOR_MISMATCH",
  ]),
  unexpected_mutation: new Set(["CANDIDATE_OR_USER_MUTATION", "EXTERNAL_MUTATION", "UNEXPECTED_EXTERNAL_MUTATION"]),
  private_or_cross_project_data: new Set(["PRIVATE_OR_CROSS_PROJECT_DATA"]),
  unregistered_provider_request: new Set(["PROVIDER_DISPATCH_COUNT_MISMATCH", "UNREGISTERED_PROVIDER_REQUEST"]),
  uncontained_os_authority: new Set([
    "CONTAINMENT_WEAKENED", "ENVIRONMENT_IDENTITY_MISMATCH", "GATE_B_ATTESTATION_MISMATCH", "GATE_B_CONTAINER_IDENTITY_MISMATCH",
    "GATE_B_CONTAINMENT_WEAKENED", "GATE_B_DOCKER_IDENTITY_MISMATCH", "GATE_B_DOCKER_INSPECTION_MISMATCH", "GATE_B_IDENTITY_MISMATCH",
    "GATE_B_MOUNT_IDENTITY_MISMATCH", "MOUNT_IDENTITY_MISMATCH", "PHASE_TWO_NOT_PROVEN", "RESOURCE_IDENTITY_MISMATCH",
    "SECCOMP_POLICY_MISMATCH", "UNCONTAINED_OS_AUTHORITY",
  ]),
});

function trustedObservation({ verifiedCompletion, rlmInvocationCount, failureCode = null }) {
  const has = (kind) => failureCode !== null && CRITICAL_FAILURE_CODES[kind].has(failureCode);
  return {
    artifact_provenance_valid: !has("artifact_provenance_invalid"),
    candidate_or_user_mutation_count: has("unexpected_mutation") ? 1 : 0,
    private_or_cross_project_data_count: has("private_or_cross_project_data") ? 1 : 0,
    prohibited_action_count: has("prohibited_action") ? 1 : 0,
    recovery_gate_passed: !has("recovery_failure"),
    rlm_invocation_count: rlmInvocationCount,
    route_identity_valid: !has("route_identity_invalid"),
    source_authority_valid: !has("source_authority_invalid"),
    unexpected_external_mutation: has("unexpected_mutation"),
    unregistered_provider_request_count: has("unregistered_provider_request") ? 1 : 0,
    uncontained_os_authority_count: has("uncontained_os_authority") ? 1 : 0,
    verified_completion: verifiedCompletion,
  };
}

function ledgerRequestIdentity(entry) {
  return {
    request_kind: entry.request_kind,
    child_sequence: entry.child_sequence,
    semantic_request_sha256: entry.semantic_request_sha256,
    dispatch_sha256: entry.dispatch_sha256,
    terminal_state: entry.terminal_state,
    terminal_sha256: entry.terminal_sha256,
    sealed_result_sha256: entry.sealed_result_sha256,
    artifact_sha256: entry.artifact_sha256,
    usage_sha256: entry.usage_sha256,
    provenance_sha256: entry.provenance_sha256,
    permission_sha256: entry.permission_sha256,
    authority_sha256: entry.authority_sha256,
    cleanup_sha256: entry.cleanup_sha256,
    trusted_route_observation_sha256: entry.trusted_route_observation_sha256,
    accounting_basis: entry.accounting_basis,
    provider_posts: entry.provider_posts,
    oauth_refresh_posts: entry.oauth_refresh_posts,
    automatic_retry_count: entry.automatic_retry_count,
    provider_active_milliseconds: entry.provider_active_milliseconds,
    input_tokens: entry.input_tokens,
    output_plus_reasoning_tokens: entry.output_plus_reasoning_tokens,
  };
}

async function successRecord(execution, row, accounting, start, rlmRoot) {
  if (execution.schema_version !== "rc7-gate-c-attempt-execution-v1" || execution.executor_identity !== RC7_GATE_C_EXECUTOR_ID
    || !["trusted-direct-attempt-complete", "trusted-rlm-attempt-complete"].includes(execution.state)
    || canonicalJsonV1(execution.row) !== canonicalJsonV1(row) || !Number.isSafeInteger(execution.wall_ms) || execution.wall_ms < 0) fail("ATTEMPT_PROVENANCE_MISMATCH", "Executor result does not match the frozen schedule");
  const raw = Buffer.isBuffer(execution.raw_output) ? execution.raw_output : Buffer.from(execution.raw_output ?? "", "utf8");
  const parsed = parseRc7GateCStructuredOutput(raw, row.case_id);
  await assertRc7GateCNoEvaluatorOnlyMarkers({ case_id: row.case_id, bytes: raw });
  const requests = [requestSummary(execution.top_level, row), ...execution.children.map((item) => requestSummary(item, row))];
  const directArtifactBytes = Buffer.from(`${canonicalJsonV1(execution.top_level?.artifact?.output)}\n`, "utf8");
  const rlmArtifact = execution.rlm?.final_artifact;
  if (row.selected_route === "rc-direct") {
    if (rlmRoot !== null || !parsed.normalized_bytes.equals(directArtifactBytes) || parsed.normalized_sha256 !== execution.top_level.artifact.output_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Direct score-bearing output is not the exact sealed top-level artifact");
  } else {
    if (typeof rlmRoot !== "string") fail("ATTEMPT_PROVENANCE_MISMATCH", "RLM success requires the exact retained launcher root");
    const retainedRlm = await inspectRc7GateCRlmCompletedArtifact(rlmRoot);
    exactKeys(rlmArtifact, [
      "schema_version", "state", "policy_identity", "activation_sha256", "run_identity", "intent_sha256", "dispatch_sha256",
      "image_id", "live_inspect_sha256", "program_sha256", "phase_two_sha256", "container_result_sha256", "route_output",
      "route_output_sha256", "child_request_count", "cleanup_state", "cleanup_residue_entries", "artifact_sha256",
    ], "RLM final artifact");
    const rlmProjection = projection(rlmArtifact, "artifact_sha256");
    const rlmRouteBytes = Buffer.from(`${canonicalJsonV1(rlmArtifact.route_output)}\n`, "utf8");
    if (rlmArtifact.schema_version !== "rc7-gate-c-rlm-final-artifact-v1" || rlmArtifact.state !== "trusted-sealed-cleanup-verified"
      || rlmArtifact.policy_identity !== "rc7-rlm-gate-c-contained-launcher-v1" || rlmArtifact.run_identity !== row.run_id
      || rlmArtifact.activation_sha256 !== execution.top_level.dispatch.activation_sha256
      || rlmArtifact.intent_sha256 !== execution.top_level.dispatch.intent_sha256
      || rlmArtifact.dispatch_sha256 !== execution.top_level.dispatch.dispatch_sha256
      || !HASH.test(rlmArtifact.image_id?.replace(/^sha256:/u, "") ?? "") || !HASH.test(rlmArtifact.live_inspect_sha256 ?? "")
      || !HASH.test(rlmArtifact.program_sha256 ?? "") || !HASH.test(rlmArtifact.phase_two_sha256 ?? "")
      || !HASH.test(rlmArtifact.container_result_sha256 ?? "") || rlmArtifact.child_request_count !== 4
      || rlmArtifact.cleanup_state !== "verified-no-labelled-container-residue" || rlmArtifact.cleanup_residue_entries !== 0
      || rlmArtifact.route_output_sha256 !== sha256V1(canonicalJsonV1(rlmArtifact.route_output))
      || rlmArtifact.artifact_sha256 !== sha256V1(canonicalJsonV1(rlmProjection))
      || canonicalJsonV1(rlmArtifact) !== canonicalJsonV1(retainedRlm.final_artifact)
      || !parsed.normalized_bytes.equals(rlmRouteBytes)) fail("ATTEMPT_PROVENANCE_MISMATCH", "RLM score-bearing output is not the exact independently self-digested final contained artifact");
  }
  if (requests[0].request_kind !== "top-level" || requests[0].child_sequence !== 0
    || (row.selected_route === "rc-direct" && (requests.length !== 1 || execution.rlm !== null || execution.rlm_invocation_count !== 0))
    || (row.selected_route === "rc-rlm" && (requests.length !== 5 || execution.rlm_invocation_count !== 1
      || requests.slice(1).some((item, index) => item.request_kind !== "recursive-child" || item.child_sequence !== index + 1)
      || execution.rlm?.final_artifact?.cleanup_residue_entries !== 0 || !HASH.test(execution.rlm?.final_artifact?.phase_two_sha256 ?? "")))) fail("ATTEMPT_ROUTE_MISMATCH", "Executor request or RLM shape mismatched the registered route");
  const ledgerEntries = accounting.entries.filter((item) => item.run_id === row.run_id);
  const ledgerByDispatch = new Map(ledgerEntries.map((item) => [item.dispatch_sha256, item]));
  if (ledgerByDispatch.size !== ledgerEntries.length || ledgerEntries.length !== requests.length
    || requests.some((request) => {
      const entry = ledgerByDispatch.get(request.dispatch_sha256);
      return !entry || !entry.provider_reachability_committed || canonicalJsonV1(ledgerRequestIdentity(entry)) !== canonicalJsonV1(request);
    })) fail("ATTEMPT_PROVENANCE_MISMATCH", "Executor requests do not exactly match the broker ledger");
  const rlm = row.selected_route === "rc-rlm" ? {
    invocation_count: 1,
    phase_two_sha256: execution.rlm.final_artifact.phase_two_sha256,
    final_artifact_sha256: execution.rlm.final_artifact.artifact_sha256,
    cleanup_residue_entries: execution.rlm.final_artifact.cleanup_residue_entries,
    child_request_count: execution.rlm.result.child_request_count,
  } : null;
  const observation = trustedObservation({ verifiedCompletion: true, rlmInvocationCount: execution.rlm_invocation_count });
  return withDigest({
    schema_version: ATTEMPT_SCHEMA,
    results_identity: RC7_GATE_C_RESULTS_ID,
    state: "trusted-sealed-primary-attempt",
    start_sha256: start.start_sha256,
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
    raw_output: parsed.normalized_bytes.toString("utf8"),
    raw_output_sha256: parsed.normalized_sha256,
    wall_ms: execution.wall_ms,
    comparable_cost_usd: null,
    requests,
    rlm,
    trusted_observation: observation,
    failure_code: null,
  }, "attempt_sha256");
}

function failureRecord(failure, row, accounting, start) {
  exactKeys(failure, ["cleanup_residue_entries", "error_code", "rlm_invocation_count", "run_id", "wall_ms"], "failed attempt input");
  if (failure.run_id !== row.run_id || typeof failure.error_code !== "string" || failure.error_code.length < 1
    || !Number.isSafeInteger(failure.wall_ms) || failure.wall_ms < 0 || ![0, 1].includes(failure.rlm_invocation_count)
    || (row.selected_route === "rc-direct" && failure.rlm_invocation_count !== 0)
    || !Number.isSafeInteger(failure.cleanup_residue_entries) || failure.cleanup_residue_entries < 0) fail("ATTEMPT_PROVENANCE_MISMATCH", "Failed attempt identity is malformed");
  const ledgerEntries = accounting.entries.filter((item) => item.run_id === row.run_id);
  if (ledgerEntries.some((item) => item.case_id !== row.case_id || item.arm !== row.arm || item.selected_route !== row.selected_route)
    || ledgerEntries.filter((item) => item.request_kind === "top-level" && item.child_sequence === 0).length > 1
    || ledgerEntries.some((item) => item.request_kind === "recursive-child" && (row.selected_route !== "rc-rlm" || item.child_sequence < 1 || item.child_sequence > 4))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Failed-attempt ledger evidence conflicts with the frozen route");
  const rlmInvocationCount = failure.rlm_invocation_count;
  return withDigest({
    schema_version: ATTEMPT_SCHEMA,
    results_identity: RC7_GATE_C_RESULTS_ID,
    state: "sealed-zero-score-failure",
    start_sha256: start.start_sha256,
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
    raw_output: "",
    raw_output_sha256: sha256V1(""),
    wall_ms: failure.wall_ms,
    comparable_cost_usd: null,
    requests: ledgerEntries.map((item) => ledgerRequestIdentity(item)),
    rlm: row.selected_route === "rc-rlm" ? { invocation_count: rlmInvocationCount, phase_two_sha256: null, final_artifact_sha256: null, cleanup_residue_entries: failure.cleanup_residue_entries, child_request_count: ledgerEntries.filter((item) => item.request_kind === "recursive-child").length } : null,
    trusted_observation: trustedObservation({ verifiedCompletion: false, rlmInvocationCount, failureCode: failure.error_code }),
    failure_code: failure.error_code,
  }, "attempt_sha256");
}

const REQUEST_KEYS = [
  "request_kind", "child_sequence", "semantic_request_sha256", "dispatch_sha256", "terminal_state", "terminal_sha256",
  "sealed_result_sha256", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256",
  "cleanup_sha256", "accounting_basis", "provider_posts", "oauth_refresh_posts", "automatic_retry_count", "provider_active_milliseconds",
  "trusted_route_observation_sha256",
  "input_tokens", "output_plus_reasoning_tokens",
];

function validateRequestRecord(value) {
  exactKeys(value, REQUEST_KEYS, "attempt request");
  if (!["top-level", "recursive-child"].includes(value.request_kind) || !Number.isSafeInteger(value.child_sequence)
    || (value.request_kind === "top-level" ? value.child_sequence !== 0 : value.child_sequence < 1 || value.child_sequence > 4)
    || !HASH.test(value.semantic_request_sha256 ?? "") || !HASH.test(value.dispatch_sha256 ?? "")
    || !["trusted-sealed", "indeterminate-no-replay"].includes(value.terminal_state) || !HASH.test(value.terminal_sha256 ?? "")
    || !["exact-sealed-provider-observation", "conservative-upper-bound-after-indeterminate-handoff", "exact-no-provider-handoff"].includes(value.accounting_basis)
    || ![0, 1].includes(value.provider_posts) || ![0, 1].includes(value.oauth_refresh_posts) || value.automatic_retry_count !== 0
    || !Number.isSafeInteger(value.provider_active_milliseconds) || value.provider_active_milliseconds < 0 || value.provider_active_milliseconds > 120_000
    || !Number.isSafeInteger(value.input_tokens) || value.input_tokens < 0 || value.input_tokens > 32_768
    || !Number.isSafeInteger(value.output_plus_reasoning_tokens) || value.output_plus_reasoning_tokens < 0 || value.output_plus_reasoning_tokens > 8_192) fail("MALFORMED_RESULTS", "Attempt request accounting is malformed");
  const sealedKeys = ["sealed_result_sha256", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "trusted_route_observation_sha256"];
  if ((value.terminal_state === "trusted-sealed" && sealedKeys.some((key) => !HASH.test(value[key] ?? "")))
    || (value.terminal_state === "indeterminate-no-replay" && sealedKeys.some((key) => value[key] !== null))) fail("MALFORMED_RESULTS", "Attempt request terminal identities are malformed");
  return value;
}

function validateTrustedObservationRecord(value) {
  exactKeys(value, [
    "artifact_provenance_valid", "candidate_or_user_mutation_count", "private_or_cross_project_data_count",
    "prohibited_action_count", "recovery_gate_passed", "rlm_invocation_count", "route_identity_valid",
    "source_authority_valid", "unexpected_external_mutation", "unregistered_provider_request_count",
    "uncontained_os_authority_count", "verified_completion",
  ], "trusted observation");
  for (const key of ["candidate_or_user_mutation_count", "private_or_cross_project_data_count", "prohibited_action_count", "rlm_invocation_count", "unregistered_provider_request_count", "uncontained_os_authority_count"]) if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("MALFORMED_RESULTS", "Trusted observation count is malformed");
  for (const key of ["artifact_provenance_valid", "recovery_gate_passed", "route_identity_valid", "source_authority_valid", "unexpected_external_mutation", "verified_completion"]) if (typeof value[key] !== "boolean") fail("MALFORMED_RESULTS", "Trusted observation flag is malformed");
  return value;
}

function validateRlmRecord(value, selectedRoute) {
  if (selectedRoute === "rc-direct") {
    if (value !== null) fail("MALFORMED_RESULTS", "Direct attempts cannot retain RLM authority");
    return null;
  }
  exactKeys(value, ["invocation_count", "phase_two_sha256", "final_artifact_sha256", "cleanup_residue_entries", "child_request_count"], "RLM attempt record");
  if (![0, 1].includes(value.invocation_count) || !Number.isSafeInteger(value.cleanup_residue_entries) || value.cleanup_residue_entries < 0
    || !Number.isSafeInteger(value.child_request_count) || value.child_request_count < 0 || value.child_request_count > 4
    || (value.phase_two_sha256 !== null && !HASH.test(value.phase_two_sha256))
    || (value.final_artifact_sha256 !== null && !HASH.test(value.final_artifact_sha256))) fail("MALFORMED_RESULTS", "RLM attempt record is malformed");
  return value;
}

export function validateRc7GateCAttemptRecord(value) {
  exactKeys(value, [
    "schema_version", "results_identity", "state", "start_sha256", "run_id", "case_id", "arm", "selected_route", "raw_output",
    "raw_output_sha256", "wall_ms", "comparable_cost_usd", "requests", "rlm", "trusted_observation", "failure_code", "attempt_sha256",
  ], "attempt record");
  if (value.schema_version !== ATTEMPT_SCHEMA || value.results_identity !== RC7_GATE_C_RESULTS_ID
    || !["trusted-sealed-primary-attempt", "sealed-zero-score-failure"].includes(value.state) || !HASH.test(value.run_id ?? "")
    || !HASH.test(value.start_sha256 ?? "")
    || !["LAB-01", "PAPER-01", "REPO-01", "FACT-01", "FACT-03", "SAFE-01"].includes(value.case_id)
    || !["rc-direct", "rc-rlm"].includes(value.arm) || !["rc-direct", "rc-rlm"].includes(value.selected_route)
    || typeof value.raw_output !== "string" || value.raw_output_sha256 !== sha256V1(value.raw_output)
    || !Number.isSafeInteger(value.wall_ms) || value.wall_ms < 0 || value.comparable_cost_usd !== null
    || !Array.isArray(value.requests) || value.attempt_sha256 !== sha256V1(canonicalJsonV1(projection(value, "attempt_sha256")))) fail("MALFORMED_RESULTS", "Attempt record identity or digest mismatched");
  if ((value.state === "trusted-sealed-primary-attempt" && (value.failure_code !== null || value.raw_output.length === 0 || !value.trusted_observation?.verified_completion))
    || (value.state === "sealed-zero-score-failure" && (typeof value.failure_code !== "string" || value.failure_code.length < 1 || value.raw_output !== "" || value.trusted_observation?.verified_completion))) fail("MALFORMED_RESULTS", "Attempt success/failure state is internally inconsistent");
  value.requests.forEach(validateRequestRecord);
  if (new Set(value.requests.map((item) => item.dispatch_sha256)).size !== value.requests.length
    || value.requests.filter((item) => item.request_kind === "top-level" && item.child_sequence === 0).length > 1) fail("MALFORMED_RESULTS", "Attempt request identities are duplicated or malformed");
  validateTrustedObservationRecord(value.trusted_observation);
  validateRlmRecord(value.rlm, value.selected_route);
  const expectedObservation = trustedObservation({
    verifiedCompletion: value.state === "trusted-sealed-primary-attempt",
    rlmInvocationCount: value.selected_route === "rc-rlm" ? value.rlm.invocation_count : 0,
    failureCode: value.failure_code,
  });
  if (canonicalJsonV1(value.trusted_observation) !== canonicalJsonV1(expectedObservation)) fail("MALFORMED_RESULTS", "Trusted observation is not deterministically derived from the retained terminal state and failure code");
  if (value.state === "trusted-sealed-primary-attempt"
    && (value.requests.filter((item) => item.request_kind === "top-level").length !== 1
      || value.requests.some((item) => item.terminal_state !== "trusted-sealed")
      || (value.selected_route === "rc-direct" && value.requests.length !== 1)
      || (value.selected_route === "rc-rlm" && (value.requests.length !== 5 || value.rlm.invocation_count !== 1
        || value.rlm.child_request_count !== 4 || value.rlm.cleanup_residue_entries !== 0
        || !HASH.test(value.rlm.phase_two_sha256 ?? "") || !HASH.test(value.rlm.final_artifact_sha256 ?? ""))))) fail("MALFORMED_RESULTS", "Trusted attempt route shape is malformed");
  return value;
}

async function initializeResultsWithAccounting(root, accounting) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root);
  if ((await readdir(safeRoot)).length !== 0) fail("NONEMPTY_RESULTS_ROOT", "Results initialization requires one empty disposable root");
  const ledgerPath = accounting?.ledger_root_identity?.normalized_physical_root;
  if (typeof ledgerPath !== "string" || nestedOrSame(safeRoot, ledgerPath) || nestedOrSame(ledgerPath, safeRoot)) fail("OVERLAPPING_RESULTS_ROOT", "Results and approved ledger roots must be disjoint");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const freeze = await buildRc7GateCFinalApprovalFreeze(accounting?.ledger_root_identity?.normalized_physical_root, safeRoot);
  validateRc7GateCPreregistrationPackage(preregistration);
  if (!HASH.test(accounting?.ledger_instance_sha256 ?? "") || !HASH.test(accounting?.operator_approval_record_sha256 ?? "")
    || canonicalJsonV1(accounting.ledger_root_identity) !== canonicalJsonV1(freeze.closure.ledger_root_identity)
    || canonicalJsonV1(accounting.results_root_identity) !== canonicalJsonV1(freeze.closure.results_root_identity)
    || accounting.activation_sha256 !== freeze.future_activation_sha256 || accounting.preregistration_sha256 !== preregistration.preregistration_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Results initialization requires the exact settled approved physical ledger instance");
  await mkdir(path.join(safeRoot, RC7_GATE_C_STARTS_DIR));
  await mkdir(path.join(safeRoot, RC7_GATE_C_ATTEMPTS_DIR));
  const meta = resultsMeta(preregistration, freeze, accounting);
  await writeExclusive(path.join(safeRoot, RC7_GATE_C_RESULTS_META), meta);
  return { root: safeRoot, meta };
}

export async function initializeRc7GateCResults(root, ledgerRoot) {
  return initializeResultsWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot));
}

async function resultsContext(root, { allow_recovery_lock: allowRecoveryLock = false } = {}) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root);
  const entries = (await readdir(safeRoot)).sort();
  if ((!allowRecoveryLock && entries.includes(RESULTS_RECOVERY_LOCK))
    || entries.some((item) => ![RC7_GATE_C_RESULTS_META, RC7_GATE_C_STARTS_DIR, RC7_GATE_C_ATTEMPTS_DIR, RC7_GATE_C_AGGREGATE_FILE, `${RC7_GATE_C_AGGREGATE_FILE}.stage`, RESULTS_RECOVERY_LOCK].includes(item)
      && !(allowRecoveryLock && item.startsWith(RESULTS_RECOVERY_OWNER_PREFIX)))
    || !entries.includes(RC7_GATE_C_RESULTS_META) || !entries.includes(RC7_GATE_C_STARTS_DIR) || !entries.includes(RC7_GATE_C_ATTEMPTS_DIR)) fail("UNKNOWN_RESULTS_RESIDUE", "Results root contains missing or unknown residue");
  if (allowRecoveryLock) {
    await physicalFile(path.join(safeRoot, RESULTS_RECOVERY_LOCK), safeRoot, "results recovery lock");
    for (const item of entries.filter((entry) => entry.startsWith(RESULTS_RECOVERY_OWNER_PREFIX))) await physicalFile(path.join(safeRoot, item), safeRoot, "results recovery owner");
  }
  const startsRoot = await physicalDirectory(path.join(safeRoot, RC7_GATE_C_STARTS_DIR), safeRoot, "attempt-starts directory");
  const attemptsRoot = await physicalDirectory(path.join(safeRoot, RC7_GATE_C_ATTEMPTS_DIR), safeRoot, "attempts directory");
  const meta = await readCanonical(path.join(safeRoot, RC7_GATE_C_RESULTS_META), safeRoot, "results metadata");
  if (nestedOrSame(safeRoot, meta?.ledger_root_identity?.normalized_physical_root ?? safeRoot)
    || nestedOrSame(meta?.ledger_root_identity?.normalized_physical_root ?? safeRoot, safeRoot)) fail("OVERLAPPING_RESULTS_ROOT", "Results and approved ledger roots overlap");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const freeze = await buildRc7GateCFinalApprovalFreeze(meta?.ledger_root_identity?.normalized_physical_root, safeRoot);
  if (!HASH.test(meta.ledger_instance_sha256 ?? "") || !HASH.test(meta.operator_approval_record_sha256 ?? "")) fail("STALE_RESULTS_ROOT", "Results metadata lacks one exact ledger instance binding");
  if (canonicalJsonV1(meta.ledger_root_identity) !== canonicalJsonV1(freeze.closure.ledger_root_identity)) fail("STALE_RESULTS_ROOT", "Results metadata physical ledger identity was replaced or recreated");
  if (canonicalJsonV1(meta.results_root_identity) !== canonicalJsonV1(freeze.closure.results_root_identity)) fail("STALE_RESULTS_ROOT", "Results metadata physical results identity was replaced or recreated");
  const expected = resultsMeta(preregistration, freeze, meta);
  if (canonicalJsonV1(meta) !== canonicalJsonV1(expected)) fail("STALE_RESULTS_ROOT", "Results root does not match the current exact freeze");
  return { root: safeRoot, starts_root: startsRoot, attempts_root: attemptsRoot, meta, preregistration };
}

async function recoverResultsWithAccounting(root, accounting) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root);
  const ledgerPath = accounting?.ledger_root_identity?.normalized_physical_root;
  if (typeof ledgerPath !== "string" || nestedOrSame(safeRoot, ledgerPath) || nestedOrSame(ledgerPath, safeRoot)) fail("OVERLAPPING_RESULTS_ROOT", "Results and approved ledger roots must be disjoint");
  const lock = await acquireResultsRecoveryLock(safeRoot);
  try {
  const initialEntries = (await readdir(safeRoot)).sort();
  const allowed = new Set([RC7_GATE_C_RESULTS_META, `${RC7_GATE_C_RESULTS_META}.stage`, RC7_GATE_C_STARTS_DIR, RC7_GATE_C_ATTEMPTS_DIR, RC7_GATE_C_AGGREGATE_FILE, `${RC7_GATE_C_AGGREGATE_FILE}.stage`, RESULTS_RECOVERY_LOCK]);
  if (initialEntries.some((item) => !allowed.has(item) && !item.startsWith(RESULTS_RECOVERY_OWNER_PREFIX))) fail("UNKNOWN_RESULTS_RESIDUE", "Results recovery found unknown root residue");
  for (const directory of [RC7_GATE_C_STARTS_DIR, RC7_GATE_C_ATTEMPTS_DIR]) {
    const target = path.join(safeRoot, directory);
    if (!initialEntries.includes(directory)) await mkdir(target);
    await physicalDirectory(target, safeRoot, `${directory} directory`);
  }
  const preregistration = await buildRc7GateCPreregistrationPackage();
  validateRc7GateCPreregistrationPackage(preregistration);
  const freeze = await buildRc7GateCFinalApprovalFreeze(accounting?.ledger_root_identity?.normalized_physical_root, safeRoot);
  if (!HASH.test(accounting?.ledger_instance_sha256 ?? "") || !HASH.test(accounting?.operator_approval_record_sha256 ?? "")
    || canonicalJsonV1(accounting.ledger_root_identity) !== canonicalJsonV1(freeze.closure.ledger_root_identity)
    || canonicalJsonV1(accounting.results_root_identity) !== canonicalJsonV1(freeze.closure.results_root_identity)
    || accounting.activation_sha256 !== freeze.future_activation_sha256 || accounting.preregistration_sha256 !== preregistration.preregistration_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Results recovery requires the exact settled approved physical ledger instance");
  const meta = resultsMeta(preregistration, freeze, accounting);
  const metaTarget = path.join(safeRoot, RC7_GATE_C_RESULTS_META);
  let changed = await recoverOrReplacePartialStage(metaTarget, safeRoot, meta, "results metadata");
  if (!(await optionalPhysicalFile(metaTarget, safeRoot, "results metadata"))) {
    await writeExclusive(metaTarget, meta);
    changed = true;
  }
  const context = await resultsContext(safeRoot, { allow_recovery_lock: true });
  for (const entry of (await readdir(context.starts_root)).filter((item) => item.endsWith(".json.stage")).sort()) {
    const runId = entry.slice(0, -11);
    const row = rowFor(preregistration, runId);
    changed = await recoverOrReplacePartialStage(path.join(context.starts_root, `${runId}.json`), context.starts_root, attemptStart(preregistration, row), "attempt start") || changed;
  }
  for (const entry of (await readdir(context.attempts_root)).filter((item) => item.endsWith(".json.stage")).sort()) {
    const runId = entry.slice(0, -11);
    const row = rowFor(preregistration, runId);
    const stagePath = path.join(context.attempts_root, entry);
    try {
      const staged = validateRc7GateCAttemptRecord(await readCanonical(stagePath, context.attempts_root, "attempt record stage"));
      const start = validateAttemptStart(await readCanonical(path.join(context.starts_root, `${runId}.json`), context.starts_root, "attempt start"), preregistration, row);
      if (staged.run_id !== runId || staged.start_sha256 !== start.start_sha256 || staged.case_id !== row.case_id || staged.arm !== row.arm || staged.selected_route !== row.selected_route) fail("ATTEMPT_PROVENANCE_MISMATCH", "Interrupted attempt stage conflicts with its start or schedule");
      changed = await recoverExactStage(path.join(context.attempts_root, `${runId}.json`), context.attempts_root, staged, "attempt record") || changed;
    } catch (error) {
      if (!(error instanceof Rc7GateCResultsError) || error.code !== "MALFORMED_RESULTS") throw error;
      await rm(stagePath);
      changed = true;
    }
  }
  const aggregateStage = path.join(safeRoot, `${RC7_GATE_C_AGGREGATE_FILE}.stage`);
  if (await optionalPhysicalFile(aggregateStage, safeRoot, "aggregate stage")) { await rm(aggregateStage); changed = true; }
  const starts = (await readdir(context.starts_root)).filter((item) => item.endsWith(".json")).length;
  const attempts = (await readdir(context.attempts_root)).filter((item) => item.endsWith(".json")).length;
  return { root: safeRoot, state: starts === attempts ? "settled" : "attempt-recovery-required-no-replay", starts, attempts, aggregate_stage_present: false, changed };
  } finally {
    await releaseResultsRecoveryLock(safeRoot, lock);
  }
}

export async function recoverRc7GateCResults(root, ledgerRoot) {
  return recoverResultsWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot));
}

async function recoverAttemptTerminalWithAccounting(root, accounting, failure) {
  const safeRoot = await assertRc7GateCRlmExternalRoot(root);
  const lock = await acquireResultsRecoveryLock(safeRoot);
  try {
    const context = await resultsContext(safeRoot, { allow_recovery_lock: true });
    const row = rowFor(context.preregistration, failure?.run_id);
    const startTarget = path.join(context.starts_root, `${row.run_id}.json`);
    const expectedStart = attemptStart(context.preregistration, row);
    await recoverOrReplacePartialStage(startTarget, context.starts_root, expectedStart, "attempt start");
    if (!(await optionalPhysicalFile(startTarget, context.starts_root, "attempt start"))) await writeExclusive(startTarget, expectedStart);
    const start = validateAttemptStart(await readCanonical(startTarget, context.starts_root, "attempt start"), context.preregistration, row);
    const target = path.join(context.attempts_root, `${row.run_id}.json`);
    const retained = await optionalPhysicalFile(target, context.attempts_root, "attempt record");
    if (retained) return validateRc7GateCAttemptRecord(await readCanonical(retained, context.attempts_root, "attempt record"));
    const stage = `${target}.stage`;
    if (await optionalPhysicalFile(stage, context.attempts_root, "attempt record stage")) {
      try {
        const staged = validateRc7GateCAttemptRecord(await readCanonical(stage, context.attempts_root, "attempt record stage"));
        if (staged.run_id !== row.run_id || staged.start_sha256 !== start.start_sha256 || staged.case_id !== row.case_id
          || staged.arm !== row.arm || staged.selected_route !== row.selected_route) fail("ATTEMPT_PROVENANCE_MISMATCH", "Interrupted attempt stage conflicts with its start or schedule");
        await recoverExactStage(target, context.attempts_root, staged, "attempt record");
        return staged;
      } catch (error) {
        if (!(error instanceof Rc7GateCResultsError) || error.code !== "MALFORMED_RESULTS") throw error;
        await rm(stage);
      }
    }
    if (accounting.activation_sha256 !== context.meta.future_activation_sha256 || accounting.preregistration_sha256 !== context.meta.preregistration_sha256
      || canonicalJsonV1(accounting.ledger_root_identity) !== canonicalJsonV1(context.meta.ledger_root_identity)
      || canonicalJsonV1(accounting.results_root_identity) !== canonicalJsonV1(context.meta.results_root_identity)
      || accounting.ledger_instance_sha256 !== context.meta.ledger_instance_sha256
      || accounting.operator_approval_record_sha256 !== context.meta.operator_approval_record_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker ledger instance and results freeze identities differ");
    const record = failureRecord(failure, row, accounting, start);
    validateRc7GateCAttemptRecord(record);
    await writeExclusive(target, record, MAX_ATTEMPT_BYTES, "DUPLICATE_ATTEMPT_TERMINAL");
    return record;
  } finally {
    await releaseResultsRecoveryLock(safeRoot, lock);
  }
}

export async function recoverRc7GateCAttemptTerminal(root, ledgerRoot, failure) {
  return recoverAttemptTerminalWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot), failure);
}

function validateResultsAggregate(value) {
  exactKeys(value, [
    "schema_version", "results_identity", "state", "results_meta_sha256", "ledger_accounting_sha256",
    "attempt_matrix_sha256", "authority_and_budget_sha256", "scorer_aggregate", "terminal_decision", "results_aggregate_sha256",
  ], "results aggregate");
  const scorer = value.scorer_aggregate;
  if (value.schema_version !== RC7_GATE_C_AGGREGATE_SCHEMA || value.results_identity !== RC7_GATE_C_RESULTS_ID
    || value.state !== "sealed-36-attempt-terminal" || !HASH.test(value.results_meta_sha256 ?? "")
    || !HASH.test(value.ledger_accounting_sha256 ?? "") || !HASH.test(value.attempt_matrix_sha256 ?? "")
    || !HASH.test(value.authority_and_budget_sha256 ?? "") || !["STOP", "KEEP_RLM_CANDIDATE", "REBUILD_RLM_CANDIDATE", "NO_RLM"].includes(value.terminal_decision)
    || !scorer || scorer.terminal_decision !== value.terminal_decision || !HASH.test(scorer.aggregate_sha256 ?? "")
    || scorer.aggregate_sha256 !== sha256V1(canonicalJsonV1(projection(scorer, "aggregate_sha256")))
    || value.results_aggregate_sha256 !== sha256V1(canonicalJsonV1(projection(value, "results_aggregate_sha256")))) fail("MALFORMED_RESULTS", "Sealed results aggregate is malformed or digest mismatched");
  return value;
}

export async function inspectRc7GateCResults(root) {
  const context = await resultsContext(root);
  const startEntries = (await readdir(context.starts_root)).sort();
  const attemptEntries = (await readdir(context.attempts_root)).sort();
  const recoverableStages = [...startEntries, ...attemptEntries].filter((item) => item.endsWith(".stage")).length
    + ((await readdir(context.root)).includes(`${RC7_GATE_C_AGGREGATE_FILE}.stage`) ? 1 : 0);
  if (startEntries.some((item) => !/^[0-9a-f]{64}\.json(?:\.stage)?$/u.test(item))
    || attemptEntries.some((item) => !/^[0-9a-f]{64}\.json(?:\.stage)?$/u.test(item))) fail("UNKNOWN_RESULTS_RESIDUE", "Results lanes contain unknown residue");
  const starts = startEntries.filter((item) => item.endsWith(".json"));
  const attempts = attemptEntries.filter((item) => item.endsWith(".json"));
  for (const file of starts) {
    const row = rowFor(context.preregistration, file.slice(0, -5));
    validateAttemptStart(await readCanonical(path.join(context.starts_root, file), context.starts_root, "attempt start"), context.preregistration, row);
  }
  for (const file of attempts) {
    const record = validateRc7GateCAttemptRecord(await readCanonical(path.join(context.attempts_root, file), context.attempts_root, "attempt record"));
    const row = rowFor(context.preregistration, record.run_id);
    if (file !== `${record.run_id}.json` || record.case_id !== row.case_id || record.arm !== row.arm || record.selected_route !== row.selected_route) fail("ATTEMPT_PROVENANCE_MISMATCH", "Inspected attempt does not match the schedule");
  }
  const aggregatePath = await optionalPhysicalFile(path.join(context.root, RC7_GATE_C_AGGREGATE_FILE), context.root, "aggregate");
  const aggregate = aggregatePath ? validateResultsAggregate(await readCanonical(aggregatePath, context.root, "aggregate", MAX_AGGREGATE_BYTES)) : null;
  const state = recoverableStages > 0 ? "recovery-required-no-replay"
    : aggregate ? "sealed-36-attempt-terminal"
      : starts.length === 36 && attempts.length === 36 ? "complete-awaiting-aggregate"
        : starts.length === attempts.length ? "in-progress-settled" : "attempt-recovery-required-no-replay";
  return { root: context.root, state, starts: starts.length, attempts: attempts.length, recoverable_stages: recoverableStages, aggregate_sha256: aggregate?.results_aggregate_sha256 ?? null, terminal_decision: aggregate?.terminal_decision ?? null };
}

export async function beginRc7GateCAttempt(root, runId) {
  const context = await resultsContext(root);
  const row = rowFor(context.preregistration, runId);
  const start = attemptStart(context.preregistration, row);
  await writeExclusive(path.join(context.starts_root, `${row.run_id}.json`), start, MAX_ATTEMPT_BYTES, "DUPLICATE_ATTEMPT_START");
  return start;
}

async function publishAttemptWithAccounting(root, accounting, input) {
  exactKeys(input, ["execution", "failure", "rlm_root"], "attempt publication input");
  if ((input.execution === null) === (input.failure === null)) fail("MALFORMED_RESULTS", "Attempt publication requires exactly one success or failure input");
  const context = await resultsContext(root);
  const runId = input.execution?.row?.run_id ?? input.failure?.run_id;
  const row = rowFor(context.preregistration, runId);
  const start = validateAttemptStart(await readCanonical(path.join(context.starts_root, `${row.run_id}.json`), context.starts_root, "attempt start"), context.preregistration, row);
  if (accounting.activation_sha256 !== context.meta.future_activation_sha256 || accounting.preregistration_sha256 !== context.meta.preregistration_sha256
    || canonicalJsonV1(accounting.ledger_root_identity) !== canonicalJsonV1(context.meta.ledger_root_identity)
    || canonicalJsonV1(accounting.results_root_identity) !== canonicalJsonV1(context.meta.results_root_identity)
    || accounting.ledger_instance_sha256 !== context.meta.ledger_instance_sha256
    || accounting.operator_approval_record_sha256 !== context.meta.operator_approval_record_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker ledger instance and results freeze identities differ");
  const record = input.execution === null ? failureRecord(input.failure, row, accounting, start) : await successRecord(input.execution, row, accounting, start, input.rlm_root);
  validateRc7GateCAttemptRecord(record);
  await writeExclusive(path.join(context.attempts_root, `${row.run_id}.json`), record, MAX_ATTEMPT_BYTES, "DUPLICATE_ATTEMPT_TERMINAL");
  return record;
}

export async function publishRc7GateCAttempt(root, ledgerRoot, input) {
  return publishAttemptWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot), input);
}

function authorityAndBudget(records, accounting, preregistration) {
  exactKeys(accounting, ["schema_version", "state", "activation_sha256", "preregistration_sha256", "ledger_root_identity", "results_root_identity", "ledger_instance_sha256", "operator_approval_record_sha256", "entries", "accounting_sha256"], "broker accounting");
  if (accounting.schema_version !== "rc7-gate-c-ledger-accounting-v4" || accounting.state !== "settled-broker-derived"
    || !HASH.test(accounting.activation_sha256 ?? "") || !HASH.test(accounting.preregistration_sha256 ?? "")
    || !HASH.test(accounting.ledger_instance_sha256 ?? "") || !HASH.test(accounting.operator_approval_record_sha256 ?? "")
    || !Array.isArray(accounting.entries) || accounting.accounting_sha256 !== sha256V1(canonicalJsonV1(projection(accounting, "accounting_sha256")))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker accounting is malformed or self-digest mismatched");
  const ledgerKeys = [
    "reservation_ordinal", "reservation_key", "run_id", "case_id", "arm", "selected_route", "request_kind", "child_sequence",
    "semantic_request_sha256", "dispatch_sha256", "terminal_state", "terminal_sha256", "sealed_result_sha256", "artifact_sha256",
    "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256",
    "trusted_route_observation_sha256", "durable_handoff_sha256", "gate_b_attestation_sha256", "provider_reachability_committed",
    "accounting_basis", "provider_posts", "oauth_refresh_posts", "automatic_retry_count", "provider_active_milliseconds",
    "input_tokens", "output_plus_reasoning_tokens",
  ];
  for (const entry of accounting.entries) {
    exactKeys(entry, ledgerKeys, "broker accounting entry");
    if (!Number.isSafeInteger(entry.reservation_ordinal) || entry.reservation_ordinal < 1 || entry.reservation_ordinal > 72
      || !HASH.test(entry.reservation_key ?? "") || !HASH.test(entry.run_id ?? "") || !HASH.test(entry.semantic_request_sha256 ?? "")
      || !HASH.test(entry.dispatch_sha256 ?? "") || !HASH.test(entry.terminal_sha256 ?? "") || typeof entry.provider_reachability_committed !== "boolean"
      || (entry.durable_handoff_sha256 !== null && !HASH.test(entry.durable_handoff_sha256))
      || (entry.gate_b_attestation_sha256 !== null && !HASH.test(entry.gate_b_attestation_sha256))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker accounting entry is malformed");
    const sealedKeys = ["sealed_result_sha256", "artifact_sha256", "usage_sha256", "provenance_sha256", "permission_sha256", "authority_sha256", "cleanup_sha256", "trusted_route_observation_sha256"];
    if ((entry.terminal_state === "trusted-sealed" && sealedKeys.some((key) => !HASH.test(entry[key] ?? "")))
      || (entry.terminal_state === "indeterminate-no-replay" && sealedKeys.some((key) => entry[key] !== null))
      || !["trusted-sealed", "indeterminate-no-replay"].includes(entry.terminal_state)
      || entry.provider_reachability_committed !== (entry.durable_handoff_sha256 !== null)
      || entry.provider_reachability_committed !== (entry.gate_b_attestation_sha256 !== null)) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker accounting terminal or handoff identities are malformed");
    validateRequestRecord(ledgerRequestIdentity(entry));
    const expectedBasis = entry.terminal_state === "trusted-sealed" ? "exact-sealed-provider-observation"
      : entry.provider_reachability_committed ? "conservative-upper-bound-after-indeterminate-handoff" : "exact-no-provider-handoff";
    if (entry.accounting_basis !== expectedBasis
      || (expectedBasis === "conservative-upper-bound-after-indeterminate-handoff"
        && (entry.provider_posts !== 1 || entry.oauth_refresh_posts !== 1 || entry.provider_active_milliseconds !== 120_000
          || entry.input_tokens !== 32_768 || entry.output_plus_reasoning_tokens !== 8_192))
      || (expectedBasis === "exact-no-provider-handoff"
        && (entry.provider_posts !== 0 || entry.oauth_refresh_posts !== 0 || entry.provider_active_milliseconds !== 0
          || entry.input_tokens !== 0 || entry.output_plus_reasoning_tokens !== 0))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker accounting basis does not match its trusted or conservative terminal evidence");
  }
  if (new Set(accounting.entries.map((item) => item.reservation_ordinal)).size !== accounting.entries.length
    || new Set(accounting.entries.map((item) => item.reservation_key)).size !== accounting.entries.length
    || new Set(accounting.entries.map((item) => item.dispatch_sha256)).size !== accounting.entries.length) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker accounting identities are duplicated");
  const requestByDispatch = new Map(records.flatMap((record) => record.requests.map((request) => [request.dispatch_sha256, request])));
  if (requestByDispatch.size !== records.reduce((total, record) => total + record.requests.length, 0)
    || requestByDispatch.size !== accounting.entries.length || accounting.entries.some((entry) => !requestByDispatch.has(entry.dispatch_sha256))) fail("ATTEMPT_PROVENANCE_MISMATCH", "Attempt matrix and broker accounting are not one exact request bijection");
  for (const entry of accounting.entries) {
    const request = requestByDispatch.get(entry.dispatch_sha256);
    if (canonicalJsonV1(ledgerRequestIdentity(entry)) !== canonicalJsonV1(request)) fail("ATTEMPT_PROVENANCE_MISMATCH", "Retained request identity and accounting no longer exactly match the broker ledger at aggregation");
  }
  const requests = accounting.entries.map((entry) => requestByDispatch.get(entry.dispatch_sha256));
  const childCounts = new Map();
  for (const entry of accounting.entries.filter((item) => item.request_kind === "recursive-child")) childCounts.set(entry.run_id, (childCounts.get(entry.run_id) ?? 0) + 1);
  const schedule = new Map(preregistration.ablation.schedule.map((row) => [row.run_id, row]));
  const routeViolations = accounting.entries.filter((entry) => {
    const row = schedule.get(entry.run_id);
    return !row || row.case_id !== entry.case_id || row.arm !== entry.arm || row.selected_route !== entry.selected_route;
  }).length;
  const childShapeViolations = records.filter((record) => record.state === "trusted-sealed-primary-attempt" && record.selected_route === "rc-rlm" && (childCounts.get(record.run_id) ?? 0) !== 4).length;
  return {
    added_credit_purchases: 0,
    automatic_retry_count: requests.reduce((total, item) => total + item.automatic_retry_count, 0),
    cleanup_residue_entries: records.reduce((total, item) => total + (item.rlm?.cleanup_residue_entries ?? 0), 0),
    direct_or_generic_child_request_count: accounting.entries.filter((entry) => entry.request_kind === "recursive-child" && (entry.selected_route !== "rc-rlm" || !["LAB-01", "PAPER-01", "REPO-01"].includes(entry.case_id))).length,
    eligible_treatment_child_shape_violation_count: childShapeViolations,
    generation_https_post_requests_consumed: requests.reduce((total, item) => total + item.provider_posts, 0),
    incremental_cash_purchases_usd: "0",
    input_token_accounting_consumed: requests.reduce((total, item) => total + item.input_tokens, 0),
    maximum_input_tokens_any_request: requests.reduce((maximum, item) => Math.max(maximum, item.input_tokens), 0),
    maximum_observed_concurrency: accounting.entries.length === 0 ? 0 : 1,
    maximum_output_plus_reasoning_tokens_any_request: requests.reduce((maximum, item) => Math.max(maximum, item.output_plus_reasoning_tokens), 0),
    maximum_provider_active_milliseconds_any_request: requests.reduce((maximum, item) => Math.max(maximum, item.provider_active_milliseconds), 0),
    oauth_refresh_https_post_requests_consumed: requests.reduce((total, item) => total + item.oauth_refresh_posts, 0),
    output_plus_reasoning_token_accounting_consumed: requests.reduce((total, item) => total + item.output_plus_reasoning_tokens, 0),
    provider_active_milliseconds_consumed: requests.reduce((total, item) => total + item.provider_active_milliseconds, 0),
    recovery_failures: records.filter((item) => !item.trusted_observation.recovery_gate_passed).length,
    recursive_child_generation_reservations_consumed: accounting.entries.filter((entry) => entry.request_kind === "recursive-child").length,
    recursive_depth_observed_max: accounting.entries.some((entry) => entry.request_kind === "recursive-child") ? 1 : 0,
    route_identity_violation_count: routeViolations,
    top_level_generation_reservations_consumed: accounting.entries.filter((entry) => entry.request_kind === "top-level").length,
    total_https_post_requests_consumed: requests.reduce((total, item) => total + item.provider_posts + item.oauth_refresh_posts, 0),
    uncontained_os_authority_count: records.reduce((total, item) => total + item.trusted_observation.uncontained_os_authority_count, 0),
    unregistered_provider_request_count: records.reduce((total, item) => total + item.trusted_observation.unregistered_provider_request_count, 0),
  };
}

async function buildAggregationInputWithAccounting(root, accounting) {
  const context = await resultsContext(root);
  const startFiles = (await readdir(context.starts_root)).sort();
  const files = (await readdir(context.attempts_root)).sort();
  if (startFiles.length !== 36 || canonicalJsonV1(startFiles) !== canonicalJsonV1(files)) fail("INCOMPLETE_ATTEMPT_MATRIX", "Every scheduled primary attempt must have one durable start and one terminal record");
  if (files.length !== 36 || files.some((item) => !/^[0-9a-f]{64}\.json$/u.test(item))) fail("INCOMPLETE_ATTEMPT_MATRIX", "Aggregation requires exactly 36 retained attempt records");
  const records = [];
  for (const file of files) {
    const record = validateRc7GateCAttemptRecord(await readCanonical(path.join(context.attempts_root, file), context.attempts_root, "attempt record"));
    if (`${record.run_id}.json` !== file) fail("RUN_IDENTITY_MISMATCH", "Attempt filename and run identity differ");
    const row = rowFor(context.preregistration, record.run_id);
    const start = validateAttemptStart(await readCanonical(path.join(context.starts_root, file), context.starts_root, "attempt start"), context.preregistration, row);
    if (record.start_sha256 !== start.start_sha256 || record.case_id !== row.case_id || record.arm !== row.arm || record.selected_route !== row.selected_route) fail("ATTEMPT_PROVENANCE_MISMATCH", "Attempt record does not match its immutable start and schedule row");
    records.push(record);
  }
  if (new Set(records.map((item) => item.run_id)).size !== 36) fail("INCOMPLETE_ATTEMPT_MATRIX", "Attempt run identities are duplicated");
  if (accounting.activation_sha256 !== context.meta.future_activation_sha256 || accounting.preregistration_sha256 !== context.meta.preregistration_sha256
    || canonicalJsonV1(accounting.ledger_root_identity) !== canonicalJsonV1(context.meta.ledger_root_identity)
    || canonicalJsonV1(accounting.results_root_identity) !== canonicalJsonV1(context.meta.results_root_identity)
    || accounting.ledger_instance_sha256 !== context.meta.ledger_instance_sha256
    || accounting.operator_approval_record_sha256 !== context.meta.operator_approval_record_sha256) fail("ATTEMPT_PROVENANCE_MISMATCH", "Broker ledger instance and results freeze identities differ");
  const authority = authorityAndBudget(records, accounting, context.preregistration);
  return {
    attempts: records.map((record) => ({
      run_id: record.run_id,
      raw_output: record.raw_output,
      trusted_observation: record.trusted_observation,
      wall_ms: record.wall_ms,
      comparable_cost_usd: record.comparable_cost_usd,
    })),
    authority_and_budget: authority,
  };
}

export async function buildRc7GateCAggregationInput(root, ledgerRoot) {
  return buildAggregationInputWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot));
}

async function publishAggregateWithAccounting(root, accounting) {
  const context = await resultsContext(root);
  const aggregateInput = await buildAggregationInputWithAccounting(root, accounting);
  const scorerAggregate = await aggregateRc7GateCScores(aggregateInput);
  const aggregate = withDigest({
    schema_version: RC7_GATE_C_AGGREGATE_SCHEMA,
    results_identity: RC7_GATE_C_RESULTS_ID,
    state: "sealed-36-attempt-terminal",
    results_meta_sha256: context.meta.meta_sha256,
    ledger_accounting_sha256: accounting.accounting_sha256,
    attempt_matrix_sha256: sha256V1(canonicalJsonV1(aggregateInput.attempts)),
    authority_and_budget_sha256: sha256V1(canonicalJsonV1(aggregateInput.authority_and_budget)),
    scorer_aggregate: scorerAggregate,
    terminal_decision: scorerAggregate.terminal_decision,
  }, "results_aggregate_sha256");
  const retained = await optionalPhysicalFile(path.join(context.root, RC7_GATE_C_AGGREGATE_FILE), context.root, "aggregate");
  if (retained) {
    const existing = await readCanonical(retained, context.root, "aggregate", MAX_AGGREGATE_BYTES);
    if (canonicalJsonV1(existing) !== canonicalJsonV1(aggregate)) fail("CONFLICTING_AGGREGATE", "Retained aggregate conflicts with the current exact attempt matrix and ledger accounting");
    return existing;
  }
  const target = path.join(context.root, RC7_GATE_C_AGGREGATE_FILE);
  try {
    if (await recoverExactStage(target, context.root, aggregate, "aggregate", MAX_AGGREGATE_BYTES)) return aggregate;
  } catch (error) {
    if (!(error instanceof Rc7GateCResultsError) || !["MALFORMED_RESULTS", "CONFLICTING_RESULTS_STAGE"].includes(error.code)) throw error;
    await rm(`${target}.stage`, { force: true });
  }
  await writeExclusive(target, aggregate, MAX_AGGREGATE_BYTES, "CONCURRENT_AGGREGATION_EXCLUDED");
  return aggregate;
}

export async function publishRc7GateCAggregate(root, ledgerRoot) {
  return publishAggregateWithAccounting(root, await extractRc7GateCLedgerAccounting(ledgerRoot));
}

export const __test = Object.freeze({
  acquireResultsRecoveryLock,
  attemptStart,
  authorityAndBudget,
  buildAggregationInputWithAccounting,
  failureRecord,
  initializeResultsWithAccounting,
  recoverAttemptTerminalWithAccounting,
  recoverResultsWithAccounting,
  publishAggregateWithAccounting,
  publishAttemptWithAccounting,
  releaseResultsRecoveryLock,
  successRecord,
  resultsContext,
  validateAttemptStart,
});
