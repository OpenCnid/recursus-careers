import { open, readFile, readdir, realpath, rename, rm, writeFile, mkdir, lstat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  OrchestratedResearchError,
  __test as foundation,
  evaluateEvidenceCandidate,
  parseStrictJson,
} from "./orchestrated-research.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";

export const STAGE2_SCHEMA = "orchestrated-research-stage2-v1";
export const STAGE2_PERMISSION_ID = "orchestrated-research-stage2-provider-free-v1";
export const STAGE2_ACTIONS = Object.freeze([
  "REQUEST_DIRECT_EXTRACTION",
  "REQUEST_DIRECT_GAP_FILL",
  "REQUEST_RLM_OPERATION",
  "RECORD_GAP",
  "PROPOSE_SYNTHESIS",
  "STOP",
]);
export const STAGE2_FAULTS = Object.freeze([
  "rlm-failed",
  "rlm-timeout",
  "rlm-malformed",
  "rlm-unsafe",
  "rlm-over-budget",
  "rlm-unavailable",
  "after-operation-admission",
  "after-operation-dispatch",
  "after-operation-terminal",
  "after-evidence-checkpoint",
  "before-synthesis",
  "during-publication",
]);

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), "..", "..");
const FIXTURE_ROOT = path.join(REPOSITORY_ROOT, "tests", "recursus", "fixtures", "orchestrated-research-stage2");
const ACTION_FIXTURE = path.join(FIXTURE_ROOT, "fake-orchestrator-actions.json");
const RESULT_FIXTURE = path.join(FIXTURE_ROOT, "fake-operation-results.json");
const EVALUATOR_FIXTURE = path.join(FIXTURE_ROOT, "evaluator-only.json");
const FIXTURE_HASHES = Object.freeze({
  actions: "f11a00bc1c531b301edb02e56d731fffa3f998511cf2c30a9e3afbbed37baee5",
  results: "400f29d5d2447c1c78e8d2c9bacfa9165d724d04e8c729e92e5b6fb46769c6c4",
  evaluator: "2c9683a230b2539ba96f4ed85e65429fe3f773ac3ea63523a85193f92223b48c",
});
const RUN_ID = "ORCHESTRATED-RESEARCH-STAGE2-PREPARATION-01";
const ROUTE_ID = "orchestrated-rlm-provider-free-v1";
const ZERO = "0".repeat(64);
const MAX_JSON = 1_048_576;
const MAX_LEDGER = 2_097_152;
const HASH_RE = /^[a-f0-9]{64}$/u;
const ID_RE = /^[A-Z0-9][A-Z0-9._-]{0,127}$/u;

const DIRECT_LIMITS = Object.freeze({
  provider_requests: 0,
  rlm_executions: 0,
  max_candidates: 8,
  max_artifact_bytes: 262144,
  max_wall_ms: 1000,
  worker_kind: "deterministic-fake-direct",
});
const RLM_LIMITS = Object.freeze({
  provider_requests: 0,
  rlm_executions: 0,
  max_candidates: 4,
  max_artifact_bytes: 262144,
  max_wall_ms: 1000,
  worker_kind: "deterministic-fake-rlm",
});

const OPERATION_REGISTRY = Object.freeze({
  "S2-OP-DIRECT-FACT-01": { kind: "REQUEST_DIRECT_EXTRACTION", case_id: "FACT-01", objective_id: "S2-OBJECTIVE-FACT-01", source_partition_id: "S2-PARTITION-FACT-01", gap_id: null, limits: DIRECT_LIMITS },
  "S2-OP-RLM-SAFE-DENIED": { kind: "REQUEST_RLM_OPERATION", case_id: "SAFE-01", objective_id: "S2-OBJECTIVE-SAFE-01-RLM-DENIAL", source_partition_id: "S2-PARTITION-SAFE-01", gap_id: "S2-GAP-LAB-01", limits: RLM_LIMITS },
  "S2-OP-RLM-LAB-01": { kind: "REQUEST_RLM_OPERATION", case_id: "LAB-01", objective_id: "S2-OBJECTIVE-LAB-RELATIONSHIP", source_partition_id: "S2-PARTITION-LAB-01", gap_id: "S2-GAP-LAB-01", limits: RLM_LIMITS },
  "S2-OP-RLM-LAB-02": { kind: "REQUEST_RLM_OPERATION", case_id: "LAB-01", objective_id: "S2-OBJECTIVE-LAB-RELATIONSHIP", source_partition_id: "S2-PARTITION-LAB-01", gap_id: "S2-GAP-LAB-01", limits: RLM_LIMITS },
  "S2-OP-RLM-LAB-CIRCUIT-DENIED": { kind: "REQUEST_RLM_OPERATION", case_id: "LAB-01", objective_id: "S2-OBJECTIVE-LAB-RELATIONSHIP", source_partition_id: "S2-PARTITION-LAB-01", gap_id: "S2-GAP-LAB-01", limits: RLM_LIMITS },
  "S2-OP-DIRECT-LAB-FALLBACK": { kind: "REQUEST_DIRECT_GAP_FILL", case_id: "LAB-01", objective_id: "S2-OBJECTIVE-LAB-RELATIONSHIP", source_partition_id: "S2-PARTITION-LAB-01", gap_id: "S2-GAP-LAB-01", limits: DIRECT_LIMITS },
});

const LEDGER_KINDS = new Set([
  "RUN_REGISTERED", "PLAN_RECORDED", "ACTION_PROPOSED", "OPERATION_ADMITTED",
  "OPERATION_DISPATCHED", "OPERATION_TERMINAL", "EVIDENCE_PROPOSED",
  "EVIDENCE_ACCEPTED", "EVIDENCE_REJECTED", "GAP_RECORDED", "DECISION_RECORDED",
  "SYNTHESIS_ELIGIBLE", "ARTIFACT_PUBLISHED", "RUN_TERMINAL",
]);

function fail(code, message, details = undefined) {
  throw new OrchestratedResearchError(code, message, details);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_STAGE2_VALUE", `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJsonV1(actual) !== canonicalJsonV1(wanted)) fail("UNKNOWN_OR_MISSING_FIELD", `${label} does not match its closed schema`, { actual, expected: wanted });
}

function canonicalBytes(value) {
  return Buffer.from(canonicalJsonV1(value), "utf8");
}

async function readFrozenJson(target, expected, label) {
  const bytes = await readFile(target);
  if (bytes.byteLength > MAX_JSON || sha256V1(bytes) !== expected) fail("STAGE2_FIXTURE_IDENTITY_MISMATCH", `${label} bytes changed`);
  return { value: parseStrictJson(bytes.toString("utf8"), label), bytes, sha256: expected };
}

function stringsIn(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, output);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, output);
  return output;
}

function validateLimits(value, expected, label) {
  exactKeys(value, Object.keys(expected), `${label} limits`);
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)) fail("BUDGET_EXPANSION_DENIED", `${label} limits do not equal the registered host budget`);
}

function validateId(value, label) {
  if (typeof value !== "string" || !ID_RE.test(value)) fail("ACTION_IDENTITY_MISMATCH", `${label} is not a closed identity`);
}

function validateIdList(value, label, { min = 0, max = 32 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max || new Set(value).size !== value.length || !value.every((item) => typeof item === "string" && ID_RE.test(item))) fail("ACTION_IDENTITY_MISMATCH", `${label} is not a bounded unique identity list`);
}

export function validateOrchestratorAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_ACTION", "Orchestrator action must be an object");
  const base = ["schema_version", "action_id", "run_id", "checkpoint_id", "kind"];
  const fields = {
    REQUEST_DIRECT_EXTRACTION: [...base, "case_id", "objective_id", "source_partition_id", "operation_id", "limits"],
    REQUEST_DIRECT_GAP_FILL: [...base, "case_id", "objective_id", "source_partition_id", "gap_id", "operation_id", "limits"],
    REQUEST_RLM_OPERATION: [...base, "case_id", "objective_id", "source_partition_id", "gap_id", "operation_id", "recursive_depth", "limits"],
    RECORD_GAP: [...base, "case_id", "objective_id", "source_partition_id", "gap_key", "importance", "description"],
    PROPOSE_SYNTHESIS: [...base, "accepted_evidence_ids", "required_gap_ids"],
    STOP: [...base, "reason"],
  };
  if (!STAGE2_ACTIONS.includes(value.kind)) fail("UNKNOWN_ACTION", `Unknown orchestrator action ${value.kind}`);
  exactKeys(value, fields[value.kind], `${value.kind} action`);
  if (value.schema_version !== "orchestrated-research-action-v1" || value.run_id !== RUN_ID) fail("ACTION_IDENTITY_MISMATCH", "Action identity is malformed or belongs to another run");
  validateId(value.action_id, "action_id");
  validateId(value.checkpoint_id, "checkpoint_id");
  const smuggled = stringsIn(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "kind"))).find((text) => STAGE2_ACTIONS.some((kind) => text.includes(kind)) || /(?:"kind"\s*:|admitted\s*=|self[-_ ]?authori[sz]e)/iu.test(text));
  if (smuggled) fail("ACTION_SMUGGLING", "Action text embeds authority or another action");
  for (const field of ["case_id", "objective_id", "source_partition_id", "gap_id", "operation_id", "gap_key"]) if (value[field] !== undefined) validateId(value[field], field);
  if (value.kind === "REQUEST_RLM_OPERATION" && value.recursive_depth !== 1) fail("RECURSIVE_DEPTH_DENIED", "Only recursive depth one is registered");
  if (value.limits !== undefined) validateLimits(value.limits, value.kind === "REQUEST_RLM_OPERATION" ? RLM_LIMITS : DIRECT_LIMITS, value.kind);
  if (value.kind === "RECORD_GAP" && (!new Set(["required", "optional"]).has(value.importance) || typeof value.description !== "string" || value.description.length < 1 || value.description.length > 1024)) fail("MALFORMED_GAP_PROPOSAL", "Gap importance or description is malformed");
  if (value.kind === "PROPOSE_SYNTHESIS") {
    try {
      validateIdList(value.accepted_evidence_ids, "accepted_evidence_ids", { min: 1 });
      validateIdList(value.required_gap_ids, "required_gap_ids", { min: 1 });
    } catch (error) {
      if (error instanceof OrchestratedResearchError) fail("SYNTHESIS_SET_MALFORMED", "Synthesis identities are not bounded unique closed sets");
      throw error;
    }
  }
  if (value.kind === "STOP" && (typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 1024)) fail("MALFORMED_STOP", "Stop reason is malformed");
  return structuredClone(value);
}

export function parseOrchestratorAction(text) {
  return validateOrchestratorAction(parseStrictJson(text, "orchestrator action"));
}

function permissionContract() {
  return {
    identity: STAGE2_PERMISSION_ID,
    default: "deny",
    allowed: ["registered-synthetic-source-read", "external-disposable-root-write", "deterministic-fake-operation"],
    denied: ["provider", "credentials", "network", "live-browser", "real-rlm", "model-generated-code", "docker", "wsl", "external-mutation", "career-ops-user-layer", "rc7-execution"],
  };
}

function budgetContract() {
  return {
    identity: "orchestrated-research-stage2-zero-authority-budget-v1",
    provider_requests: 0,
    credential_accesses: 0,
    rlm_executions: 0,
    network_actions: 0,
    docker_invocations: 0,
    wsl_invocations: 0,
    external_mutations: 0,
    retries: 0,
    max_concurrent_operations: 1,
    max_recursive_depth: 1,
    max_fake_operation_dispatches: 4,
  };
}

function payloadKeys(kind) {
  return {
    RUN_REGISTERED: ["route_id", "question_identity", "source_identity", "permission_identity", "budget_identity", "evaluator_identity", "code_identity", "action_grammar_identity", "physical_root_binding"],
    PLAN_RECORDED: ["plan_id", "action_ids", "operation_ids", "initial_gap_ids"],
    ACTION_PROPOSED: ["action_id", "checkpoint_id", "action_sha256", "action"],
    OPERATION_ADMITTED: ["action_id", "operation_id", "operation_kind", "case_id", "objective_id", "source_partition_id", "input_sha256", "limits", "recursive_depth"],
    OPERATION_DISPATCHED: ["operation_id", "worker_identity", "dispatch_classification"],
    OPERATION_TERMINAL: ["operation_id", "status", "terminal_sha256", "evidence_sha256", "worker_requests", "failure_equivalence"],
    EVIDENCE_PROPOSED: ["operation_id", "candidate"],
    EVIDENCE_ACCEPTED: ["operation_id", "evidence"],
    EVIDENCE_REJECTED: ["operation_id", "rejection"],
    GAP_RECORDED: ["gap_id", "action_id", "operation_id", "importance", "attempted_operations", "disposition", "reason"],
    DECISION_RECORDED: ["action_id", "decision_id", "operation_id", "admission_status", "evidence_considered", "accepted_count", "rejected_count", "next_action", "reason", "circuit", "checkpoint_id"],
    SYNTHESIS_ELIGIBLE: ["eligibility_id", "accepted_evidence_ids", "rejected_evidence_ids", "required_gap_ids", "result_sha256"],
    ARTIFACT_PUBLISHED: ["publication_id", "result_sha256", "artifact_paths"],
    RUN_TERMINAL: ["terminal_id", "decision", "reason", "accounting_sha256", "last_checkpoint_id"],
  }[kind];
}

function sealEntry(sequence, previous, kind, payload) {
  const entry = { schema_version: "orchestrated-research-stage2-ledger-entry-v1", sequence, kind, run_id: RUN_ID, previous_entry_digest: previous, payload };
  entry.entry_digest = sha256V1(Buffer.from(canonicalJsonV1(entry), "utf8"));
  return entry;
}

export function validateStage2Ledger(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 512) fail("LEDGER_SCHEMA_MISMATCH", "Stage 2 ledger entry count is invalid");
  let previous = ZERO;
  const operations = new Map();
  const evidence = new Map();
  const proposedActions = new Set();
  const proposedActionValues = new Map();
  const decidedActions = new Set();
  const actionAdmissions = new Map();
  const evidenceOperations = new Map();
  const gapStates = new Map();
  let terminalCount = 0;
  let synthesisCount = 0;
  let publicationCount = 0;
  for (const [index, entry] of entries.entries()) {
    exactKeys(entry, ["schema_version", "sequence", "kind", "run_id", "previous_entry_digest", "payload", "entry_digest"], `ledger entry ${index + 1}`);
    if (entry.schema_version !== "orchestrated-research-stage2-ledger-entry-v1" || entry.sequence !== index + 1 || entry.run_id !== RUN_ID || !LEDGER_KINDS.has(entry.kind)) fail("LEDGER_SCHEMA_MISMATCH", `Ledger entry ${index + 1} identity mismatched`);
    if (entry.previous_entry_digest !== previous || entry.entry_digest !== sha256V1(Buffer.from(canonicalJsonV1(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "entry_digest"))), "utf8"))) fail("LEDGER_CHAIN_BROKEN", `Ledger entry ${index + 1} digest chain mismatched`);
    exactKeys(entry.payload, payloadKeys(entry.kind), `${entry.kind} payload`);
    if ((index === 0) !== (entry.kind === "RUN_REGISTERED")) fail("LEDGER_TRANSITION_INVALID", "RUN_REGISTERED must occur exactly once and first");
    if ((index === 1) !== (entry.kind === "PLAN_RECORDED")) fail("LEDGER_TRANSITION_INVALID", "PLAN_RECORDED must occur exactly once and second");
    if (entry.kind === "ACTION_PROPOSED") {
      validateOrchestratorAction(entry.payload.action);
      if (proposedActions.has(entry.payload.action_id) || entry.payload.action_id !== entry.payload.action.action_id || entry.payload.checkpoint_id !== entry.payload.action.checkpoint_id) fail("DUPLICATE_ACTION", "Action proposal identity was duplicated or mismatched");
      if (proposedActions.size !== decidedActions.size) fail("CONCURRENT_ACTION_DENIED", "A second proposal preceded the host decision for the prior proposal");
      if (entry.payload.checkpoint_id !== `S2-CHECKPOINT-${String(decidedActions.size).padStart(4, "0")}`) fail("STALE_CHECKPOINT", "Action proposal does not bind the next deterministic checkpoint");
      proposedActions.add(entry.payload.action_id);
      proposedActionValues.set(entry.payload.action_id, entry.payload.action);
    }
    if (entry.kind === "OPERATION_ADMITTED") {
      if (!proposedActions.has(entry.payload.action_id) || decidedActions.has(entry.payload.action_id) || operations.has(entry.payload.operation_id) || [...operations.values()].some((state) => state === "admitted" || state === "dispatched")) fail("OPERATION_SELF_AUTHORIZATION", "Operation admission lacks one pending proposal, duplicates an operation, or overlaps active work");
      const action = proposedActionValues.get(entry.payload.action_id);
      if (!action.operation_id || action.operation_id !== entry.payload.operation_id || action.kind !== entry.payload.operation_kind || action.case_id !== entry.payload.case_id || action.objective_id !== entry.payload.objective_id || action.source_partition_id !== entry.payload.source_partition_id || canonicalJsonV1(action.limits) !== canonicalJsonV1(entry.payload.limits) || entry.payload.recursive_depth !== (action.kind === "REQUEST_RLM_OPERATION" ? 1 : 0)) fail("OPERATION_SELF_AUTHORIZATION", "Operation admission does not exactly bind its proposal");
      operations.set(entry.payload.operation_id, "admitted");
      actionAdmissions.set(entry.payload.action_id, entry.payload.operation_id);
    } else if (entry.kind === "OPERATION_DISPATCHED") {
      if (operations.get(entry.payload.operation_id) !== "admitted") fail("LEDGER_TRANSITION_INVALID", "Operation dispatch is out of order");
      if ([...operations.values()].filter((state) => state === "dispatched").length > 0) fail("CONCURRENT_OPERATION_DENIED", "More than one operation became active");
      const admission = entries.slice(0, index).findLast((item) => item.kind === "OPERATION_ADMITTED" && item.payload.operation_id === entry.payload.operation_id);
      const expectedWorker = admission.payload.operation_kind === "REQUEST_RLM_OPERATION" ? "deterministic-fake-rlm-v1" : "deterministic-fake-direct-v1";
      if (entry.payload.worker_identity !== expectedWorker || entry.payload.dispatch_classification !== "local-provider-free-worker-reachable") fail("UNREGISTERED_WORKER", "Operation dispatch does not bind the registered fake worker");
      operations.set(entry.payload.operation_id, "dispatched");
    } else if (entry.kind === "OPERATION_TERMINAL") {
      if (!new Set(["admitted", "dispatched"]).has(operations.get(entry.payload.operation_id))) fail("LEDGER_TRANSITION_INVALID", "Operation terminal is out of order");
      const admission = entries.slice(0, index).findLast((item) => item.kind === "OPERATION_ADMITTED" && item.payload.operation_id === entry.payload.operation_id);
      if (!new Set(["success", "failed", "timeout", "malformed", "unsafe", "over-budget", "unavailable", "cancelled-before-dispatch", "indeterminate-no-replay"]).has(entry.payload.status) || !HASH_RE.test(entry.payload.terminal_sha256) || !HASH_RE.test(entry.payload.evidence_sha256) || !new Set([0, 1]).has(entry.payload.worker_requests)) fail("MALFORMED_OPERATION_TERMINAL", "Operation terminal fields are outside the closed contract");
      const expectedEquivalence = admission.payload.operation_kind === "REQUEST_RLM_OPERATION" ? `fake-rlm:${admission.payload.case_id}:${admission.payload.source_partition_id}` : "NONE";
      if (entry.payload.failure_equivalence !== expectedEquivalence) fail("CIRCUIT_CLASSIFICATION_MISMATCH", "Operation terminal failure equivalence drifted");
      operations.set(entry.payload.operation_id, "terminal");
    } else if (entry.kind === "EVIDENCE_PROPOSED") {
      if (operations.get(entry.payload.operation_id) !== "terminal") fail("LEDGER_TRANSITION_INVALID", "Evidence preceded the operation terminal");
      const id = `EVIDENCE-${entry.payload.candidate.candidate_id}`;
      if (evidence.has(id)) fail("DUPLICATE_EVIDENCE", `Evidence ${id} was duplicated`);
      evidence.set(id, "proposed");
      evidenceOperations.set(id, entry.payload.operation_id);
    } else if (entry.kind === "EVIDENCE_ACCEPTED" || entry.kind === "EVIDENCE_REJECTED") {
      const item = entry.kind === "EVIDENCE_ACCEPTED" ? entry.payload.evidence : entry.payload.rejection;
      if (evidence.get(item.evidence_id) !== "proposed" || evidenceOperations.get(item.evidence_id) !== entry.payload.operation_id) fail("LEDGER_TRANSITION_INVALID", `Evidence decision for ${item.evidence_id} is out of order or changes operation provenance`);
      evidence.set(item.evidence_id, entry.kind === "EVIDENCE_ACCEPTED" ? "accepted" : "rejected");
    } else if (entry.kind === "GAP_RECORDED") {
      validateId(entry.payload.gap_id, "gap_id");
      validateId(entry.payload.action_id, "gap action_id");
      if (!proposedActions.has(entry.payload.action_id) || !new Set(["open", "resolved", "deferred", "abandoned"]).has(entry.payload.disposition) || !new Set(["required", "optional"]).has(entry.payload.importance) || typeof entry.payload.reason !== "string" || entry.payload.reason.length < 1 || entry.payload.reason.length > 2048) fail("MALFORMED_GAP_RECORD", "Gap record is not one closed durable transition");
      validateIdList(entry.payload.attempted_operations, "attempted_operations", { max: 16 });
      const priorGap = gapStates.get(entry.payload.gap_id);
      if ((entry.payload.disposition === "open" && priorGap !== undefined) || (entry.payload.disposition !== "open" && priorGap !== "open")) fail("GAP_TRANSITION_INVALID", "Gap transition is not open followed by one terminal disposition");
      gapStates.set(entry.payload.gap_id, entry.payload.disposition);
    } else if (entry.kind === "DECISION_RECORDED") {
      if (!proposedActions.has(entry.payload.action_id) || decidedActions.has(entry.payload.action_id)) fail("DUPLICATE_DECISION", "Action decision is missing its proposal or duplicated");
      const action = proposedActionValues.get(entry.payload.action_id);
      const expectedEvidence = [...evidence.entries()].filter(([, state]) => state === "accepted" || state === "rejected").map(([id]) => id).sort();
      const expectedCircuit = circuitState(entries.slice(0, index));
      if (!new Set(["admitted", "denied"]).has(entry.payload.admission_status) || typeof entry.payload.reason !== "string" || entry.payload.reason.length < 1 || entry.payload.reason.length > 2048 || !new Set(["CONTINUE", "REGISTERED_FALLBACK_OR_STOP", "STOP"]).has(entry.payload.next_action) || canonicalJsonV1(entry.payload.evidence_considered) !== canonicalJsonV1(expectedEvidence) || entry.payload.accepted_count !== [...evidence.values()].filter((state) => state === "accepted").length || entry.payload.rejected_count !== [...evidence.values()].filter((state) => state === "rejected").length || canonicalJsonV1(entry.payload.circuit) !== canonicalJsonV1(expectedCircuit) || entry.payload.checkpoint_id !== `S2-CHECKPOINT-${String(decidedActions.size + 1).padStart(4, "0")}`) fail("DECISION_PROJECTION_MISMATCH", "Host decision is not the exact durable state projection");
      if (action.operation_id) {
        const admittedOperation = actionAdmissions.get(action.action_id);
        if (entry.payload.operation_id !== action.operation_id || (entry.payload.admission_status === "admitted" ? admittedOperation !== action.operation_id || operations.get(action.operation_id) !== "terminal" : admittedOperation !== undefined)) fail("OPERATION_DECISION_MISMATCH", "Operation decision does not match host admission and terminal state");
      } else if (entry.payload.operation_id !== "NONE" || entry.payload.admission_status !== "admitted") fail("ACTION_DECISION_MISMATCH", "Non-operation action decision is malformed");
      decidedActions.add(entry.payload.action_id);
    } else if (entry.kind === "SYNTHESIS_ELIGIBLE") {
      synthesisCount += 1;
      if (synthesisCount > 1) fail("DUPLICATE_SYNTHESIS", "Synthesis eligibility was duplicated");
      const synthesisAction = [...proposedActionValues.entries()].find(([actionId, action]) => action.kind === "PROPOSE_SYNTHESIS" && !decidedActions.has(actionId));
      const acceptedIds = [...evidence.entries()].filter(([, state]) => state === "accepted").map(([id]) => id).sort();
      const rejectedIds = [...evidence.entries()].filter(([, state]) => state === "rejected").map(([id]) => id).sort();
      for (const id of entry.payload.accepted_evidence_ids) if (evidence.get(id) !== "accepted") fail("REJECTED_EVIDENCE_REAPPEARED", `Synthesis includes non-accepted evidence ${id}`);
      for (const id of entry.payload.rejected_evidence_ids) if (evidence.get(id) !== "rejected") fail("SYNTHESIS_SET_MISMATCH", `Rejected evidence set mismatched for ${id}`);
      if (!synthesisAction || canonicalJsonV1(entry.payload.accepted_evidence_ids) !== canonicalJsonV1(acceptedIds) || canonicalJsonV1(entry.payload.rejected_evidence_ids) !== canonicalJsonV1(rejectedIds) || !HASH_RE.test(entry.payload.result_sha256) || !entry.payload.required_gap_ids.every((id) => gapStates.get(id) === "resolved")) fail("SYNTHESIS_SET_MISMATCH", "Synthesis eligibility is not the exact accepted/rejected/gap projection");
    } else if (entry.kind === "ARTIFACT_PUBLISHED") {
      publicationCount += 1;
      if (publicationCount > 1 || synthesisCount !== 1 || !HASH_RE.test(entry.payload.result_sha256) || !Array.isArray(entry.payload.artifact_paths) || entry.payload.artifact_paths.length < 1 || new Set(entry.payload.artifact_paths).size !== entry.payload.artifact_paths.length || !entry.payload.artifact_paths.every((item) => typeof item === "string" && allowedPath(item))) fail("PUBLICATION_TRANSITION_INVALID", "Publication is duplicated, unregistered, or precedes synthesis eligibility");
    } else if (entry.kind === "RUN_TERMINAL") {
      terminalCount += 1;
      const stopped = [...proposedActionValues.entries()].some(([actionId, action]) => action.kind === "STOP" && decidedActions.has(actionId));
      if (terminalCount > 1 || index !== entries.length - 1 || publicationCount !== 1 || !stopped || entry.payload.decision !== "FOUNDATION_CONFORMANT" || !HASH_RE.test(entry.payload.accounting_sha256)) fail("DUPLICATE_RUN_TERMINAL", "RUN_TERMINAL must be the sole final ledger entry after synthesis, publication, and stop");
    }
    previous = entry.entry_digest;
  }
  return { entries, last_digest: previous, operations, evidence, proposedActions, decidedActions, terminal_count: terminalCount };
}

async function readLedger(root) {
  const bytes = await readFile(path.join(root, "ledger.jsonl"));
  if (bytes.byteLength > MAX_LEDGER || !bytes.toString("utf8").endsWith("\n")) fail("LEDGER_NONCANONICAL", "Stage 2 ledger is oversized or lacks one final LF");
  const lines = bytes.toString("utf8").slice(0, -1).split("\n");
  const entries = lines.map((line, index) => {
    const value = parseStrictJson(line, `Stage 2 ledger line ${index + 1}`);
    if (canonicalJsonV1(value).slice(0, -1) !== line) fail("LEDGER_NONCANONICAL", `Ledger line ${index + 1} is not canonical`);
    return value;
  });
  return validateStage2Ledger(entries);
}

async function appendLedger(context, kind, payload) {
  const current = await readLedger(context.root).catch((error) => {
    if (error?.code === "ENOENT") return { entries: [], last_digest: ZERO, terminal_count: 0 };
    throw error;
  });
  if (current.terminal_count) fail("RUN_ALREADY_TERMINAL", "Cannot append after the run terminal");
  exactKeys(payload, payloadKeys(kind), `${kind} payload`);
  const entry = sealEntry(current.entries.length + 1, current.last_digest, kind, payload);
  const handle = await open(path.join(context.root, "ledger.jsonl"), "a");
  try { await handle.writeFile(canonicalBytes(entry)); await handle.sync(); } finally { await handle.close(); }
  const validated = await readLedger(context.root);
  if (validated.last_digest !== entry.entry_digest) fail("LEDGER_APPEND_FAILED", "Ledger append did not seal the expected tail");
  return entry;
}

async function writeCanonical(context, relativePath, value, { exclusive = true, maxBytes = MAX_JSON } = {}) {
  const target = foundation.safeArtifactPath(context.root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  const bytes = canonicalBytes(value);
  if (bytes.byteLength > maxBytes) fail("OVERSIZED_ARTIFACT", `${relativePath} exceeds its byte ceiling`);
  if (exclusive) {
    await writeFile(target, bytes, { flag: "wx" });
  } else {
    const stage = `${target}.stage`;
    await rm(stage, { force: true });
    await writeFile(stage, bytes, { flag: "wx" });
    await rename(stage, target);
  }
  return { path: relativePath, sha256: sha256V1(bytes), byte_count: bytes.byteLength };
}

async function readCanonical(root, relativePath, maxBytes = MAX_JSON) {
  const target = foundation.safeArtifactPath(root, relativePath);
  const before = await lstat(target, { bigint: true }).catch((error) => { if (error?.code === "ENOENT") fail("MISSING_ARTIFACT", `${relativePath} is missing`); throw error; });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maxBytes)) fail("ALIASED_OR_OVERSIZED_ARTIFACT", `${relativePath} is not one bounded native file`);
  if (path.resolve(await realpath(target)) !== path.resolve(target)) fail("ALIASED_ARTIFACT", `${relativePath} resolves through an alias`);
  const bytes = await readFile(target);
  const after = await lstat(target, { bigint: true });
  if (String(before.dev) !== String(after.dev) || String(before.ino) !== String(after.ino) || String(before.size) !== String(after.size) || String(before.mtimeNs) !== String(after.mtimeNs)) fail("REPLACED_ARTIFACT", `${relativePath} changed during validation`);
  const value = parseStrictJson(bytes.toString("utf8"), relativePath);
  if (!bytes.equals(canonicalBytes(value))) fail("NONCANONICAL_ARTIFACT", `${relativePath} is not canonical JSON`);
  return { value, bytes, sha256: sha256V1(bytes), byte_count: bytes.byteLength };
}

async function codeIdentity() {
  const paths = [
    "lib/recursus/prompt-context-v1.mjs",
    "lib/recursus/orchestrated-research.mjs",
    "lib/recursus/orchestrated-research-stage2.mjs",
    "scripts/recursus/orchestrated-research-stage2.mjs",
    "tests/recursus/fixtures/orchestrated-research-stage2/fake-orchestrator-actions.json",
    "tests/recursus/fixtures/orchestrated-research-stage2/fake-operation-results.json",
    "tests/recursus/fixtures/orchestrated-research-stage2/evaluator-only.json",
  ];
  const files = [];
  for (const logical_path of paths) {
    const bytes = await readFile(path.join(REPOSITORY_ROOT, ...logical_path.split("/")));
    files.push({ logical_path, sha256: sha256V1(bytes), byte_count: bytes.byteLength });
  }
  return { id: "orchestrated-research-stage2-code-v1", files, sha256: sha256V1(Buffer.from(canonicalJsonV1(files), "utf8")) };
}

async function loadInputs() {
  const [actions, results, evaluator, cases] = await Promise.all([
    readFrozenJson(ACTION_FIXTURE, FIXTURE_HASHES.actions, "Stage 2 fake orchestrator fixture"),
    readFrozenJson(RESULT_FIXTURE, FIXTURE_HASHES.results, "Stage 2 fake operation fixture"),
    readFrozenJson(EVALUATOR_FIXTURE, FIXTURE_HASHES.evaluator, "Stage 2 evaluator fixture"),
    foundation.loadFrozenInputs(),
  ]);
  exactKeys(actions.value, ["schema_version", "fixture_id", "visibility", "actions"], "fake orchestrator fixture");
  exactKeys(results.value, ["schema_version", "fixture_id", "visibility", "results", "fault_results"], "fake operation fixture");
  exactKeys(evaluator.value, ["schema_version", "fixture_id", "visibility", "leak_canary", "alternate_route_canary", "rlm_eligible_case_ids", "expected_synthesis_evidence_ids"], "Stage 2 evaluator fixture");
  if (actions.value.visibility !== "route_output" || results.value.visibility !== "route_output" || evaluator.value.visibility !== "evaluator_only") fail("VISIBILITY_CONTRACT_MISMATCH", "Stage 2 fixture visibility mismatched");
  actions.value.actions.forEach(validateOrchestratorAction);
  return { actions: actions.value, results: results.value, evaluator: evaluator.value, cases, identities: { actions: actions.sha256, results: results.sha256, evaluator: evaluator.sha256 } };
}

function accepted(entries) {
  return entries.filter((entry) => entry.kind === "EVIDENCE_ACCEPTED").map((entry) => entry.payload.evidence);
}
function rejected(entries) {
  return entries.filter((entry) => entry.kind === "EVIDENCE_REJECTED").map((entry) => entry.payload.rejection);
}
function gaps(entries) {
  const values = new Map();
  for (const entry of entries.filter((item) => item.kind === "GAP_RECORDED")) values.set(entry.payload.gap_id, entry.payload);
  return [...values.values()].sort((left, right) => left.gap_id.localeCompare(right.gap_id, "en"));
}
function circuitState(entries) {
  const failures = entries.filter((entry) => entry.kind === "OPERATION_TERMINAL" && entry.payload.failure_equivalence === "fake-rlm:LAB-01:S2-PARTITION-LAB-01" && entry.payload.status !== "success");
  const immediate = failures.some((entry) => new Set(["malformed", "unsafe", "over-budget"]).has(entry.payload.status));
  const open = immediate || failures.length >= 2;
  return { state: open ? "open" : "closed", equivalent_failures: failures.length, reason: open ? (immediate ? "immediate-critical-failure" : "two-consecutive-equivalent-failures") : "below-threshold" };
}
function activeOperation(ledger) {
  const active = [...ledger.operations.entries()].filter(([, state]) => state === "admitted" || state === "dispatched");
  if (active.length > 1) fail("CONCURRENT_OPERATION_DENIED", "Ledger contains concurrent operations");
  return active[0]?.[0] ?? null;
}

export function decideActionAdmission(action, state) {
  validateOrchestratorAction(action);
  if (action.checkpoint_id !== state.checkpoint_id) return { admitted: false, reason: "STALE_CHECKPOINT" };
  if (state.active_operation !== null) return { admitted: false, reason: "CONCURRENT_OPERATION_DENIED" };
  if (!action.operation_id) return { admitted: true, reason: "HOST_NONEXECUTABLE_ACTION_ACCEPTED" };
  if ((state.fake_operation_dispatches ?? 0) >= budgetContract().max_fake_operation_dispatches) return { admitted: false, reason: "OPERATION_BUDGET_EXHAUSTED" };
  const registered = OPERATION_REGISTRY[action.operation_id];
  if (!registered || registered.kind !== action.kind || registered.case_id !== action.case_id || registered.objective_id !== action.objective_id || registered.source_partition_id !== action.source_partition_id || registered.gap_id !== (action.gap_id ?? null) || canonicalJsonV1(registered.limits) !== canonicalJsonV1(action.limits)) return { admitted: false, reason: "UNREGISTERED_OR_MISMATCHED_OPERATION" };
  if (state.used_operation_ids.has(action.operation_id)) return { admitted: false, reason: "DUPLICATE_OPERATION_DENIED" };
  if (action.kind === "REQUEST_RLM_OPERATION" && !state.rlm_eligible_case_ids.includes(action.case_id)) return { admitted: false, reason: "RLM_NOT_ELIGIBLE" };
  if (action.kind === "REQUEST_RLM_OPERATION" && state.circuit.state === "open") return { admitted: false, reason: "CIRCUIT_OPEN" };
  if (action.kind === "REQUEST_DIRECT_GAP_FILL") {
    const gap = state.gaps.find((item) => item.gap_id === action.gap_id);
    if (!gap || gap.disposition !== "open") return { admitted: false, reason: "GAP_NOT_OPEN" };
    if (action.operation_id === "S2-OP-DIRECT-LAB-FALLBACK" && state.circuit.state !== "open") return { admitted: false, reason: "FALLBACK_NOT_ENABLED" };
  }
  return { admitted: true, reason: "HOST_OPERATION_ADMITTED", registered };
}

function checkpointValue(ledger, ordinal) {
  return {
    schema_version: "orchestrated-research-stage2-checkpoint-v1",
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "validated-host-ledger-projection",
    checkpoint_id: `S2-CHECKPOINT-${String(ordinal).padStart(4, "0")}`,
    run_id: RUN_ID,
    action_ordinal: ordinal,
    accepted_evidence_ids: accepted(ledger.entries).map((item) => item.evidence_id).sort(),
    rejected_evidence_ids: rejected(ledger.entries).map((item) => item.evidence_id).sort(),
    gaps: gaps(ledger.entries).map((item) => ({ gap_id: item.gap_id, disposition: item.disposition, reason: item.reason })),
    circuit: circuitState(ledger.entries),
    ledger_sequence: ledger.entries.length,
    ledger_tail_digest: ledger.last_digest,
  };
}

function hostState(ledger, checkpoint, inputs) {
  return {
    checkpoint_id: checkpoint.checkpoint_id,
    active_operation: activeOperation(ledger),
    used_operation_ids: new Set([...ledger.operations.keys()]),
    fake_operation_dispatches: ledger.entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED").length,
    gaps: gaps(ledger.entries),
    circuit: circuitState(ledger.entries),
    rlm_eligible_case_ids: inputs.evaluator.rlm_eligible_case_ids,
  };
}

function orchestratorView(ledger, checkpoint) {
  return {
    schema_version: "orchestrated-research-stage2-orchestrator-input-v1",
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "host-validated-route-visible-projection",
    run_id: RUN_ID,
    checkpoint_id: checkpoint.checkpoint_id,
    accepted_evidence: accepted(ledger.entries).map((item) => ({ evidence_id: item.evidence_id, class: item.class, assertion: item.assertion, locators: item.locators })),
    open_gaps: gaps(ledger.entries).filter((item) => item.disposition === "open").map((item) => ({ gap_id: item.gap_id, importance: item.importance, reason: item.reason })),
    budgets: budgetContract(),
    allowed_actions: [...STAGE2_ACTIONS],
    denial_descriptions: ["unknown actions fail closed", "RLM requires registered eligibility", "one operation at a time", "recursive depth one", "budgets and permissions are host-owned"],
  };
}

function operationInput(action, ledger, inputs) {
  const caseContext = inputs.cases.cases.get(action.case_id);
  if (!caseContext) fail("UNREGISTERED_SOURCE_PARTITION", `No registered source projection exists for ${action.case_id}`);
  return {
    schema_version: "orchestrated-research-stage2-operation-input-v1",
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "host-admitted-provider-free-operation",
    run_id: RUN_ID,
    action_id: action.action_id,
    operation_id: action.operation_id,
    operation_kind: action.kind,
    case_id: action.case_id,
    objective_id: action.objective_id,
    source_partition_id: action.source_partition_id,
    gap_id: action.gap_id ?? null,
    source_projection: caseContext.sources.map((source) => ({
      source_id: source.source_id,
      sha256: source.sha256,
      content_kind: source.content_kind,
      bytes_utf8: source.bytes.toString("utf8"),
    })),
    accepted_evidence_projection: accepted(ledger.entries).map((item) => ({ evidence_id: item.evidence_id, class: item.class, assertion: item.assertion, locators: item.locators })),
    explicit_gaps: gaps(ledger.entries).filter((item) => item.disposition === "open").map((item) => ({ gap_id: item.gap_id, reason: item.reason })),
    limits: action.limits,
    recursive_depth: action.kind === "REQUEST_RLM_OPERATION" ? action.recursive_depth : 0,
    output_grammar: { evidence_classes: ["candidate_fact", "target_fact", "research_relationship", "research_inference", "exact_computation", "contradiction", "gap"], authority: "proposal-only-host-validates" },
  };
}

function resultForOperation(inputs, action, fault) {
  const base = structuredClone(inputs.results.results.find((item) => item.operation_id === action.operation_id));
  if (!base) fail("MISSING_FAKE_OPERATION", `No fake result exists for ${action.operation_id}`);
  if (action.operation_id === "S2-OP-RLM-LAB-01" && fault?.startsWith("rlm-")) return { ...structuredClone(inputs.results.fault_results[fault]), operation_id: action.operation_id, case_id: action.case_id };
  return base;
}

function validateFakeResult(result, action) {
  exactKeys(result, ["operation_id", "case_id", "status", "candidates", "usage"], "fake operation result");
  exactKeys(result.usage, ["fake_worker_requests", "fake_compute_units", "provider_requests", "rlm_executions"], "fake operation usage");
  if (result.operation_id !== action.operation_id || result.case_id !== action.case_id || result.usage.provider_requests !== 0 || result.usage.rlm_executions !== 0 || result.usage.fake_worker_requests !== 1 || !Number.isInteger(result.usage.fake_compute_units) || result.usage.fake_compute_units < 0) fail("FAKE_OPERATION_IDENTITY_MISMATCH", "Fake result identity or authority mismatched");
  if (!new Set(["success", "failed", "timeout", "malformed", "unsafe", "over-budget", "unavailable"]).has(result.status)) fail("MALFORMED_FAKE_OPERATION", "Fake result terminal is unknown");
  if (!Array.isArray(result.candidates) || result.candidates.length > action.limits.max_candidates || new Set(result.candidates).size !== result.candidates.length || !result.candidates.every((candidateId) => typeof candidateId === "string" && ID_RE.test(candidateId))) fail("MALFORMED_FAKE_OPERATION", "Fake result candidates are not one bounded identity set");
  if (!new Set(["success", "unsafe"]).has(result.status) && result.candidates.length) fail("MALFORMED_FAKE_OPERATION", "A non-evidence terminal cannot carry candidates");
  if (result.usage.fake_compute_units > 1) return { status: "over-budget", candidates: [] };
  return { status: result.status, candidates: result.candidates };
}

async function appendDecision(context, action, { admitted, reason, operationId = "NONE", nextAction = "CONTINUE", ordinal }) {
  const ledger = await readLedger(context.root);
  const a = accepted(ledger.entries).map((item) => item.evidence_id).sort();
  const r = rejected(ledger.entries).map((item) => item.evidence_id).sort();
  await appendLedger(context, "DECISION_RECORDED", {
    action_id: action.action_id,
    decision_id: `S2-DECISION-${action.action_id}`,
    operation_id: operationId,
    admission_status: admitted ? "admitted" : "denied",
    evidence_considered: [...a, ...r].sort(),
    accepted_count: a.length,
    rejected_count: r.length,
    next_action: nextAction,
    reason,
    circuit: circuitState(ledger.entries),
    checkpoint_id: `S2-CHECKPOINT-${String(ordinal).padStart(4, "0")}`,
  });
  const sealed = await readLedger(context.root);
  await writeCanonical(context, "checkpoint.json", checkpointValue(sealed, ordinal), { exclusive: false, maxBytes: 262144 });
}

async function processEvidence(context, inputs, action, candidates) {
  const caseContext = inputs.cases.cases.get(action.case_id);
  for (const candidateId of candidates) {
    const sourceOperation = [...inputs.cases.cases.values()].map((item) => item.operation).find((item) => item.candidates.some((candidate) => candidate.candidate_id === candidateId));
    const candidate = structuredClone(sourceOperation?.candidates.find((item) => item.candidate_id === candidateId));
    if (!candidate) fail("MISSING_FAKE_EVIDENCE", `No frozen evidence candidate ${candidateId}`);
    if (action.kind === "REQUEST_RLM_OPERATION") candidate.origin = "rlm";
    await appendLedger(context, "EVIDENCE_PROPOSED", { operation_id: action.operation_id, candidate });
    const decision = evaluateEvidenceCandidate(candidate, caseContext);
    if (decision.accepted) await appendLedger(context, "EVIDENCE_ACCEPTED", { operation_id: action.operation_id, evidence: decision });
    else await appendLedger(context, "EVIDENCE_REJECTED", { operation_id: action.operation_id, rejection: decision });
  }
}

async function terminalizeOperation(context, inputs, action, fault, { recoveryStatus = null } = {}) {
  const operationPath = `operations/${action.operation_id}`;
  let status;
  let candidateIds = [];
  let usage = { fake_worker_requests: recoveryStatus === "cancelled-before-dispatch" ? 0 : 1, fake_compute_units: 0, provider_requests: 0, rlm_executions: 0 };
  if (recoveryStatus) status = recoveryStatus;
  else {
    const raw = resultForOperation(inputs, action, fault);
    const validated = validateFakeResult(raw, action);
    status = validated.status;
    candidateIds = validated.candidates;
    usage = raw.usage;
  }
  let evidenceSha256 = ZERO;
  if (candidateIds.length) {
    const artifact = { schema_version: "orchestrated-research-stage2-operation-evidence-v1", producer: action.kind === "REQUEST_RLM_OPERATION" ? "deterministic-fake-rlm-v1" : "deterministic-fake-direct-v1", provenance: "registered-provider-free-fixture", operation_id: action.operation_id, case_id: action.case_id, candidate_ids: candidateIds };
    evidenceSha256 = (await writeCanonical(context, `${operationPath}/evidence.json`, artifact, { maxBytes: 262144 })).sha256;
  }
  const terminal = { schema_version: "orchestrated-research-stage2-operation-terminal-v1", producer: recoveryStatus ? "lib/recursus/orchestrated-research-stage2.mjs" : "deterministic-fake-operation-v1", provenance: recoveryStatus ? "host-no-replay-recovery" : "registered-provider-free-fixture", operation_id: action.operation_id, status, evidence_sha256: evidenceSha256, usage };
  const terminalFile = await writeCanonical(context, `${operationPath}/terminal.json`, terminal, { maxBytes: 65536 });
  const failureEquivalence = action.kind === "REQUEST_RLM_OPERATION" ? `fake-rlm:${action.case_id}:${action.source_partition_id}` : "NONE";
  await appendLedger(context, "OPERATION_TERMINAL", { operation_id: action.operation_id, status, terminal_sha256: terminalFile.sha256, evidence_sha256: evidenceSha256, worker_requests: usage.fake_worker_requests, failure_equivalence: failureEquivalence });
  if (candidateIds.length) await processEvidence(context, inputs, action, candidateIds);
  return { status, candidateIds };
}

function injectionPoint(fault, expected, action) {
  if (fault === expected && action.operation_id === "S2-OP-RLM-LAB-01") fail("INJECTED_STAGE2_INTERRUPTION", `Injected Stage 2 interruption at ${expected}`);
}

async function executeAdmittedOperation(context, inputs, action, fault, ordinal) {
  const ledger = await readLedger(context.root);
  const input = operationInput(action, ledger, inputs);
  const inputFile = await writeCanonical(context, `operations/${action.operation_id}/input.json`, input, { maxBytes: 262144 });
  await appendLedger(context, "OPERATION_ADMITTED", { action_id: action.action_id, operation_id: action.operation_id, operation_kind: action.kind, case_id: action.case_id, objective_id: action.objective_id, source_partition_id: action.source_partition_id, input_sha256: inputFile.sha256, limits: action.limits, recursive_depth: action.kind === "REQUEST_RLM_OPERATION" ? 1 : 0 });
  injectionPoint(fault, "after-operation-admission", action);
  await appendLedger(context, "OPERATION_DISPATCHED", { operation_id: action.operation_id, worker_identity: action.kind === "REQUEST_RLM_OPERATION" ? "deterministic-fake-rlm-v1" : "deterministic-fake-direct-v1", dispatch_classification: "local-provider-free-worker-reachable" });
  injectionPoint(fault, "after-operation-dispatch", action);
  const terminal = await terminalizeOperation(context, inputs, action, fault);
  injectionPoint(fault, "after-operation-terminal", action);
  if (action.kind === "REQUEST_DIRECT_GAP_FILL" && terminal.status === "success") {
    await appendLedger(context, "GAP_RECORDED", { gap_id: action.gap_id, action_id: action.action_id, operation_id: action.operation_id, importance: "required", attempted_operations: ["S2-OP-RLM-LAB-01", "S2-OP-RLM-LAB-02", action.operation_id], disposition: "resolved", reason: "registered-direct-fallback-accepted-source-grounded-evidence" });
  }
  const nextAction = terminal.status === "success" ? "CONTINUE" : "REGISTERED_FALLBACK_OR_STOP";
  await appendDecision(context, action, { admitted: true, reason: `OPERATION_${terminal.status.toUpperCase().replaceAll("-", "_")}`, operationId: action.operation_id, nextAction, ordinal });
  if (fault === "after-evidence-checkpoint" && action.operation_id === "S2-OP-DIRECT-FACT-01") fail("INJECTED_STAGE2_INTERRUPTION", "Injected Stage 2 interruption after evidence checkpoint");
}

function resultValue(entries) {
  return {
    schema_version: "orchestrated-research-stage2-result-v1",
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "host-synthesis-from-accepted-evidence-only",
    run_id: RUN_ID,
    status: "provider-free-orchestrator-contract-complete",
    accepted_evidence: accepted(entries).map((item) => ({ evidence_id: item.evidence_id, class: item.class, assertion: item.assertion, locators: item.locators, origin: item.origin })),
    rejected_evidence_ids: rejected(entries).map((item) => item.evidence_id).sort(),
    gaps: gaps(entries).map((item) => ({ gap_id: item.gap_id, disposition: item.disposition, reason: item.reason })),
    nonclaims: ["No provider, real RLM, credential, network, model-generated program, Docker, WSL, live data, or external mutation was exercised.", "Stage 2 does not prove a live Codex orchestrator, RLM value, production readiness, or Career Ops integration."],
  };
}

async function handleProposedAction(context, inputs, action, fault, ordinal) {
  const checkpoint = (await readCanonical(context.root, "checkpoint.json", 262144)).value;
  const ledger = await readLedger(context.root);
  const decision = decideActionAdmission(action, hostState(ledger, checkpoint, inputs));
  if (!decision.admitted) {
    await appendDecision(context, action, { admitted: false, reason: decision.reason, operationId: action.operation_id ?? "NONE", nextAction: decision.reason === "CIRCUIT_OPEN" ? "REGISTERED_FALLBACK_OR_STOP" : "CONTINUE", ordinal });
    return;
  }
  if (action.operation_id) {
    await executeAdmittedOperation(context, inputs, action, fault, ordinal);
    return;
  }
  if (action.kind === "RECORD_GAP") {
    await appendLedger(context, "GAP_RECORDED", { gap_id: "S2-GAP-LAB-01", action_id: action.action_id, operation_id: "NONE", importance: action.importance, attempted_operations: [], disposition: "open", reason: action.description });
    await appendDecision(context, action, { admitted: true, reason: "HOST_ASSIGNED_DURABLE_GAP_ID", nextAction: "CONTINUE", ordinal });
    return;
  }
  if (action.kind === "PROPOSE_SYNTHESIS") {
    const current = await readLedger(context.root);
    const acceptedIds = accepted(current.entries).map((item) => item.evidence_id).sort();
    const rejectedIds = rejected(current.entries).map((item) => item.evidence_id).sort();
    const open = gaps(current.entries).filter((item) => item.disposition === "open");
    if (canonicalJsonV1(acceptedIds) !== canonicalJsonV1([...action.accepted_evidence_ids].sort()) || open.length || !action.required_gap_ids.every((id) => gaps(current.entries).some((item) => item.gap_id === id && item.disposition === "resolved"))) fail("SYNTHESIS_NOT_ELIGIBLE", "Synthesis proposal does not match the host accepted set and resolved required gaps");
    const result = resultValue(current.entries);
    const resultFile = await writeCanonical(context, "result.json", result, { maxBytes: 262144 });
    const eligibility = { schema_version: "orchestrated-research-stage2-synthesis-eligibility-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "host-validated-accepted-evidence-set", eligibility_id: "S2-SYNTHESIS-01", accepted_evidence_ids: acceptedIds, rejected_evidence_ids: rejectedIds, required_gap_ids: action.required_gap_ids, result_sha256: resultFile.sha256 };
    await writeCanonical(context, "synthesis-eligibility.json", eligibility, { maxBytes: 262144 });
    await appendLedger(context, "SYNTHESIS_ELIGIBLE", { eligibility_id: eligibility.eligibility_id, accepted_evidence_ids: acceptedIds, rejected_evidence_ids: rejectedIds, required_gap_ids: action.required_gap_ids, result_sha256: resultFile.sha256 });
    await appendDecision(context, action, { admitted: true, reason: "SYNTHESIS_ELIGIBLE_ACCEPTED_ONLY", nextAction: "STOP", ordinal });
    return;
  }
  if (action.kind === "STOP") {
    await appendDecision(context, action, { admitted: true, reason: action.reason, nextAction: "STOP", ordinal });
    await finalizeRun(context, inputs, fault);
  }
}

async function processAction(context, inputs, action, fault, ordinal) {
  const checkpoint = (await readCanonical(context.root, "checkpoint.json", 262144)).value;
  if (action.checkpoint_id !== checkpoint.checkpoint_id) fail("STALE_CHECKPOINT", `Action ${action.action_id} references ${action.checkpoint_id}, expected ${checkpoint.checkpoint_id}`);
  const view = orchestratorView(await readLedger(context.root), checkpoint);
  await writeCanonical(context, `orchestrator/${action.action_id}/input.json`, view, { maxBytes: 262144 });
  const outputFile = await writeCanonical(context, `orchestrator/${action.action_id}/output.json`, action, { maxBytes: 65536 });
  await appendLedger(context, "ACTION_PROPOSED", { action_id: action.action_id, checkpoint_id: action.checkpoint_id, action_sha256: outputFile.sha256, action });
  if (action.kind === "PROPOSE_SYNTHESIS" && fault === "before-synthesis") fail("INJECTED_STAGE2_INTERRUPTION", "Injected interruption before synthesis admission");
  await handleProposedAction(context, inputs, action, fault, ordinal);
}

function accountingValue(entries) {
  const terminals = entries.filter((entry) => entry.kind === "OPERATION_TERMINAL");
  const admitted = entries.filter((entry) => entry.kind === "OPERATION_ADMITTED");
  const dispatches = entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED");
  const admissionByOperation = new Map(admitted.map((entry) => [entry.payload.operation_id, entry]));
  let circuitOpenEvents = 0;
  let priorCircuit = "closed";
  for (const entry of entries.filter((item) => item.kind === "DECISION_RECORDED")) {
    if (priorCircuit === "closed" && entry.payload.circuit.state === "open") circuitOpenEvents += 1;
    priorCircuit = entry.payload.circuit.state;
  }
  return {
    schema_version: "orchestrated-research-stage2-accounting-v1",
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "validated-host-ledger-counts",
    provider_requests: 0, credential_accesses: 0, rlm_executions: 0, network_actions: 0, docker_invocations: 0, wsl_invocations: 0, external_mutations: 0, retries: 0,
    fake_operation_dispatches: dispatches.length,
    fake_direct_dispatches: dispatches.filter((entry) => admissionByOperation.get(entry.payload.operation_id)?.payload.operation_kind !== "REQUEST_RLM_OPERATION").length,
    fake_rlm_dispatches: dispatches.filter((entry) => admissionByOperation.get(entry.payload.operation_id)?.payload.operation_kind === "REQUEST_RLM_OPERATION").length,
    denied_actions: entries.filter((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.admission_status === "denied").length,
    circuit_open_events: circuitOpenEvents,
    accepted_evidence: accepted(entries).length,
    rejected_evidence: rejected(entries).length,
    operation_terminals: terminals.length,
    terminal_decisions: 1,
    cleanup_failures: 0,
    residue_count: 0,
  };
}

async function listFiles(root) {
  const output = [];
  async function visit(directory, prefix = "") {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relative === foundation.LOCK_NAME) continue;
      const absolute = path.join(directory, entry.name);
      const info = await lstat(absolute, { bigint: true });
      if (info.isSymbolicLink() || path.resolve(await realpath(absolute)) !== path.resolve(absolute)) fail("ALIASED_ARTIFACT", `${relative} is aliased`);
      if (info.isDirectory()) await visit(absolute, relative);
      else if (info.isFile() && info.nlink === 1n) output.push(relative);
      else fail("ALIASED_ARTIFACT", `${relative} is not one native file`);
    }
  }
  await visit(root);
  if (process.platform === "win32") {
    const escapedRoot = root.replaceAll("'", "''");
    const command = [
      "$ErrorActionPreference='Stop'",
      `$rootPath='${escapedRoot}'`,
      "$items=@(Get-Item -LiteralPath $rootPath -Force)+@(Get-ChildItem -LiteralPath $rootPath -Force -Recurse)",
      "$result=@($items|ForEach-Object{$streams=@();if(-not $_.PSIsContainer){$streams=@(Get-Item -LiteralPath $_.FullName -Stream *|ForEach-Object{$_.Stream})};[ordered]@{path=$_.FullName;attributes=@([string]$_.Attributes -split ', ');streams=$streams}})",
      "$result|ConvertTo-Json -Compress -Depth 4",
    ].join(";");
    const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", timeout: 30_000, windowsHide: true, maxBuffer: 4_194_304 });
    if (result.status !== 0 || result.error) fail("PHYSICAL_INSPECTION_FAILED", "PowerShell Stage 2 package inspection failed", { status: result.status });
    let items;
    try { const parsed = JSON.parse(result.stdout.trim()); items = Array.isArray(parsed) ? parsed : [parsed]; }
    catch { fail("PHYSICAL_INSPECTION_FAILED", "PowerShell returned malformed Stage 2 package metadata"); }
    for (const item of items) {
      const attributes = Array.isArray(item.attributes) ? item.attributes : [item.attributes].filter(Boolean);
      const streams = Array.isArray(item.streams) ? item.streams : [item.streams].filter(Boolean);
      if (attributes.includes("ReparsePoint")) fail("ALIASED_ARTIFACT", `${item.path} is a reparse point`);
      if (attributes.includes("SparseFile")) fail("SPARSE_FILE", `${item.path} is sparse`);
      const alternateStreams = streams.filter((stream) => !new Set(["$DATA", ":$DATA"]).has(stream));
      if (alternateStreams.length) fail("ALTERNATE_DATA_STREAM", `${item.path} has alternate data streams`, { streams: alternateStreams });
    }
  }
  return output.sort();
}

function allowedPath(relative) {
  if (new Set(["registration.json", "source-manifest.json", "plan.json", "ledger.jsonl", "checkpoint.json", "synthesis-eligibility.json", "result.json", "accounting.json", "terminal.json", "summary.json"]).has(relative)) return true;
  return /^(?:orchestrator\/[A-Z0-9._-]+\/(?:input|output)|operations\/[A-Z0-9._-]+\/(?:input|terminal|evidence))\.json$/u.test(relative);
}

function artifactLimit(relative) {
  if (relative === "ledger.jsonl") return MAX_LEDGER;
  if (relative === "source-manifest.json") return 524288;
  if (new Set(["accounting.json", "terminal.json"]).has(relative) || /\/terminal\.json$/u.test(relative) || /\/output\.json$/u.test(relative)) return 65536;
  return 262144;
}

async function inventory(root) {
  const files = (await listFiles(root)).filter((item) => item !== "summary.json");
  const items = [];
  for (const relative of files) {
    const bytes = await readFile(path.join(root, ...relative.split("/")));
    items.push({ path: relative, media_type: relative === "ledger.jsonl" ? "application/x-ndjson" : "application/json", byte_count: bytes.byteLength, sha256: sha256V1(bytes), producer: relative.includes("/terminal.json") || relative.includes("/evidence.json") ? "deterministic-fake-operation-or-host" : "lib/recursus/orchestrated-research-stage2.mjs", provenance: "provider-free-stage2-run-package", byte_ceiling: artifactLimit(relative), independent_validation_rule: "closed-schema-canonical-bytes-ledger-source-and-physical-identity-cross-check" });
  }
  return items;
}

async function finalizeRun(context, inputs, fault) {
  let ledger = await readLedger(context.root);
  const result = await readCanonical(context.root, "result.json", 262144);
  if (!ledger.entries.some((entry) => entry.kind === "ARTIFACT_PUBLISHED")) {
    if (fault === "during-publication") fail("INJECTED_STAGE2_INTERRUPTION", "Injected interruption during publication");
    await appendLedger(context, "ARTIFACT_PUBLISHED", { publication_id: "S2-PUBLICATION-01", result_sha256: result.sha256, artifact_paths: (await listFiles(context.root)).filter((item) => !new Set(["summary.json", "terminal.json", "accounting.json"]).has(item)) });
  }
  ledger = await readLedger(context.root);
  const accounting = accountingValue(ledger.entries);
  const accountingFile = await writeCanonical(context, "accounting.json", accounting, { maxBytes: 65536 });
  const checkpoint = (await readCanonical(context.root, "checkpoint.json", 262144)).value;
  await appendLedger(context, "RUN_TERMINAL", { terminal_id: `S2-TERMINAL-${RUN_ID}`, decision: "FOUNDATION_CONFORMANT", reason: "closed-provider-free-orchestrator-contract-exercised", accounting_sha256: accountingFile.sha256, last_checkpoint_id: checkpoint.checkpoint_id });
  ledger = await readLedger(context.root);
  const terminal = { schema_version: "orchestrated-research-stage2-terminal-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "single-host-ledger-terminal", terminal_id: `S2-TERMINAL-${RUN_ID}`, run_id: RUN_ID, decision: "FOUNDATION_CONFORMANT", reason: "closed-provider-free-orchestrator-contract-exercised", last_checkpoint_id: checkpoint.checkpoint_id, ledger_sequence: ledger.entries.length, last_ledger_digest: ledger.last_digest, accounting_sha256: accountingFile.sha256 };
  await writeCanonical(context, "terminal.json", terminal, { maxBytes: 65536 });
  await writeSummary(context);
}

function normalizeEntry(entry, previous) {
  const payload = structuredClone(entry.payload);
  if (entry.kind === "RUN_REGISTERED") payload.physical_root_binding = { classification: "safe-external-disposable-root", validated: true };
  return sealEntry(entry.sequence, previous, entry.kind, payload);
}

export async function normalizedStage2PreparationBytes(root) {
  const context = await foundation.validateDisposableRoot(root);
  const files = (await listFiles(context.root)).filter((item) => item !== "summary.json");
  const artifacts = [];
  for (const relative of files) {
    if (relative === "ledger.jsonl") {
      const ledger = await readLedger(context.root);
      let previous = ZERO;
      const entries = ledger.entries.map((entry) => { const sealed = normalizeEntry(entry, previous); previous = sealed.entry_digest; return sealed; });
      artifacts.push({ path: relative, media_type: "application/x-ndjson", value: entries });
    } else {
      const artifact = await readCanonical(context.root, relative);
      const value = structuredClone(artifact.value);
      if (relative === "registration.json") value.physical_root_binding = { classification: "safe-external-disposable-root", validated: true };
      if (relative === "checkpoint.json") value.ledger_tail_digest = "normalized-ledger-tail";
      if (relative === "terminal.json") value.last_ledger_digest = "normalized-ledger-tail";
      artifacts.push({ path: relative, media_type: "application/json", value });
    }
  }
  return canonicalBytes({ schema_version: "orchestrated-research-stage2-normalized-capture-v1", physical_identity: "excluded-safe-external-disposable-root", observation_only_fields: "excluded", artifacts });
}

async function writeSummary(context) {
  const bytes = await normalizedStage2PreparationBytes(context.root);
  const summary = { schema_version: "orchestrated-research-stage2-summary-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "validated-provider-free-stage2-package", run_id: RUN_ID, state: "complete", decision: "FOUNDATION_CONFORMANT", artifact_inventory: await inventory(context.root), normalized_capture_sha256: sha256V1(bytes) };
  summary.summary_projection_sha256 = sha256V1(Buffer.from(canonicalJsonV1(summary), "utf8"));
  await writeCanonical(context, "summary.json", summary, { maxBytes: 262144 });
}

function ledgerPrefix(entries, endExclusive) {
  return validateStage2Ledger(entries.slice(0, endExclusive));
}

async function validateArtifactBindings(context, inputs, ledger) {
  for (const entry of ledger.entries) {
    if (entry.kind === "ACTION_PROPOSED") {
      const directory = `orchestrator/${entry.payload.action_id}`;
      const registeredAction = inputs.actions.actions.find((action) => action.action_id === entry.payload.action_id);
      if (!registeredAction || canonicalJsonV1(registeredAction) !== canonicalJsonV1(entry.payload.action)) fail("UNREGISTERED_ACTION", `${entry.payload.action_id} is not the frozen orchestrator proposal`);
      const output = await readCanonical(context.root, `${directory}/output.json`, 65536);
      if (output.sha256 !== entry.payload.action_sha256 || canonicalJsonV1(output.value) !== canonicalJsonV1(entry.payload.action)) fail("ACTION_ARTIFACT_MISMATCH", `${entry.payload.action_id} output is not the ledger-bound proposal`);
      const before = ledgerPrefix(ledger.entries, entry.sequence - 1);
      const actionOrdinal = Number(entry.payload.checkpoint_id.slice("S2-CHECKPOINT-".length));
      const expectedCheckpoint = checkpointValue(before, actionOrdinal);
      if (expectedCheckpoint.checkpoint_id !== entry.payload.checkpoint_id) fail("ACTION_CHECKPOINT_MISMATCH", `${entry.payload.action_id} does not follow the expected checkpoint`);
      const input = await readCanonical(context.root, `${directory}/input.json`, 262144);
      if (canonicalJsonV1(input.value) !== canonicalJsonV1(orchestratorView(before, expectedCheckpoint))) fail("ORCHESTRATOR_VIEW_MISMATCH", `${entry.payload.action_id} input is not the route-visible host projection`);
    }
    if (entry.kind === "OPERATION_ADMITTED") {
      const action = inputs.actions.actions.find((item) => item.action_id === entry.payload.action_id);
      const input = await readCanonical(context.root, `operations/${entry.payload.operation_id}/input.json`, 262144);
      if (input.sha256 !== entry.payload.input_sha256 || canonicalJsonV1(input.value) !== canonicalJsonV1(operationInput(action, ledgerPrefix(ledger.entries, entry.sequence - 1), inputs))) fail("OPERATION_INPUT_MISMATCH", `${entry.payload.operation_id} input is not the admitted host projection`);
    }
    if (entry.kind === "OPERATION_TERMINAL") {
      const terminal = await readCanonical(context.root, `operations/${entry.payload.operation_id}/terminal.json`, 65536);
      exactKeys(terminal.value, ["schema_version", "producer", "provenance", "operation_id", "status", "evidence_sha256", "usage"], "operation terminal artifact");
      if (terminal.sha256 !== entry.payload.terminal_sha256 || terminal.value.operation_id !== entry.payload.operation_id || terminal.value.status !== entry.payload.status || terminal.value.evidence_sha256 !== entry.payload.evidence_sha256 || terminal.value.usage.fake_worker_requests !== entry.payload.worker_requests || terminal.value.usage.provider_requests !== 0 || terminal.value.usage.rlm_executions !== 0) fail("OPERATION_TERMINAL_MISMATCH", `${entry.payload.operation_id} terminal is not the ledger-bound zero-authority result`);
      if (entry.payload.evidence_sha256 !== ZERO) {
        const evidence = await readCanonical(context.root, `operations/${entry.payload.operation_id}/evidence.json`, 262144);
        if (evidence.sha256 !== entry.payload.evidence_sha256 || evidence.value.operation_id !== entry.payload.operation_id) fail("OPERATION_EVIDENCE_MISMATCH", `${entry.payload.operation_id} evidence artifact is not ledger-bound`);
        const proposedIds = ledger.entries.filter((item) => item.kind === "EVIDENCE_PROPOSED" && item.payload.operation_id === entry.payload.operation_id).map((item) => item.payload.candidate.candidate_id);
        if (canonicalJsonV1(evidence.value.candidate_ids) !== canonicalJsonV1(proposedIds)) fail("OPERATION_EVIDENCE_MISMATCH", `${entry.payload.operation_id} evidence identities do not match the ledger`);
      }
    }
    if (entry.kind === "EVIDENCE_PROPOSED") {
      const admission = ledger.entries.find((item) => item.kind === "OPERATION_ADMITTED" && item.payload.operation_id === entry.payload.operation_id);
      const caseContext = inputs.cases.cases.get(admission?.payload.case_id);
      const sourceCandidate = [...inputs.cases.cases.values()].flatMap((item) => item.operation.candidates).find((item) => item.candidate_id === entry.payload.candidate.candidate_id);
      if (!admission || !caseContext || !sourceCandidate) fail("UNREGISTERED_EVIDENCE", `Evidence from ${entry.payload.operation_id} lacks a registered source`);
      const expectedCandidate = structuredClone(sourceCandidate);
      if (admission.payload.operation_kind === "REQUEST_RLM_OPERATION") expectedCandidate.origin = "rlm";
      if (canonicalJsonV1(entry.payload.candidate) !== canonicalJsonV1(expectedCandidate)) fail("EVIDENCE_PROPOSAL_MISMATCH", `${entry.payload.candidate.candidate_id} differs from its frozen proposal`);
      const expectedDecision = evaluateEvidenceCandidate(expectedCandidate, caseContext);
      const evidenceId = `EVIDENCE-${expectedCandidate.candidate_id}`;
      const decision = ledger.entries.find((item) => (item.kind === "EVIDENCE_ACCEPTED" ? item.payload.evidence.evidence_id : item.kind === "EVIDENCE_REJECTED" ? item.payload.rejection.evidence_id : null) === evidenceId);
      if (!decision || canonicalJsonV1(decision.kind === "EVIDENCE_ACCEPTED" ? decision.payload.evidence : decision.payload.rejection) !== canonicalJsonV1(expectedDecision) || (decision.kind === "EVIDENCE_ACCEPTED") !== expectedDecision.accepted) fail("EVIDENCE_DECISION_MISMATCH", `${evidenceId} does not match independent candidate-fact validation`);
    }
    if (entry.kind === "ARTIFACT_PUBLISHED") {
      const result = await readCanonical(context.root, "result.json", 262144);
      if (result.sha256 !== entry.payload.result_sha256) fail("PUBLICATION_MISMATCH", "Published result identity drifted");
    }
    if (entry.kind === "RUN_TERMINAL") {
      const accounting = await readCanonical(context.root, "accounting.json", 65536);
      if (accounting.sha256 !== entry.payload.accounting_sha256) fail("ACCOUNTING_MISMATCH", "Terminal accounting identity drifted");
    }
  }
}

async function registrationValue(context, inputs) {
  const code = await codeIdentity();
  const sourceCases = inputs.cases.source_manifest_cases;
  const sourceIdentity = sha256V1(Buffer.from(canonicalJsonV1(sourceCases), "utf8"));
  return { schema_version: "orchestrated-research-stage2-registration-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "provider-free-stage2-orchestrator-contract", run_id: RUN_ID, route_id: ROUTE_ID, question_identity: { id: "ORCHESTRATED-RESEARCH-STAGE2-QUESTION-01", sha256: sha256V1(Buffer.from("closed orchestrator action and host admission contract", "utf8")) }, source_identity: { id: "ORCHESTRATED-RESEARCH-STAGE2-SOURCES-01", sha256: sourceIdentity }, permission_contract: permissionContract(), budget_contract: budgetContract(), evaluator_identity: { id: inputs.evaluator.fixture_id, sha256: inputs.identities.evaluator }, code_identity: code, action_grammar_identity: { id: "ORCHESTRATED-RESEARCH-STAGE2-ACTION-GRAMMAR-01", kinds: [...STAGE2_ACTIONS], sha256: sha256V1(Buffer.from(canonicalJsonV1(STAGE2_ACTIONS), "utf8")) }, physical_root_binding: context.binding };
}

function sourceManifestValue(inputs) {
  return { schema_version: "orchestrated-research-stage2-source-manifest-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "registered-frozen-synthetic-sources", visibility_policy: { route_visible: "source bytes, accepted evidence, gaps, limits, and closed denials", host_only: "paths, ledger, admission, budgets, circuit, accounting, recovery, and cleanup", evaluator_only: "canonical claims, canaries, eligibility, expected synthesis, and alternate-route output" }, cases: inputs.cases.source_manifest_cases, evaluator_contract: { id: inputs.evaluator.fixture_id, sha256: inputs.identities.evaluator, included_in_orchestrator_or_operation_input: false }, fake_orchestrator_contract: { id: inputs.actions.fixture_id, sha256: inputs.identities.actions }, fake_operation_contract: { id: inputs.results.fixture_id, sha256: inputs.identities.results } };
}

function planValue(inputs) {
  return { schema_version: "orchestrated-research-stage2-plan-v1", producer: "lib/recursus/orchestrated-research-stage2.mjs", provenance: "deterministic-provider-free-stage2-plan", plan_id: "ORCHESTRATED-RESEARCH-STAGE2-PLAN-01", action_ids: inputs.actions.actions.map((item) => item.action_id), operation_ids: Object.keys(OPERATION_REGISTRY), initial_gap_ids: [], max_concurrent_operations: 1, max_recursive_depth: 1 };
}

async function initialArtifacts(context, inputs) {
  const registration = await registrationValue(context, inputs);
  const manifest = sourceManifestValue(inputs);
  const plan = planValue(inputs);
  await writeCanonical(context, "registration.json", registration, { maxBytes: 262144 });
  await writeCanonical(context, "source-manifest.json", manifest, { maxBytes: 524288 });
  await writeCanonical(context, "plan.json", plan, { maxBytes: 262144 });
  await appendLedger(context, "RUN_REGISTERED", { route_id: ROUTE_ID, question_identity: registration.question_identity, source_identity: registration.source_identity, permission_identity: STAGE2_PERMISSION_ID, budget_identity: registration.budget_contract.identity, evaluator_identity: registration.evaluator_identity, code_identity: registration.code_identity, action_grammar_identity: registration.action_grammar_identity, physical_root_binding: context.binding });
  await appendLedger(context, "PLAN_RECORDED", { plan_id: plan.plan_id, action_ids: plan.action_ids, operation_ids: plan.operation_ids, initial_gap_ids: plan.initial_gap_ids });
  await writeCanonical(context, "checkpoint.json", checkpointValue(await readLedger(context.root), 0), { maxBytes: 262144 });
}

async function validateRegistration(context, inputs) {
  const registration = await readCanonical(context.root, "registration.json", 262144);
  const expectedRegistration = await registrationValue(context, inputs);
  if (canonicalJsonV1(registration.value.physical_root_binding) !== canonicalJsonV1(context.binding)) fail("ROOT_REPLACED", "Stage 2 physical root binding drifted");
  if (canonicalJsonV1(registration.value) !== canonicalJsonV1(expectedRegistration)) fail("REGISTRATION_DRIFT", "Stage 2 registration identity drifted");
  const manifest = await readCanonical(context.root, "source-manifest.json", 524288);
  if (canonicalJsonV1(manifest.value) !== canonicalJsonV1(sourceManifestValue(inputs))) fail("SOURCE_MANIFEST_DRIFT", "Stage 2 source manifest drifted");
  const plan = await readCanonical(context.root, "plan.json", 262144);
  if (canonicalJsonV1(plan.value) !== canonicalJsonV1(planValue(inputs))) fail("PLAN_DRIFT", "Stage 2 bounded plan drifted");
}

async function continueActions(context, inputs, fault) {
  let ledger = await readLedger(context.root);
  if (ledger.terminal_count) return;
  await recoverIncompleteAction(context, inputs);
  ledger = await readLedger(context.root);
  const decided = ledger.decidedActions;
  for (const [index, action] of inputs.actions.actions.entries()) {
    if (decided.has(action.action_id) || (await readLedger(context.root)).decidedActions.has(action.action_id)) continue;
    await processAction(context, inputs, action, fault, index + 1);
  }
  ledger = await readLedger(context.root);
  const stop = inputs.actions.actions.find((action) => action.kind === "STOP");
  if (!ledger.terminal_count && stop && ledger.decidedActions.has(stop.action_id)) await finalizeRun(context, inputs, fault);
}

async function recoverIncompleteAction(context, inputs) {
  let ledger = await readLedger(context.root);
  const proposal = ledger.entries.findLast((entry) => entry.kind === "ACTION_PROPOSED" && !ledger.decidedActions.has(entry.payload.action_id));
  if (!proposal) return;
  const action = inputs.actions.actions.find((item) => item.action_id === proposal.payload.action_id);
  if (!action || canonicalJsonV1(action) !== canonicalJsonV1(proposal.payload.action)) fail("RECOVERY_ACTION_MISMATCH", "Incomplete action does not match the frozen orchestrator fixture");
  const ordinal = inputs.actions.actions.findIndex((item) => item.action_id === action.action_id) + 1;
  if (!action.operation_id) {
    await handleProposedAction(context, inputs, action, undefined, ordinal);
    return;
  }
  const admission = ledger.entries.findLast((entry) => entry.kind === "OPERATION_ADMITTED" && entry.payload.action_id === action.action_id);
  if (!admission) {
    await handleProposedAction(context, inputs, action, undefined, ordinal);
    return;
  }
  const activeId = admission.payload.operation_id;
  const state = ledger.operations.get(activeId);
  if (state === "admitted") {
    await terminalizeOperation(context, inputs, action, undefined, { recoveryStatus: "cancelled-before-dispatch" });
    await appendDecision(context, action, { admitted: true, reason: "CANCELLED_BEFORE_DISPATCH_NO_REPLAY", operationId: activeId, nextAction: "CONTINUE", ordinal });
  } else if (state === "dispatched") {
    await terminalizeOperation(context, inputs, action, undefined, { recoveryStatus: "indeterminate-no-replay" });
    await appendDecision(context, action, { admitted: true, reason: "DISPATCHED_WITHOUT_TRUSTED_TERMINAL_NO_REPLAY", operationId: activeId, nextAction: "REGISTERED_FALLBACK_OR_STOP", ordinal });
  } else if (state === "terminal") {
    const terminal = ledger.entries.findLast((entry) => entry.kind === "OPERATION_TERMINAL" && entry.payload.operation_id === activeId);
    if (action.kind === "REQUEST_DIRECT_GAP_FILL" && terminal.payload.status === "success" && !gaps(ledger.entries).some((gap) => gap.gap_id === action.gap_id && gap.disposition === "resolved")) {
      await appendLedger(context, "GAP_RECORDED", { gap_id: action.gap_id, action_id: action.action_id, operation_id: action.operation_id, importance: "required", attempted_operations: ["S2-OP-RLM-LAB-01", "S2-OP-RLM-LAB-02", action.operation_id], disposition: "resolved", reason: "registered-direct-fallback-accepted-source-grounded-evidence" });
    }
    await appendDecision(context, action, { admitted: true, reason: `RECOVERED_TERMINAL_${terminal.payload.status.toUpperCase().replaceAll("-", "_")}_NO_REPLAY`, operationId: activeId, nextAction: terminal.payload.status === "success" ? "CONTINUE" : "REGISTERED_FALLBACK_OR_STOP", ordinal });
  } else {
    fail("RECOVERY_OPERATION_MISMATCH", `Incomplete operation ${activeId} has no recoverable host state`);
  }
}

async function run(root, fault) {
  if (fault !== undefined && !STAGE2_FAULTS.includes(fault)) fail("UNREGISTERED_FAULT", `Unknown Stage 2 fault ${fault}`);
  const context = await foundation.validateDisposableRoot(root, { requireEmpty: true });
  const lock = await foundation.acquireRoot(context);
  try {
    const inputs = await loadInputs();
    await initialArtifacts(context, inputs);
    await continueActions(context, inputs, fault);
  } finally {
    await foundation.releaseRoot(context, lock);
  }
  return inspectStage2(root);
}

export async function prepareStage2(root) { return run(root); }
export async function exerciseStage2(root, fault) {
  if (fault?.startsWith("rlm-")) return run(root, fault);
  try { return await run(root, fault); }
  catch (error) {
    if (!(error instanceof OrchestratedResearchError) || error.code !== "INJECTED_STAGE2_INTERRUPTION") throw error;
    const inspected = await inspectStage2(root);
    return { ...inspected, fault, fault_code: error.code };
  }
}

export async function inspectStage2(root) {
  const context = await foundation.validateDisposableRoot(root);
  const top = await readdir(context.root);
  if (top.length === 0) return { root: context.root, state: "empty" };
  if (top.includes(foundation.LOCK_NAME)) return { root: context.root, state: "locked" };
  const inputs = await loadInputs();
  await validateRegistration(context, inputs);
  const files = await listFiles(context.root);
  const unknown = files.filter((item) => !allowedPath(item));
  if (unknown.length) fail("UNREGISTERED_ARTIFACT", "Stage 2 root contains residue or unknown artifacts", { unknown });
  const ledger = await readLedger(context.root);
  const checkpoint = await readCanonical(context.root, "checkpoint.json", 262144);
  if (checkpoint.value.ledger_sequence > ledger.entries.length || checkpoint.value.ledger_tail_digest !== ledger.entries[checkpoint.value.ledger_sequence - 1].entry_digest) fail("STALE_CHECKPOINT", "Stage 2 checkpoint does not bind the validated ledger prefix");
  const checkpointPrefix = ledgerPrefix(ledger.entries, checkpoint.value.ledger_sequence);
  if (canonicalJsonV1(checkpoint.value) !== canonicalJsonV1(checkpointValue(checkpointPrefix, checkpoint.value.action_ordinal))) fail("CHECKPOINT_PROJECTION_MISMATCH", "Stage 2 checkpoint is not the deterministic ledger projection");
  await validateArtifactBindings(context, inputs, ledger);
  for (const relative of files.filter((item) => item.includes("/input.json") || item.includes("/output.json"))) {
    const artifact = await readCanonical(context.root, relative, 262144);
    const text = canonicalJsonV1(artifact.value);
    for (const forbidden of [inputs.evaluator.leak_canary, inputs.evaluator.alternate_route_canary, "evaluator_only", "expected_synthesis_evidence_ids", "rlm_eligible_case_ids", "physical_root_binding", '"circuit"', "rejected_evidence_summaries"]) if (text.includes(forbidden)) fail("EVALUATOR_LEAK", `${relative} contains host/evaluator-only bytes`);
  }
  const state = ledger.terminal_count ? "complete" : activeOperation(ledger) ? ledger.operations.get(activeOperation(ledger)) : "checkpointed";
  let summary = null;
  if (files.includes("summary.json")) {
    summary = await readCanonical(context.root, "summary.json", 262144);
    const projection = structuredClone(summary.value); delete projection.summary_projection_sha256;
    if (summary.value.summary_projection_sha256 !== sha256V1(Buffer.from(canonicalJsonV1(projection), "utf8")) || canonicalJsonV1(summary.value.artifact_inventory) !== canonicalJsonV1(await inventory(context.root)) || summary.value.normalized_capture_sha256 !== sha256V1(await normalizedStage2PreparationBytes(context.root))) fail("SUMMARY_MISMATCH", "Stage 2 summary does not match retained artifacts");
    const accounting = await readCanonical(context.root, "accounting.json", 65536);
    if (canonicalJsonV1(accounting.value) !== canonicalJsonV1(accountingValue(ledger.entries))) fail("ACCOUNTING_MISMATCH", "Stage 2 accounting does not match the ledger");
    const eligibility = await readCanonical(context.root, "synthesis-eligibility.json", 262144);
    const result = await readCanonical(context.root, "result.json", 262144);
    const acceptedIds = accepted(ledger.entries).map((item) => item.evidence_id).sort();
    const rejectedIds = rejected(ledger.entries).map((item) => item.evidence_id).sort();
    if (eligibility.value.result_sha256 !== result.sha256 || canonicalJsonV1(eligibility.value.accepted_evidence_ids) !== canonicalJsonV1(acceptedIds) || canonicalJsonV1(acceptedIds) !== canonicalJsonV1([...inputs.evaluator.expected_synthesis_evidence_ids].sort()) || result.value.accepted_evidence.some((item) => rejectedIds.includes(item.evidence_id)) || result.value.rejected_evidence_ids.some((id) => acceptedIds.includes(id))) fail("REJECTED_EVIDENCE_REAPPEARED", "Synthesis differs from the evaluator-only expected accepted set or contains rejected evidence");
  }
  return { root: context.root, state, decision: summary?.value.decision ?? null, ledger_entries: ledger.entries.length, checkpoint_id: checkpoint.value.checkpoint_id, accepted_evidence: accepted(ledger.entries).length, rejected_evidence: rejected(ledger.entries).length, gaps: gaps(ledger.entries), circuit: circuitState(ledger.entries), operation_dispatches: ledger.entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED").length, normalized_capture_sha256: summary?.value.normalized_capture_sha256 ?? null };
}

export async function recoverStage2(root) {
  const context = await foundation.validateDisposableRoot(root);
  const lock = await foundation.acquireRoot(context);
  try {
    const inputs = await loadInputs();
    await validateRegistration(context, inputs);
    const ledger = await readLedger(context.root);
    if (!ledger.terminal_count) await continueActions(context, inputs, undefined);
  } finally {
    await foundation.releaseRoot(context, lock);
  }
  return inspectStage2(root);
}

export function formatStage2Error(error) {
  if (error instanceof OrchestratedResearchError) return { ok: false, code: error.code, message: error.message, details: error.details };
  return { ok: false, code: error?.code ?? "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) };
}

export const __test = Object.freeze({ ACTION_FIXTURE, EVALUATOR_FIXTURE, FIXTURE_ROOT, OPERATION_REGISTRY, RESULT_FIXTURE, RUN_ID, ROUTE_ID, accountingValue, canonicalBytes, circuitState, loadInputs, readLedger, sealEntry });
