import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { RC7_CASE_ORDER, validateRc7QualificationPackage } from "./rc7-rlm-qualification.mjs";

export const RC7_GATE_B_ROUTE_SCHEMA = "rc7-gate-b-route-seam-v1";
export const RC7_GATE_B_DIRECT_ROUTE_ID = "rc7-rc-direct-provider-free-prepared-v1";
export const RC7_GATE_B_RLM_ROUTE_ID = "rc7-rc-rlm-contained-provider-free-prepared-v1";
export const RC7_GATE_B_SHARED_PERMISSION_ID = "rc7-gate-b-provider-free-shared-v1";
export const RC7_GATE_B_BROKER_ID = "rc7-gate-b-deny-all-child-broker-v1";

const ELIGIBLE_CASES = Object.freeze(["LAB-01", "PAPER-01", "REPO-01"]);
const GENERIC_CASES = Object.freeze(["FACT-01", "FACT-03", "SAFE-01"]);
const CELLS = Object.freeze(["default-direct", "direct-control", "rlm-treatment"]);
const FALLBACK_TRIGGERS = Object.freeze([
  "rlm-unavailable", "rlm-disabled", "rlm-over-budget", "rlm-malformed", "rlm-interrupted", "rlm-unsafe",
]);

export class Rc7GateBRouteError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7GateBRouteError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7GateBRouteError(code, message, details);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_ROUTE_INPUT", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...keys].sort())) fail("MALFORMED_ROUTE_INPUT", `${label} keys mismatched`);
}

function missingIdentity(name) {
  return {
    schema_version: "rc7-explicit-missing-v1",
    field: name,
    state: "missing",
    reason: "provider-free-gate-b-no-provider-reachability",
  };
}

function textIdentity(id, text) {
  const bytes = Buffer.from(text, "utf8");
  return { id, byte_count: bytes.byteLength, sha256: sha256V1(bytes), normalization: "utf8-no-terminator" };
}

export function rc7GateBSharedConditions() {
  return {
    provider_identity: missingIdentity("provider_identity"),
    adapter_identity: missingIdentity("adapter_identity"),
    model_identity: missingIdentity("model_identity"),
    model_snapshot: missingIdentity("model_snapshot"),
    reasoning_setting: missingIdentity("reasoning_setting"),
    semantic_prompt_block_identities: [textIdentity("rc7-gate-b-seam-prompt-v1", "Retain the registered first integer in one persistent namespace and return its sum with the registered offset as one decimal integer.")],
    output_contract_identity: textIdentity("rc7-gate-b-integer-output-v1", "one canonical base-10 integer equal to first_value plus offset; no prose"),
    tokenizer_identity: missingIdentity("tokenizer_identity"),
    pricing_identity: missingIdentity("pricing_identity"),
    source_authority_policy: "registered-synthetic-visible-bytes-only",
    evaluator_contract: "registered-evaluator-only-never-route-visible",
    operating_system_clock_locale: { clock: "not-route-visible", locale: "C.UTF-8", timezone: "UTC" },
    timeout_retry_concurrency: { retry_ceiling: 0, concurrency: 1, timeout_identity: "rc7-gate-b-provider-free-no-provider-timeout-v1" },
    top_level_provider_request_budget: { per_attempt: 0, total: 0 },
  };
}

export function rc7GateBOsAuthorityContract() {
  return {
    policy_default: "deny-unlisted-high-level-capability",
    permitted: [
      "read-exact-runtime-image",
      "read-one-registered-synthetic-input-bind",
      "write-one-bounded-output-tmpfs",
      "container-local-loopback-zero-mq-before-phase-two-seal",
      "already-open-zero-mq-channels-after-phase-two-seal",
      "bounded-thread-creation",
      "bounded-cpu-memory-pids-file-size-file-count-and-wall-time",
      "container-process-start-stop-and-exact-cleanup-by-host-runner",
    ],
    denied: [
      "host-repository-read", "host-user-layer-read", "sibling-project-read", "real-credential-store-access",
      "host-filesystem-write", "direct-dns", "direct-tcp", "direct-udp", "direct-http", "direct-https",
      "docker-socket", "host-named-pipe", "device", "port-publication", "added-linux-capability",
      "privilege-escalation", "mount", "namespace-creation", "ptrace", "bpf", "keyring",
      "new-process-after-phase-two-seal", "exec-after-phase-two-seal", "new-socket-after-phase-two-seal",
      "provider-broker-reachability", "external-service-mutation",
    ],
    syscall_filter_model: "frozen-default-errno-allowlist-plus-phase-two-tsync-denials",
    syscall_default_deny_claimed: true,
    direct_python_is_operating_system_authority: true,
  };
}

export function rc7GateBChildBrokerContract() {
  return {
    identity: RC7_GATE_B_BROKER_ID,
    mode: "provider-free-deny-all",
    provider_reachable: false,
    per_attempt_child_request_ceiling: 0,
    total_child_request_ceiling: 0,
    required_durable_intent_fields: ["parent_run_identity", "child_sequence", "authority_identity", "budget_identity", "input_sha256"],
    rejection: "GATE_B_PROVIDER_UNREACHABLE",
    gate_c_planned_maximum_not_authority: { eligible_attempts: 18, per_attempt: 2, total: 36 },
  };
}

export function buildRc7GateBRouteSeamContract() {
  return {
    schema_version: RC7_GATE_B_ROUTE_SCHEMA,
    default_route: "rc-direct",
    default_rlm_enabled: false,
    automatic_routing: false,
    direct_route_identity: RC7_GATE_B_DIRECT_ROUTE_ID,
    rlm_route_identity: RC7_GATE_B_RLM_ROUTE_ID,
    eligible_cases: [...ELIGIBLE_CASES],
    generic_cases: [...GENERIC_CASES],
    cells: [...CELLS],
    shared_conditions: rc7GateBSharedConditions(),
    shared_permission_identity: RC7_GATE_B_SHARED_PERMISSION_ID,
    rlm_only_difference: {
      component: "pinned-internal-KernelManager",
      persistent_computation: true,
      os_authority: rc7GateBOsAuthorityContract(),
      child_broker: rc7GateBChildBrokerContract(),
    },
    fallback: {
      triggers: [...FALLBACK_TRIGGERS],
      before_provider_reachability_only: true,
      action: "append-failed-treatment-and-prepare-fresh-immutable-rc-direct-run",
      original_attempt_relabel: false,
      side_effecting_cell_replay: false,
    },
  };
}

export function decideRc7GateBRoute(input) {
  exactKeys(input, ["case_id", "cell"], "route decision input");
  if (!RC7_CASE_ORDER.includes(input.case_id)) fail("CASE_IDENTITY_MISMATCH", "Unknown RC-7 case identity");
  if (!CELLS.includes(input.cell)) fail("ROUTE_IDENTITY_MISMATCH", "Unknown RC-7 route cell");
  const eligible = ELIGIBLE_CASES.includes(input.case_id);
  if (!eligible && input.cell === "rlm-treatment") fail("GENERIC_RLM_SELECTION", "Generic controls may not request or select RLM");
  const selected = input.cell === "rlm-treatment" && eligible ? "rc-rlm" : "rc-direct";
  return {
    schema_version: "rc7-route-decision-v1",
    case_id: input.case_id,
    cell: input.cell,
    requested_mechanism: input.cell === "rlm-treatment" ? "rc-rlm" : "rc-direct",
    selected_route: selected,
    selected_route_identity: selected === "rc-rlm" ? RC7_GATE_B_RLM_ROUTE_ID : RC7_GATE_B_DIRECT_ROUTE_ID,
    fallback_trigger: null,
    provider_reachable: false,
    route_visible: false,
  };
}

export function authorizeRc7GateBChildRequest(intent) {
  exactKeys(intent, ["parent_run_identity", "child_sequence", "authority_identity", "budget_identity", "input_sha256"], "child intent");
  if (!/^[0-9a-f]{64}$/u.test(intent.parent_run_identity) || !/^[0-9a-f]{64}$/u.test(intent.input_sha256)
    || intent.authority_identity !== RC7_GATE_B_BROKER_ID || intent.budget_identity !== "rc7-gate-b-zero-child-budget-v1"
    || intent.child_sequence !== 1) fail("CHILD_INTENT_IDENTITY_MISMATCH", "Child intent identity mismatched");
  fail("GATE_B_PROVIDER_UNREACHABLE", "Gate B child requests are denied before provider reachability");
}

export function executeRc7GateBProviderFreeDirect(sourcePack, sourcePackSha256 = undefined) {
  exactKeys(sourcePack, ["schema_version", "probe_id", "visible_task", "first_value", "offset"], "direct source pack");
  if (sourcePack.schema_version !== "rc7-gate-b-visible-source-pack-v1" || sourcePack.probe_id !== "RLM-PERSISTENCE-38-TO-42"
    || sourcePack.visible_task !== "Retain one integer in a persistent IPython namespace and compute a fixed offset in the same kernel generation."
    || sourcePack.first_value !== 38 || sourcePack.offset !== 4) fail("SOURCE_IDENTITY_MISMATCH", "Direct source pack identity mismatched");
  const identity = sourcePackSha256 ?? sha256V1(Buffer.from(`${canonicalJsonV1(sourcePack)}\n`, "utf8"));
  if (!/^[0-9a-f]{64}$/u.test(identity)) fail("SOURCE_IDENTITY_MISMATCH", "Direct source-pack digest is malformed");
  return {
    schema_version: "rc7-gate-b-direct-result-v1",
    route_identity: RC7_GATE_B_DIRECT_ROUTE_ID,
    source_pack_sha256: identity,
    result: String(sourcePack.first_value + sourcePack.offset),
    provider_requests: 0,
    child_requests: 0,
    operating_system_authority_delta: "rc7-no-authority-delta-v1",
  };
}

function artifact(name, schema, value, maximumBytes) {
  const bytes = Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
  if (bytes.byteLength > maximumBytes) fail("OVERSIZED_ARTIFACT", `${name} exceeds its byte ceiling`);
  return {
    name,
    schema,
    maximum_bytes: maximumBytes,
    byte_count: bytes.byteLength,
    sha256: sha256V1(bytes),
    producer: "lib/recursus/rc7-rlm-gate-b-route.mjs",
    provenance: "rc7-gate-b-provider-free-route-preparation",
    independent_validator: "rc7-rlm-containment-validator-v2",
    value,
  };
}

export function buildRc7GateBRouteArtifactSet(input) {
  exactKeys(input, ["qualification", "case_id", "cell", "repeat", "code_closure_sha256"], "route artifact input");
  validateRc7QualificationPackage(input.qualification);
  if (!Number.isInteger(input.repeat) || input.repeat < 1 || input.repeat > 3) fail("RUN_IDENTITY_MISMATCH", "Repeat must be 1..3");
  if (!/^[0-9a-f]{64}$/u.test(input.code_closure_sha256)) fail("RUN_IDENTITY_MISMATCH", "Code closure digest is malformed");
  const caseRecord = input.qualification.cases.find((item) => item.case_id === input.case_id);
  if (!caseRecord) fail("CASE_IDENTITY_MISMATCH", "Case record is missing");
  const decision = decideRc7GateBRoute({ case_id: input.case_id, cell: input.cell });
  const manifestProjection = {
    schema_version: "rc7-run-manifest-v1",
    case_id: input.case_id,
    repeat: input.repeat,
    route_identity: decision.selected_route_identity,
    component_revision: decision.selected_route === "rc-rlm" ? "4772c12b0630706f14d16e70be0ad67bff116690" : missingIdentity("component_revision"),
    provider_and_model: rc7GateBSharedConditions(),
    prompt_and_output_contracts: {
      prompt: rc7GateBSharedConditions().semantic_prompt_block_identities,
      output: rc7GateBSharedConditions().output_contract_identity,
    },
    shared_permission_identity: RC7_GATE_B_SHARED_PERMISSION_ID,
    rlm_os_authority_identity: decision.selected_route === "rc-rlm" ? "rc7-gate-b-os-authority-v1" : null,
    child_budget_identity: "rc7-gate-b-zero-child-budget-v1",
    source_pack_identity: caseRecord.route_visible_source_pack.sha256,
    evaluator_contract_identity: caseRecord.evaluator_only_contract.sha256,
    code_closure_sha256: input.code_closure_sha256,
    provider_reachable: false,
  };
  const runIdentity = sha256V1(canonicalJsonV1(manifestProjection));
  const runManifest = { ...manifestProjection, run_identity: runIdentity };
  const routeDecision = { ...decision, run_identity: runIdentity };
  const artifacts = [
    artifact("run-manifest.json", "rc7-run-manifest-v1", runManifest, 65_536),
    artifact("route-decision.json", "rc7-route-decision-v1", routeDecision, 16_384),
    artifact("research-plan.json", "rc7-research-plan-v1", { run_identity: runIdentity, status: "provider-free-route-prepared-no-research-executed", visible_source_pack_sha256: caseRecord.route_visible_source_pack.sha256, planned_operations: [] }, 65_536),
    artifact("evidence-ledger.jsonl", "rc7-evidence-ledger-v1", { run_identity: runIdentity, entries: [] }, 262_144),
    artifact("intermediate-computation.json", "rc7-intermediate-computation-metadata-v1", { run_identity: runIdentity, operations: [], rlm_memory_is_source_truth: false }, 65_536),
    artifact("result.json", "rc7-result-v1", { run_identity: runIdentity, status: "not-executed-gate-b-provider-free", claims: [] }, 131_072),
    artifact("metrics.json", "rc7-metrics-v1", { run_identity: runIdentity, status: "not-measured", provider_requests: 0, child_requests: 0 }, 65_536),
    artifact("terminal.json", "rc7-terminal-v1", { run_identity: runIdentity, terminal: "GATE_B_ROUTE_PREPARED_PROVIDER_FREE", provider_requests: 0 }, 16_384),
  ];
  return {
    schema_version: "rc7-gate-b-route-artifact-set-v1",
    run_identity: runIdentity,
    route_visible_artifact_names: ["research-plan.json"],
    evaluator_only_artifact_names: ["route-decision.json", "metrics.json", "terminal.json"],
    artifacts,
    artifact_set_sha256: sha256V1(canonicalJsonV1(artifacts.map(({ value, ...identity }) => identity))),
  };
}

export function buildRc7GateBFallback(input) {
  exactKeys(input, ["original_run_identity", "case_id", "trigger", "code_closure_sha256"], "fallback input");
  if (!/^[0-9a-f]{64}$/u.test(input.original_run_identity) || !/^[0-9a-f]{64}$/u.test(input.code_closure_sha256)) fail("RUN_IDENTITY_MISMATCH", "Fallback identity is malformed");
  if (!ELIGIBLE_CASES.includes(input.case_id) || !FALLBACK_TRIGGERS.includes(input.trigger)) fail("FALLBACK_IDENTITY_MISMATCH", "Fallback case or trigger mismatched");
  const projection = {
    schema_version: "rc7-gate-b-safe-direct-fallback-v1",
    original_run_identity: input.original_run_identity,
    case_id: input.case_id,
    trigger: input.trigger,
    selected_route: "rc-direct",
    selected_route_identity: RC7_GATE_B_DIRECT_ROUTE_ID,
    code_closure_sha256: input.code_closure_sha256,
    provider_reachable_dispatch_observed: false,
    original_attempt_relabelled: false,
    side_effecting_cell_replayed: false,
  };
  return { ...projection, fallback_run_identity: sha256V1(canonicalJsonV1(projection)) };
}

export function prepareRc7GateBProviderFreeSeam(input) {
  exactKeys(input, ["qualification", "case_id", "cell", "repeat", "code_closure_sha256", "fallback_trigger"], "provider-free seam input");
  const decision = decideRc7GateBRoute({ case_id: input.case_id, cell: input.cell });
  const attempted = buildRc7GateBRouteArtifactSet({
    qualification: input.qualification,
    case_id: input.case_id,
    cell: input.cell,
    repeat: input.repeat,
    code_closure_sha256: input.code_closure_sha256,
  });
  if (input.fallback_trigger === null) {
    return {
      schema_version: "rc7-gate-b-provider-free-seam-result-v1",
      status: "route-prepared-no-case-execution",
      decision,
      attempted_route_artifacts: attempted,
      fallback: null,
      selected_route_artifacts: attempted,
      rlm_executions: 0,
      provider_requests: 0,
      child_requests: 0,
    };
  }
  if (decision.selected_route !== "rc-rlm") fail("FALLBACK_IDENTITY_MISMATCH", "Only an RLM treatment may enter the registered direct fallback path");
  const fallback = buildRc7GateBFallback({
    original_run_identity: attempted.run_identity,
    case_id: input.case_id,
    trigger: input.fallback_trigger,
    code_closure_sha256: input.code_closure_sha256,
  });
  const selected = buildRc7GateBRouteArtifactSet({
    qualification: input.qualification,
    case_id: input.case_id,
    cell: "direct-control",
    repeat: input.repeat,
    code_closure_sha256: input.code_closure_sha256,
  });
  if (selected.run_identity === attempted.run_identity || selected.run_identity === fallback.original_run_identity) fail("RUN_IDENTITY_MISMATCH", "Fallback did not produce a fresh immutable direct identity");
  return {
    schema_version: "rc7-gate-b-provider-free-seam-result-v1",
    status: "failed-treatment-appended-safe-direct-prepared",
    decision,
    attempted_route_artifacts: attempted,
    fallback,
    selected_route_artifacts: selected,
    rlm_executions: 0,
    provider_requests: 0,
    child_requests: 0,
  };
}

export const __test = Object.freeze({ CELLS, ELIGIBLE_CASES, FALLBACK_TRIGGERS, GENERIC_CASES });
