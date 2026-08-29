import { readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import { buildRc7QualificationPackage } from "./rc7-rlm-qualification.mjs";

const SCHEMA = "rc7-rlm-boundary-conformance-package-v1";
const POLICY = "rc7-rlm-gate-b-docker-contained-provider-free-v1";
const QUALIFICATION_SHA256 = "9a0535825a0cdea1372f89266643e00b3b20dd4cde8eb9ea97c2b4b398a893bb";
const QUALIFICATION_CASE_CATALOG_SHA256 = "b4df0e08b047c3f161dcee56cd13cd6694b550c7786cc49ff514e1e4a83bbf1e";
const COMPONENT_COMMIT = "4772c12b0630706f14d16e70be0ad67bff116690";
const DIRECT_ROUTE = "rc7-rc-direct-provider-free-prepared-v1";
const RLM_ROUTE = "rc7-rc-rlm-contained-provider-free-prepared-v1";
const SHARED_PERMISSION = "rc7-gate-b-provider-free-shared-v1";
const BROKER = "rc7-gate-b-deny-all-child-broker-v1";
const HASH = /^[0-9a-f]{64}$/u;
const IMAGE = /^sha256:[0-9a-f]{64}$/u;
const ELIGIBLE = Object.freeze(["LAB-01", "PAPER-01", "REPO-01"]);
const GENERIC = Object.freeze(["FACT-01", "FACT-03", "SAFE-01"]);
const CASES = Object.freeze([...ELIGIBLE, ...GENERIC]);
const MODES = Object.freeze(["conformance", "pids", "file-size", "inodes", "bytes", "memory", "cpu"]);
const ALLOWED_DOCKER_DIFF = Object.freeze(["A /rc7/input", "A /usr/sbin/docker-init", "C /rc7", "C /usr", "C /usr/sbin"]);
const FIXTURES = Object.freeze([
  "tests/recursus/fixtures/rc7-rlm-containment/Dockerfile",
  "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-default-errno.json",
  "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-provenance.json",
  "tests/recursus/fixtures/rc7-rlm-containment/source-pack.json",
  "tests/recursus/fixtures/rc7-rlm-containment/gate-b-worker.mjs",
]);
const CODE_FILES = Object.freeze([
  "lib/recursus/prompt-context-v1.mjs",
  "lib/recursus/rc7-rlm-qualification.mjs",
  "lib/recursus/rc7-rlm-containment.mjs",
  "lib/recursus/rc7-rlm-containment-validator.mjs",
  "lib/recursus/rc7-rlm-gate-b-route.mjs",
  "scripts/recursus/rc7-rlm-containment.mjs",
  ...FIXTURES,
]);
const ENV_NAMES = Object.freeze([
  "GPG_KEY", "HOME", "LANG", "LC_ALL", "PATH", "PYTHON_SHA256", "PYTHON_VERSION",
  "RC7_GATE_B_POLICY", "TMPDIR", "TZ",
]);
const RESOURCE_LIMITS = Object.freeze({
  cpu_nanos: 1_000_000_000,
  cpu_wall_timeout_ms: 3_000,
  file_size_bytes: 1_048_576,
  memory_bytes: 805_306_368,
  memory_probe_bytes: 134_217_728,
  nofile: 128,
  output_bytes: 16_777_216,
  output_inodes: 256,
  pids: 64,
  pids_probe: 24,
});
const PHASE_TWO_DENIALS = Object.freeze([
  "new-process", "exec", "new-socket", "mount", "namespace", "ptrace", "device",
  "bpf", "keyring", "privilege-escalation",
]);
const RECOVERY_CHECKPOINTS = Object.freeze([
  "RUN_INTENT", "PROBE_INTENT", "CONTAINER_CREATED", "DISPATCH_INTENT", "DISPATCH_OBSERVED",
  "RAW_RESULT", "RESULT_SEALED", "CLEANUP_INTENT", "CLEANUP_VERIFIED", "PUBLICATION_INTENT",
  "PUBLICATION_COMPLETE", "TERMINAL_COMPLETE",
]);
const NON_CLAIMS = Object.freeze([
  "no-provider-or-model-behavior-tested",
  "no-accepted-recursus-profile-byte-reproduction",
  "no-gate-c-ablation-result",
  "no-production-sandbox-or-supported-route",
  "no-automatic-routing-evidence",
]);
const OUTER_SECCOMP_INSPECT_SHA256 = "c033632260baa80de07da43bd651ab9f36d9ea4c358a52561c4ae124c562cf9f";
const HOST_RUNTIME = Object.freeze({
  backend: "Docker Desktop WSL2",
  desktop_version: "4.69.0",
  client_version: "29.4.0",
  engine_version: "29.4.0",
  api_version: "1.54",
  os: "linux",
  architecture: "amd64",
  kernel: "6.18.33.2-microsoft-standard-WSL2",
  cgroup_version: "2",
  operating_system: "Docker Desktop",
  server_name: "docker-desktop",
  runtime: "runc",
  containerd_version: "v2.2.1",
  runc_version: "1.3.4",
  runc_git_commit: "v1.3.4-0-gd6d73eb8",
  docker_init_version: "0.19.0",
});
const ARTIFACTS = Object.freeze([
  ["run-manifest.json", "rc7-run-manifest-v1", 65_536],
  ["route-decision.json", "rc7-route-decision-v1", 16_384],
  ["research-plan.json", "rc7-research-plan-v1", 65_536],
  ["evidence-ledger.jsonl", "rc7-evidence-ledger-v1", 262_144],
  ["intermediate-computation.json", "rc7-intermediate-computation-metadata-v1", 65_536],
  ["result.json", "rc7-result-v1", 131_072],
  ["metrics.json", "rc7-metrics-v1", 65_536],
  ["terminal.json", "rc7-terminal-v1", 16_384],
]);

export class Rc7ContainmentValidationError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7ContainmentValidationError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7ContainmentValidationError(code, message, details);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_ARTIFACT", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...keys].sort())) fail("MALFORMED_ARTIFACT", `${label} keys mismatched`);
}

function exact(value, expected, code, label) {
  if (canonicalJsonV1(value) !== canonicalJsonV1(expected)) fail(code, `${label} mismatched`);
}

function missing(field) {
  return { schema_version: "rc7-explicit-missing-v1", field, state: "missing", reason: "provider-free-gate-b-no-provider-reachability" };
}

function textIdentity(id, text) {
  const bytes = Buffer.from(text, "utf8");
  return { id, byte_count: bytes.byteLength, sha256: sha256V1(bytes), normalization: "utf8-no-terminator" };
}

function sharedConditions() {
  return {
    provider_identity: missing("provider_identity"),
    adapter_identity: missing("adapter_identity"),
    model_identity: missing("model_identity"),
    model_snapshot: missing("model_snapshot"),
    reasoning_setting: missing("reasoning_setting"),
    semantic_prompt_block_identities: [textIdentity("rc7-gate-b-seam-prompt-v1", "Retain the registered first integer in one persistent namespace and return its sum with the registered offset as one decimal integer.")],
    output_contract_identity: textIdentity("rc7-gate-b-integer-output-v1", "one canonical base-10 integer equal to first_value plus offset; no prose"),
    tokenizer_identity: missing("tokenizer_identity"),
    pricing_identity: missing("pricing_identity"),
    source_authority_policy: "registered-synthetic-visible-bytes-only",
    evaluator_contract: "registered-evaluator-only-never-route-visible",
    operating_system_clock_locale: { clock: "not-route-visible", locale: "C.UTF-8", timezone: "UTC" },
    timeout_retry_concurrency: { retry_ceiling: 0, concurrency: 1, timeout_identity: "rc7-gate-b-provider-free-no-provider-timeout-v1" },
    top_level_provider_request_budget: { per_attempt: 0, total: 0 },
  };
}

function osAuthority() {
  return {
    policy_default: "deny-unlisted-high-level-capability",
    permitted: [
      "read-exact-runtime-image", "read-one-registered-synthetic-input-bind", "write-one-bounded-output-tmpfs",
      "container-local-loopback-zero-mq-before-phase-two-seal", "already-open-zero-mq-channels-after-phase-two-seal",
      "bounded-thread-creation", "bounded-cpu-memory-pids-file-size-file-count-and-wall-time",
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

function broker() {
  return {
    identity: BROKER,
    mode: "provider-free-deny-all",
    provider_reachable: false,
    per_attempt_child_request_ceiling: 0,
    total_child_request_ceiling: 0,
    required_durable_intent_fields: ["parent_run_identity", "child_sequence", "authority_identity", "budget_identity", "input_sha256"],
    rejection: "GATE_B_PROVIDER_UNREACHABLE",
    gate_c_planned_maximum_not_authority: { eligible_attempts: 18, per_attempt: 2, total: 36 },
  };
}

function expectedRouteSeam() {
  return {
    schema_version: "rc7-gate-b-route-seam-v1",
    default_route: "rc-direct",
    default_rlm_enabled: false,
    automatic_routing: false,
    direct_route_identity: DIRECT_ROUTE,
    rlm_route_identity: RLM_ROUTE,
    eligible_cases: [...ELIGIBLE],
    generic_cases: [...GENERIC],
    cells: ["default-direct", "direct-control", "rlm-treatment"],
    shared_conditions: sharedConditions(),
    shared_permission_identity: SHARED_PERMISSION,
    rlm_only_difference: {
      component: "pinned-internal-KernelManager",
      persistent_computation: true,
      os_authority: osAuthority(),
      child_broker: broker(),
    },
    fallback: {
      triggers: ["rlm-unavailable", "rlm-disabled", "rlm-over-budget", "rlm-malformed", "rlm-interrupted", "rlm-unsafe"],
      before_provider_reachability_only: true,
      action: "append-failed-treatment-and-prepare-fresh-immutable-rc-direct-run",
      original_attempt_relabel: false,
      side_effecting_cell_replay: false,
    },
  };
}

function expectedConformanceRunManifest(codeClosureSha256, imageId, sourcePackSha256) {
  const seam = expectedRouteSeam();
  const evaluatorValue = {
    expected_result: "42",
    required_provider_requests: 0,
    required_child_requests: 0,
    required_terminal: "CONTAINMENT_CONFORMANT",
  };
  const evaluatorBytes = Buffer.from(`${canonicalJsonV1(evaluatorValue)}\n`, "utf8");
  const projection = {
    schema_version: "rc7-gate-b-conformance-run-manifest-v1",
    case_identity: "RC7-GATE-B-CONTAINMENT-PROBE-01",
    repeat: 1,
    route_identity: RLM_ROUTE,
    execution_class: "provider-free-containment-conformance-not-gate-c-case-attempt",
    component_revision: COMPONENT_COMMIT,
    provider_and_model: seam.shared_conditions,
    prompt_and_output_contracts: {
      prompt: seam.shared_conditions.semantic_prompt_block_identities,
      output: seam.shared_conditions.output_contract_identity,
    },
    shared_permission_identity: SHARED_PERMISSION,
    rlm_os_authority_identity: "rc7-gate-b-os-authority-v1",
    child_budget_identity: "rc7-gate-b-zero-child-budget-v1",
    source_pack_identity: sourcePackSha256,
    evaluator_contract_identity: {
      id: "rc7-gate-b-conformance-evaluator-v1",
      byte_count: evaluatorBytes.byteLength,
      sha256: sha256V1(evaluatorBytes),
      normalization: "canonical-json-v1-plus-lf",
    },
    code_closure_sha256: codeClosureSha256,
    image_id: imageId,
    provider_reachable: false,
  };
  return { ...projection, run_identity: sha256V1(canonicalJsonV1(projection)) };
}

function packageProjection(value) {
  const copy = structuredClone(value);
  delete copy.package_sha256;
  return copy;
}

function packageBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function recoveryProjection(value) {
  const copy = structuredClone(value);
  delete copy.recovery_sha256;
  return copy;
}

export function validateRc7RecoveryArtifactIndependent(value, expected) {
  exactKeys(expected, ["code_closure_sha256", "image_id", "source_pack_sha256"], "recovery validation closure");
  if (!HASH.test(expected.code_closure_sha256) || !IMAGE.test(expected.image_id) || !HASH.test(expected.source_pack_sha256)) fail("RUN_IDENTITY_MISMATCH", "Recovery validation closure is malformed");
  exactKeys(value, ["schema_version", "policy_identity", "run_identity", "run_manifest", "lease_identity", "image_id", "terminal", "reason", "provider_reachable_dispatches", "side_effecting_cells_replayed", "containers_cleaned", "cleaned_container_identities", "cleanup_residue_entries", "artifact", "recovery_sha256"], "Gate B recovery artifact");
  const expectedLease = sha256V1(canonicalJsonV1({ policy: POLICY, image_id: expected.image_id }));
  if (value.schema_version !== "rc7-gate-b-recovery-terminal-v1" || value.policy_identity !== POLICY
    || !HASH.test(value.run_identity) || value.lease_identity !== expectedLease || value.image_id !== expected.image_id
    || value.terminal !== "CONTAINMENT_BLOCKED" || value.reason !== "interrupted-unsealed-never-replayed"
    || value.provider_reachable_dispatches !== 0 || value.side_effecting_cells_replayed !== 0
    || !Number.isSafeInteger(value.containers_cleaned) || value.containers_cleaned < 0 || value.containers_cleaned > MODES.length
    || !Array.isArray(value.cleaned_container_identities) || value.cleaned_container_identities.length !== value.containers_cleaned
    || new Set(value.cleaned_container_identities).size !== value.cleaned_container_identities.length
    || value.cleaned_container_identities.some((identity) => !HASH.test(identity)) || value.cleanup_residue_entries !== 0) fail("RECOVERY_CONTRACT_MISMATCH", "Recovery artifact contract mismatched");
  exact(value.artifact, {
    path: "boundary-conformance-recovery.json",
    schema: "rc7-gate-b-recovery-terminal-v1",
    maximum_bytes: 16_384,
    producer: "lib/recursus/rc7-rlm-containment.mjs",
    provenance: "rc7-provider-free-gate-b-interrupted-run-recovery",
    independent_validator: "lib/recursus/rc7-rlm-containment-validator.mjs:validateRc7RecoveryArtifactIndependent",
    digest_field: "recovery_sha256",
  }, "RECOVERY_CONTRACT_MISMATCH", "Recovery artifact identity");
  const expectedManifest = expectedConformanceRunManifest(expected.code_closure_sha256, expected.image_id, expected.source_pack_sha256);
  exact(value.run_manifest, expectedManifest, "RUN_IDENTITY_MISMATCH", "Recovery run manifest");
  if (value.run_identity !== expectedManifest.run_identity || value.recovery_sha256 !== sha256V1(canonicalJsonV1(recoveryProjection(value)))) fail("RUN_IDENTITY_MISMATCH", "Recovery run or content digest mismatched");
  return value;
}

function validateRouteArtifactSet(set, qualification, codeSha) {
  exactKeys(set, ["schema_version", "run_identity", "route_visible_artifact_names", "evaluator_only_artifact_names", "artifacts", "artifact_set_sha256"], "route artifact set");
  if (set.schema_version !== "rc7-gate-b-route-artifact-set-v1" || !HASH.test(set.run_identity) || !HASH.test(set.artifact_set_sha256)) fail("ROUTE_ARTIFACT_MISMATCH", "Route artifact-set identity is malformed");
  exact(set.route_visible_artifact_names, ["research-plan.json"], "VISIBILITY_LEAK", "Route-visible artifact names");
  exact(set.evaluator_only_artifact_names, ["route-decision.json", "metrics.json", "terminal.json"], "VISIBILITY_LEAK", "Evaluator-only artifact names");
  if (!Array.isArray(set.artifacts) || set.artifacts.length !== ARTIFACTS.length) fail("ROUTE_ARTIFACT_MISMATCH", "Route artifact count mismatched");
  const byName = new Map();
  for (let index = 0; index < ARTIFACTS.length; index += 1) {
    const artifact = set.artifacts[index];
    const [name, schema, maximum] = ARTIFACTS[index];
    exactKeys(artifact, ["name", "schema", "maximum_bytes", "byte_count", "sha256", "producer", "provenance", "independent_validator", "value"], `route artifact ${name}`);
    if (artifact.name !== name || artifact.schema !== schema || artifact.maximum_bytes !== maximum
      || artifact.producer !== "lib/recursus/rc7-rlm-gate-b-route.mjs"
      || artifact.provenance !== "rc7-gate-b-provider-free-route-preparation"
      || artifact.independent_validator !== "rc7-rlm-containment-validator-v2") fail("ROUTE_ARTIFACT_MISMATCH", `${name} metadata mismatched`);
    const bytes = Buffer.from(`${canonicalJsonV1(artifact.value)}\n`, "utf8");
    if (bytes.byteLength !== artifact.byte_count || bytes.byteLength > maximum || sha256V1(bytes) !== artifact.sha256) fail("ROUTE_ARTIFACT_MISMATCH", `${name} bytes or digest mismatched`);
    byName.set(name, artifact.value);
  }
  const manifest = byName.get("run-manifest.json");
  exactKeys(manifest, ["schema_version", "case_id", "repeat", "route_identity", "component_revision", "provider_and_model", "prompt_and_output_contracts", "shared_permission_identity", "rlm_os_authority_identity", "child_budget_identity", "source_pack_identity", "evaluator_contract_identity", "code_closure_sha256", "provider_reachable", "run_identity"], "run manifest");
  const caseRecord = qualification.cases.find((item) => item.case_id === manifest.case_id);
  if (!caseRecord || manifest.repeat !== 1 || manifest.code_closure_sha256 !== codeSha || manifest.provider_reachable !== false) fail("RUN_IDENTITY_MISMATCH", "Run manifest case, repeat, code, or reachability mismatched");
  if (manifest.source_pack_identity !== caseRecord.route_visible_source_pack.sha256 || manifest.evaluator_contract_identity !== caseRecord.evaluator_only_contract.sha256) fail("SOURCE_IDENTITY_MISMATCH", "Run source or evaluator identity mismatched");
  exact(manifest.provider_and_model, sharedConditions(), "PARITY_IDENTITY_MISMATCH", "Provider/model parity");
  exact(manifest.prompt_and_output_contracts, { prompt: sharedConditions().semantic_prompt_block_identities, output: sharedConditions().output_contract_identity }, "PARITY_IDENTITY_MISMATCH", "Prompt/output parity");
  if (manifest.shared_permission_identity !== SHARED_PERMISSION || manifest.child_budget_identity !== "rc7-gate-b-zero-child-budget-v1") fail("PERMISSION_IDENTITY_MISMATCH", "Permission or budget identity mismatched");
  const projection = structuredClone(manifest);
  delete projection.run_identity;
  if (manifest.run_identity !== sha256V1(canonicalJsonV1(projection)) || set.run_identity !== manifest.run_identity) fail("RUN_IDENTITY_MISMATCH", "Immutable run identity mismatched");
  const isRlm = manifest.route_identity === RLM_ROUTE;
  const decision = byName.get("route-decision.json");
  const expectedCell = isRlm ? "rlm-treatment" : decision?.cell;
  if (isRlm ? decision?.cell !== "rlm-treatment" : !["default-direct", "direct-control"].includes(decision?.cell)) fail("ROUTE_IDENTITY_MISMATCH", "Route decision cell mismatched");
  if (isRlm && !ELIGIBLE.includes(manifest.case_id)) fail("GENERIC_RLM_SELECTION", "Generic case selected RLM");
  if (!isRlm && ![DIRECT_ROUTE].includes(manifest.route_identity)) fail("ROUTE_IDENTITY_MISMATCH", "Unknown route identity");
  if (isRlm ? manifest.component_revision !== COMPONENT_COMMIT || manifest.rlm_os_authority_identity !== "rc7-gate-b-os-authority-v1" : canonicalJsonV1(manifest.component_revision) !== canonicalJsonV1(missing("component_revision")) || manifest.rlm_os_authority_identity !== null) fail("ROUTE_IDENTITY_MISMATCH", "RLM-only authority delta mismatched");
  exact(decision, {
    schema_version: "rc7-route-decision-v1", case_id: manifest.case_id, cell: expectedCell,
    requested_mechanism: isRlm ? "rc-rlm" : "rc-direct", selected_route: isRlm ? "rc-rlm" : "rc-direct",
    selected_route_identity: manifest.route_identity, fallback_trigger: null, provider_reachable: false,
    route_visible: false, run_identity: manifest.run_identity,
  }, "ROUTE_IDENTITY_MISMATCH", "Route decision");
  const plan = byName.get("research-plan.json");
  exact(plan, { run_identity: manifest.run_identity, status: "provider-free-route-prepared-no-research-executed", visible_source_pack_sha256: manifest.source_pack_identity, planned_operations: [] }, "ROUTE_ARTIFACT_MISMATCH", "Research plan");
  if (/eligible|oracle|evaluator/iu.test(canonicalJsonV1(plan))) fail("VISIBILITY_LEAK", "Route-visible research plan contains evaluator-only bytes");
  exact(byName.get("evidence-ledger.jsonl"), { run_identity: manifest.run_identity, entries: [] }, "ROUTE_ARTIFACT_MISMATCH", "Evidence ledger");
  exact(byName.get("intermediate-computation.json"), { run_identity: manifest.run_identity, operations: [], rlm_memory_is_source_truth: false }, "ROUTE_ARTIFACT_MISMATCH", "Intermediate computation");
  exact(byName.get("result.json"), { run_identity: manifest.run_identity, status: "not-executed-gate-b-provider-free", claims: [] }, "ROUTE_ARTIFACT_MISMATCH", "Result");
  exact(byName.get("metrics.json"), { run_identity: manifest.run_identity, status: "not-measured", provider_requests: 0, child_requests: 0 }, "ROUTE_ARTIFACT_MISMATCH", "Metrics");
  exact(byName.get("terminal.json"), { run_identity: manifest.run_identity, terminal: "GATE_B_ROUTE_PREPARED_PROVIDER_FREE", provider_requests: 0 }, "ROUTE_ARTIFACT_MISMATCH", "Terminal");
  const identities = set.artifacts.map(({ value, ...identity }) => identity);
  if (set.artifact_set_sha256 !== sha256V1(canonicalJsonV1(identities))) fail("ROUTE_ARTIFACT_MISMATCH", "Artifact-set digest mismatched");
  return { caseId: manifest.case_id, cell: expectedCell, manifest };
}

export function validateRc7GateBRouteArtifactSetIndependent(set, qualification, codeClosureSha256) {
  if (!qualification || !Array.isArray(qualification.cases)) fail("QUALIFICATION_IDENTITY_MISMATCH", "Route artifact validation requires the registered qualification catalog");
  if (!HASH.test(codeClosureSha256)) fail("CODE_CLOSURE_MISMATCH", "Route artifact validation requires one exact code-closure digest");
  return validateRouteArtifactSet(set, qualification, codeClosureSha256);
}

function allProbePredicatesPass(probes) {
  return probes.broker.child_requests === 0 && probes.broker.host_requests === 0 && probes.broker.provider_reachable === false
    && probes.conformance.compute_result === "42" && probes.conformance.connection_removed === true
    && probes.conformance.hmac_present === true && probes.conformance.input_readonly === true
    && probes.conformance.loopback_only === true && probes.conformance.negative_authority_probes_passed === true
    && probes.conformance.phase_two_seccomp_tsync === "SECCOMP_FILTER_FLAG_TSYNC"
    && probes.conformance.phase_two_clone3_action === "ENOSYS-for-safe-clone-thread-fallback"
    && probes.conformance.phase_two_all_threads_filtered === true
    && probes.conformance.phase_two_no_new_privileges === true
    && probes.conformance.phase_two_capabilities_zero === true
    && probes.conformance.phase_two_filter_counts_increased === true
    && probes.conformance.phase_two_new_thread_inherited === true
    && probes.conformance.python_output_crud === true && probes.conformance.root_escape_denied === true
    && probes.conformance.symlink_escape_denied === true && Object.values(probes.resources).every((item) => item === true);
}

function normalizedProbesFromEvidence(modes) {
  try {
    const worker = Object.fromEntries(modes.map((item) => [item.mode, item.worker_result]));
    return {
      broker: { child_requests: 0, host_requests: 0, provider_reachable: false },
      conformance: {
        compute_result: worker.conformance.execution.compute_result,
        connection_removed: worker.conformance.probes.connection_removed.denied,
        hmac_present: worker.conformance.runtime.hmac_present,
        input_readonly: worker.conformance.probes.input_readonly.denied,
        loopback_only: worker.conformance.runtime.loopback,
        negative_authority_probes_passed: worker.conformance.passed,
        phase_two_seccomp_tsync: worker.conformance.runtime.phase_two_seccomp.flag,
        phase_two_clone3_action: worker.conformance.runtime.phase_two_seccomp.clone3_action,
        phase_two_all_threads_filtered: worker.conformance.runtime.phase_two_seccomp.all_after_seccomp_two,
        phase_two_no_new_privileges: worker.conformance.runtime.phase_two_seccomp.all_after_no_new_privileges,
        phase_two_capabilities_zero: worker.conformance.runtime.phase_two_seccomp.all_after_capabilities_zero,
        phase_two_filter_counts_increased: worker.conformance.runtime.phase_two_seccomp.all_surviving_filter_counts_increased,
        phase_two_new_thread_inherited: worker.conformance.runtime.phase_two_seccomp.new_thread_inherited,
        python_output_crud: worker.conformance.probes.python_output_crud,
        root_escape_denied: worker.conformance.probes.root_escape_denied.denied,
        symlink_escape_denied: worker.conformance.probes.symlink_escape_denied.denied,
      },
      resources: {
        cpu_wall_timeout_enforced: worker.cpu.passed,
        file_size_ceiling_enforced: worker["file-size"].passed,
        memory_ceiling_enforced: worker.memory.passed,
        output_byte_ceiling_enforced: worker.bytes.passed,
        output_inode_ceiling_enforced: worker.inodes.passed,
        pids_ceiling_enforced: worker.pids.passed,
      },
    };
  } catch {
    fail("PROBE_EVIDENCE_MISMATCH", "Raw probe evidence cannot be normalized");
  }
}

function validateWorkerResult(item, sourceIdentity, workerIdentity) {
  const result = item.worker_result;
  if (item.mode === "conformance") {
    exactKeys(result, ["schema_version", "mode", "input", "runtime", "probes", "execution", "output_entries_before_result", "passed"], "conformance worker result");
    exactKeys(result.input, ["contract_sha256", "source_pack_sha256"], "conformance input identity");
    const contractBytes = Buffer.from(`${canonicalJsonV1({ schema_version: "rc7-gate-b-runtime-contract-v1", policy: POLICY, source_pack_sha256: sourceIdentity.sha256 })}\n`, "utf8");
    if (result.input.contract_sha256 !== sha256V1(contractBytes) || result.input.source_pack_sha256 !== sourceIdentity.sha256) fail("PROBE_EVIDENCE_MISMATCH", "Conformance source or contract identity mismatched");
    exactKeys(result.runtime, ["worker_sha256", "hmac_present", "loopback", "node", "phase_two_seccomp", "ports_valid", "python"], "conformance runtime");
    exactKeys(result.runtime.phase_two_seccomp, ["flag", "clone3_action", "all_after_seccomp_two", "all_after_no_new_privileges", "all_after_capabilities_zero", "all_surviving_filter_counts_increased", "new_thread_inherited"], "phase-two seccomp result");
    if (result.runtime.worker_sha256 !== workerIdentity.sha256 || result.runtime.node !== "v24.19.0" || result.runtime.python !== "/opt/rc7/python/bin/python"
      || result.runtime.hmac_present !== true || result.runtime.loopback !== true || result.runtime.ports_valid !== true) fail("PROBE_EVIDENCE_MISMATCH", "Conformance runtime identity mismatched");
    exactKeys(result.execution, ["bootstrap_status", "compute_result", "compute_status", "host_request_count", "negative_status", "seccomp_status", "set_status"], "conformance execution");
    exact(result.execution, { bootstrap_status: "ok", compute_result: "42", compute_status: "ok", host_request_count: 0, negative_status: "ok", seccomp_status: "ok", set_status: "ok" }, "PROBE_EVIDENCE_MISMATCH", "Conformance execution");
    exactKeys(result.probes, ["connection_removed", "docker_socket_absent", "input_readonly", "named_pipe_absent", "negative_results", "node_output_crud", "python_output_crud", "root_escape_denied", "symlink_escape_denied"], "conformance probes");
    exact(result.probes, {
      connection_removed: { denied: true, error: { code: "ENOENT", name: "Error" } },
      docker_socket_absent: { denied: true, error: { code: "ENOENT", name: "Error" } },
      input_readonly: { denied: true, error: { code: "EROFS", name: "Error" } },
      named_pipe_absent: { denied: true, error: { code: "ENOENT", name: "Error" } },
      negative_results: {
        dns: { denied: true, errno: -3, error: "gaierror" },
        http: { denied: true, errno: 1, error: "PermissionError" },
        output_escape: { denied: true, errno: 30, error: "OSError" },
        python_crud: { passed: true },
        repository_read: { denied: true, errno: 2, error: "FileNotFoundError" },
        sibling_read: { denied: true, errno: 2, error: "FileNotFoundError" },
        subprocess: { denied: true, errno: 1, error: "PermissionError" },
        synthetic_credential_read: { denied: true, errno: 2, error: "FileNotFoundError" },
        tcp_socket: { denied: true, errno: 1, error: "PermissionError" },
        udp_socket: { denied: true, errno: 1, error: "PermissionError" },
        user_layer_read: { denied: true, errno: 2, error: "FileNotFoundError" },
      },
      node_output_crud: true,
      python_output_crud: true,
      root_escape_denied: { denied: true, error: { code: "EROFS", name: "Error" } },
      symlink_escape_denied: { denied: true, error: { code: "ENOENT", name: "Error" } },
    }, "PROBE_EVIDENCE_MISMATCH", "Conformance negative authority probes");
    exact(result.output_entries_before_result, ["empty-prime", "global-harness", "home", "ipython", "session", "tmp"], "PROBE_EVIDENCE_MISMATCH", "Conformance pre-result output entries");
    if (typeof result.passed !== "boolean") fail("PROBE_EVIDENCE_MISMATCH", "Conformance worker pass predicate is malformed");
  } else {
    const expectedKeys = {
      pids: ["schema_version", "mode", "attempted_processes", "configured_pids_ceiling", "limited_before_all_processes_started", "passed"],
      "file-size": ["schema_version", "mode", "attempted_bytes", "configured_file_size_ceiling", "denied", "passed"],
      inodes: ["schema_version", "mode", "attempted_inodes", "configured_inode_ceiling", "denied_before_attempt_complete", "passed"],
      bytes: ["schema_version", "mode", "attempted_bytes", "configured_byte_ceiling", "denied_before_attempt_complete", "passed"],
      memory: ["schema_version", "mode", "memory_ceiling_bytes", "passed"],
      cpu: ["schema_version", "mode", "wall_timeout_ms", "passed"],
    }[item.mode];
    exactKeys(result, expectedKeys, `${item.mode} worker result`);
    const expectedResult = {
      pids: { schema_version: "rc7-gate-b-worker-result-v1", mode: "pids", attempted_processes: 32, configured_pids_ceiling: 24, limited_before_all_processes_started: true, passed: result.passed },
      "file-size": { schema_version: "rc7-gate-b-worker-result-v1", mode: "file-size", attempted_bytes: 2_097_152, configured_file_size_ceiling: 1_048_576, denied: true, passed: result.passed },
      inodes: { schema_version: "rc7-gate-b-worker-result-v1", mode: "inodes", attempted_inodes: 400, configured_inode_ceiling: 256, denied_before_attempt_complete: true, passed: result.passed },
      bytes: { schema_version: "rc7-gate-b-worker-result-v1", mode: "bytes", attempted_bytes: 33_554_432, configured_byte_ceiling: 16_777_216, denied_before_attempt_complete: true, passed: result.passed },
      memory: { schema_version: "rc7-gate-b-worker-result-v1", mode: "memory", memory_ceiling_bytes: 134_217_728, passed: result.passed },
      cpu: { schema_version: "rc7-gate-b-worker-result-v1", mode: "cpu", wall_timeout_ms: 3_000, passed: result.passed },
    }[item.mode];
    exact(result, expectedResult, "PROBE_EVIDENCE_MISMATCH", `${item.mode} worker result`);
  }
}

function validateContainerConfiguration(item, imageId) {
  const value = item.container_configuration;
  exactKeys(value, ["command", "environment_names", "image_id", "labels", "mode", "mounts", "namespace_and_authority", "process", "resources", "user"], `${item.mode} container configuration`);
  const lease = sha256V1(canonicalJsonV1({ policy: POLICY, image_id: imageId }));
  exact(value.command, [item.mode], "CONTAINER_IDENTITY_MISMATCH", `${item.mode} command`);
  exact(value.environment_names, ENV_NAMES, "ENVIRONMENT_IDENTITY_MISMATCH", `${item.mode} environment names`);
  exact(value.labels, { lease, mode: item.mode, policy: POLICY }, "CONTAINER_IDENTITY_MISMATCH", `${item.mode} labels`);
  if (value.image_id !== imageId || value.mode !== item.mode || value.user !== "65532:65532") fail("CONTAINER_IDENTITY_MISMATCH", `${item.mode} image, mode, or user mismatched`);
  exact(value.mounts, {
    input: { destination: "/rc7/input", read_only: true },
    output_tmpfs_options: ["gid=65532", "mode=0700", "nodev", "noexec", "nosuid", "nr_inodes=256", "rw", "size=16777216", "uid=65532"],
  }, "MOUNT_IDENTITY_MISMATCH", `${item.mode} mounts`);
  exactKeys(value.namespace_and_authority, ["network", "ipc", "pid", "cgroup", "readonly_rootfs", "privileged", "cap_add", "cap_drop", "security_opt", "devices", "device_requests", "ports", "exposed_ports"], `${item.mode} namespace and authority`);
  const authority = structuredClone(value.namespace_and_authority);
  const securityOpt = authority.security_opt;
  delete authority.security_opt;
  exact(authority, {
    network: "none", ipc: "none", pid: "", cgroup: "private", readonly_rootfs: true, privileged: false,
    cap_add: [], cap_drop: ["ALL"], devices: [], device_requests: [], ports: {}, exposed_ports: {},
  }, "CONTAINMENT_WEAKENED", `${item.mode} effective authority`);
  if (!Array.isArray(securityOpt) || securityOpt.length !== 2 || securityOpt[0] !== "no-new-privileges:true"
    || !securityOpt[1]?.startsWith("seccomp=") || sha256V1(securityOpt[1]) !== OUTER_SECCOMP_INSPECT_SHA256) fail("SECCOMP_POLICY_MISMATCH", `${item.mode} effective outer seccomp identity mismatched`);
  exact(value.resources, {
    pids: item.mode === "pids" ? RESOURCE_LIMITS.pids_probe : RESOURCE_LIMITS.pids,
    memory: item.mode === "memory" ? RESOURCE_LIMITS.memory_probe_bytes : RESOURCE_LIMITS.memory_bytes,
    memory_swap: item.mode === "memory" ? RESOURCE_LIMITS.memory_probe_bytes : RESOURCE_LIMITS.memory_bytes,
    cpu_nanos: RESOURCE_LIMITS.cpu_nanos,
    ulimits: [
      { Hard: RESOURCE_LIMITS.file_size_bytes, Name: "fsize", Soft: RESOURCE_LIMITS.file_size_bytes },
      { Hard: RESOURCE_LIMITS.nofile, Name: "nofile", Soft: RESOURCE_LIMITS.nofile },
    ],
  }, "RESOURCE_IDENTITY_MISMATCH", `${item.mode} effective resources`);
  exact(value.process, { init: true, log_driver: "none", runtime: "runc", stop_timeout: 1 }, "CONTAINMENT_WEAKENED", `${item.mode} process controls`);
}

export function validateRc7ContainmentPackageIndependent(value, qualification = undefined) {
  exactKeys(value, [
    "schema_version", "policy_identity", "gate_a_qualification_sha256", "gate_a_case_catalog_sha256", "code_closure", "conformance_run_manifest", "route_contract",
    "executable_route_seam", "route_artifact_sets", "component", "boundary", "host_runtime", "visible_input",
    "direct_route_conformance", "probe_evidence", "probes", "recovery", "fault_contract", "accounting",
    "retained_artifacts", "cleanup", "terminal", "non_claims", "package_sha256",
  ], "Gate B package");
  if (value.schema_version !== SCHEMA || value.policy_identity !== POLICY) fail("POLICY_IDENTITY_MISMATCH", "Gate B policy identity mismatched");
  if (value.gate_a_qualification_sha256 !== QUALIFICATION_SHA256) fail("QUALIFICATION_IDENTITY_MISMATCH", "Gate A qualification identity mismatched");
  if (value.gate_a_case_catalog_sha256 !== QUALIFICATION_CASE_CATALOG_SHA256) fail("QUALIFICATION_IDENTITY_MISMATCH", "Gate A case-catalog link mismatched");
  if (!value.code_closure || value.code_closure.base_commit !== "7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5" || !HASH.test(value.code_closure.files_sha256)) fail("CODE_CLOSURE_MISMATCH", "Code closure identity is malformed");
  exact(value.code_closure.files.map((item) => item.path), CODE_FILES, "CODE_CLOSURE_MISMATCH", "Code closure paths");
  if (value.code_closure.files.some((item) => !Number.isSafeInteger(item.byte_count) || item.byte_count < 1 || !HASH.test(item.sha256))) fail("CODE_CLOSURE_MISMATCH", "Code closure entries are malformed");
  if (value.code_closure.files_sha256 !== sha256V1(canonicalJsonV1(value.code_closure.files))) fail("CODE_CLOSURE_MISMATCH", "Code closure digest mismatched");
  exact(value.route_contract, {
    default_route: "rc-direct", direct_identity: DIRECT_ROUTE, generic_case_route: "rc-direct",
    eligible_treatment_route: "rc-rlm", rlm_identity: RLM_ROUTE, rlm_is_opt_in: true,
    automatic_routing_claimed: false, shared_conditions_frozen_for_gate_c: false, gate_c_execution_authorized: false,
  }, "ROUTE_IDENTITY_MISMATCH", "Route contract");
  exact(value.executable_route_seam, expectedRouteSeam(), "ROUTE_IDENTITY_MISMATCH", "Executable route seam");
  if (!qualification) fail("QUALIFICATION_IDENTITY_MISMATCH", "Independent validation requires the frozen Gate A qualification closure");
  if (!qualification || !Array.isArray(qualification.cases) || canonicalJsonV1(qualification.cases.map((item) => item.case_id)) !== canonicalJsonV1(CASES)) fail("QUALIFICATION_IDENTITY_MISMATCH", "Current registered case catalog mismatched");
  if (sha256V1(canonicalJsonV1(qualification.cases)) !== value.gate_a_case_catalog_sha256) fail("QUALIFICATION_IDENTITY_MISMATCH", "Registered case catalog does not match the Gate A case-catalog link");
  if (!Array.isArray(value.route_artifact_sets) || value.route_artifact_sets.length !== 9) fail("ROUTE_ARTIFACT_MISMATCH", "Expected nine provider-free route preparations");
  const assignments = value.route_artifact_sets.map((set) => validateRouteArtifactSet(set, qualification, value.code_closure.files_sha256));
  exact(assignments.map(({ caseId, cell }) => `${caseId}:${cell}`), [
    "LAB-01:direct-control", "LAB-01:rlm-treatment", "PAPER-01:direct-control", "PAPER-01:rlm-treatment",
    "REPO-01:direct-control", "REPO-01:rlm-treatment", "FACT-01:direct-control", "FACT-03:direct-control", "SAFE-01:direct-control",
  ], "ROUTE_ARTIFACT_MISMATCH", "Route assignments");
  for (const caseId of ELIGIBLE) {
    const pair = assignments.filter((item) => item.caseId === caseId).map((item) => item.manifest);
    const projection = (item) => {
      const copy = structuredClone(item);
      for (const key of ["run_identity", "route_identity", "component_revision", "rlm_os_authority_identity"]) delete copy[key];
      return copy;
    };
    if (canonicalJsonV1(projection(pair[0])) !== canonicalJsonV1(projection(pair[1]))) fail("PARITY_IDENTITY_MISMATCH", `${caseId} direct/RLM shared conditions differ`);
  }
  exactKeys(value.component, ["source", "commit", "dependency_locks", "invocation", "public_provider_adapter_exposed", "python_provisioning_at_runtime", "max_depth", "accepted_recursus_profile_reproduced", "accepted_archive_bytes_claimed"], "component");
  if (value.component.source !== "OpenCnid/deepseek-rlm" || value.component.commit !== COMPONENT_COMMIT
    || value.component.invocation !== "internal-KernelManager-provider-free-conformance-only"
    || value.component.public_provider_adapter_exposed !== false || value.component.python_provisioning_at_runtime !== false
    || value.component.max_depth !== 0 || value.component.accepted_recursus_profile_reproduced !== false
    || value.component.accepted_archive_bytes_claimed !== false) fail("COMPONENT_IDENTITY_MISMATCH", "Component closure mismatched");
  exact(value.component.dependency_locks, {
    pnpm_lock_sha256: "d1ae2cc697db86d42dadda4653f82ae64131f7010b440e130d5b4fb6d30cc08d",
    uv_lock_sha256: "588a9165560eba4a70bfad798b4f67418c09498dc77b64e8c5ec7b4e150c7413",
    managed_requirements_sha256: "0d72c8c450c62fdb405db96cfa5dbffb3a60eedacb24dc37c028267696d258af",
    pnpm_version: "9.14.4", python_version: "3.11.16",
  }, "COMPONENT_IDENTITY_MISMATCH", "Dependency closure");
  exactKeys(value.boundary, ["implementation", "image_id", "host_controller", "base_images", "fixture_identities", "capability_policy_default", "syscall_filter_model", "syscall_default_deny", "direct_python_is_operating_system_authority", "outer_controls", "phase_two_denials", "resource_limits", "environment_names", "allowed_engine_structural_diff"], "boundary");
  if (!IMAGE.test(value.boundary.image_id) || value.boundary.image_id !== value.host_runtime.image_id
    || value.boundary.implementation !== "docker-desktop-linux-container-plus-phase-two-kernel-seccomp"
    || value.boundary.capability_policy_default !== "deny-unlisted-high-level-capability"
    || value.boundary.syscall_filter_model !== "frozen-default-errno-allowlist-plus-phase-two-tsync-denials"
    || value.boundary.syscall_default_deny !== true || value.boundary.direct_python_is_operating_system_authority !== true) fail("BOUNDARY_IDENTITY_MISMATCH", "Boundary identity mismatched");
  exact(value.boundary.base_images, {
    node: "node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df",
    python: "python@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b",
  }, "BOUNDARY_IDENTITY_MISMATCH", "Base images");
  exact(value.boundary.host_controller, {
    docker_executable: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
    sha256: "805149723eb721d3cbb944c441423c01a4f4fcd6968a81e57bc1781441762a85",
  }, "BOUNDARY_IDENTITY_MISMATCH", "Host controller");
  exact(value.boundary.outer_controls, {
    network: "none", root_filesystem: "read-only", user: "65532:65532", capabilities: "drop-all",
    no_new_privileges: true, ipc: "none", pid: "private-default", cgroup_namespace: "private", devices: "none",
    ports: "none", input_mount: "one-read-only-synthetic-bind", output_mount: "one-noexec-nosuid-nodev-bounded-tmpfs",
    docker_socket: "absent", host_user_layer_mounts: "absent",
  }, "BOUNDARY_IDENTITY_MISMATCH", "Outer controls");
  exact(value.boundary.resource_limits, RESOURCE_LIMITS, "RESOURCE_IDENTITY_MISMATCH", "Resource limits");
  exact(value.boundary.environment_names, ENV_NAMES, "ENVIRONMENT_IDENTITY_MISMATCH", "Environment names");
  exact(value.boundary.phase_two_denials, PHASE_TWO_DENIALS, "BOUNDARY_IDENTITY_MISMATCH", "Phase-two denials");
  exact(value.boundary.allowed_engine_structural_diff, ALLOWED_DOCKER_DIFF, "BOUNDARY_IDENTITY_MISMATCH", "Allowed Docker structural diff");
  exact(value.boundary.fixture_identities.map((item) => item.path), FIXTURES, "FIXTURE_IDENTITY_MISMATCH", "Fixture paths");
  if (value.boundary.fixture_identities.some((item) => !Number.isSafeInteger(item.bytes) || item.bytes < 1 || !HASH.test(item.sha256))) fail("FIXTURE_IDENTITY_MISMATCH", "Fixture identity is malformed");
  exact(value.host_runtime, { ...HOST_RUNTIME, image_id: value.boundary.image_id }, "HOST_RUNTIME_MISMATCH", "Host runtime tuple");
  const sourceIdentity = value.boundary.fixture_identities.find((item) => item.path.endsWith("/source-pack.json"));
  const workerIdentity = value.boundary.fixture_identities.find((item) => item.path.endsWith("/gate-b-worker.mjs"));
  exact(value.conformance_run_manifest, expectedConformanceRunManifest(value.code_closure.files_sha256, value.boundary.image_id, sourceIdentity.sha256), "RUN_IDENTITY_MISMATCH", "Conformance run manifest");
  exact(value.visible_input, { identity: sourceIdentity, synthetic_only: true, eligibility_bytes_present: false, evaluator_or_oracle_bytes_present: false }, "VISIBILITY_LEAK", "Visible input");
  exact(value.direct_route_conformance, {
    schema_version: "rc7-gate-b-direct-result-v1", route_identity: DIRECT_ROUTE, source_pack_sha256: sourceIdentity.sha256,
    result: "42", provider_requests: 0, child_requests: 0, operating_system_authority_delta: "rc7-no-authority-delta-v1",
  }, "DIRECT_ROUTE_MISMATCH", "Direct route result");
  exactKeys(value.probe_evidence, ["schema_version", "run_identity", "modes", "evidence_sha256"], "probe evidence");
  if (value.probe_evidence.schema_version !== "rc7-gate-b-probe-evidence-v1" || value.probe_evidence.run_identity !== value.conformance_run_manifest.run_identity || !Array.isArray(value.probe_evidence.modes)
    || value.probe_evidence.modes.length !== MODES.length || value.probe_evidence.evidence_sha256 !== sha256V1(canonicalJsonV1(value.probe_evidence.modes))) fail("PROBE_EVIDENCE_MISMATCH", "Probe evidence identity mismatched");
  exact(value.probe_evidence.modes.map((item) => item.mode), MODES, "PROBE_EVIDENCE_MISMATCH", "Probe evidence modes");
  for (const item of value.probe_evidence.modes) {
    exactKeys(item, ["mode", "container_configuration", "worker_result", "docker_diff", "producer", "provenance"], `probe evidence ${item.mode}`);
    if (item.producer !== "scripts/recursus/rc7-rlm-containment.mjs+gate-b-worker.mjs" || item.provenance !== "provider-free-local-docker-inspect-worker-stdout-and-diff") fail("PROBE_EVIDENCE_MISMATCH", "Probe evidence provenance mismatched");
    if (!item.worker_result || typeof item.worker_result.passed !== "boolean" || item.worker_result.schema_version !== "rc7-gate-b-worker-result-v1" || item.worker_result.mode !== item.mode) fail("PROBE_EVIDENCE_MISMATCH", `${item.mode} worker result is malformed or mismatched`);
    exact(item.docker_diff, ALLOWED_DOCKER_DIFF, "ROOTFS_RESIDUE", `${item.mode} Docker diff`);
    validateContainerConfiguration(item, value.boundary.image_id);
    validateWorkerResult(item, sourceIdentity, workerIdentity);
  }
  exactKeys(value.probes, ["broker", "conformance", "resources"], "normalized probes");
  const recomputedProbes = normalizedProbesFromEvidence(value.probe_evidence.modes);
  exact(value.probes, recomputedProbes, "PROBE_EVIDENCE_MISMATCH", "Normalized probes derived from raw evidence");
  const expectedTerminal = allProbePredicatesPass(recomputedProbes) ? "CONTAINMENT_CONFORMANT" : "CONTAINMENT_BLOCKED";
  if (value.terminal !== expectedTerminal) fail("FALSE_CONFORMANCE", "Terminal does not match independently derived raw predicates");
  if (!new Set(["CONTAINMENT_CONFORMANT", "CONTAINMENT_BLOCKED"]).has(value.terminal)) fail("TERMINAL_MISMATCH", "Unknown Gate B terminal");
  exact(value.recovery, {
    exclusive_lock: ".boundary-conformance.lock",
    provider_reachable_dispatches: 0,
    side_effecting_cell_replay: "denied",
    interrupted_unsealed_execution: "stop-clean-and-mark-indeterminate-never-replay",
    safe_fallback: "new-immutable-rc-direct-identity-only",
    repeated_inspection_idempotent: true,
    concurrent_recovery: "one-exclusive-winner-others-fail-closed",
    journal: {
      schema_version: "rc7-gate-b-journal-v1",
      hash_chain: "sha256-canonical-entry-plus-previous-digest",
      container_lease_labels: "policy+lease+mode",
      recovery_may_start_container: false,
      checkpoints: RECOVERY_CHECKPOINTS,
    },
  }, "RECOVERY_CONTRACT_MISMATCH", "Recovery contract");
  if (value.fault_contract.count !== 54 || value.fault_contract.registered_faults.length !== 54
    || value.fault_contract.result_claim !== "none-in-package-focused-harness-must-inject-each-fault"
    || value.fault_contract.provider_free_required !== true) fail("FAULT_CONTRACT_MISMATCH", "Fault contract mismatched");
  exact(value.fault_contract.rejects, ["real-credentials", "provider-authority", "external-urls", "external-mutation"], "FAULT_CONTRACT_MISMATCH", "Fault authority rejects");
  exact(value.fault_contract.registered_faults, qualification.provider_free_fault_contract.registered_faults, "FAULT_CONTRACT_MISMATCH", "Registered faults");
  exactKeys(value.accounting, ["rlm_executions", "provider_calls", "simulated_provider_requests", "credential_accesses", "runtime_network_actions", "child_requests", "external_service_mutations", "wsl_cli_invocations", "docker_containers_created", "retained_artifacts", "terminal_decisions", "operator_steps", "cleanup_residue_entries"], "accounting");
  if (value.accounting.rlm_executions !== 1 || value.accounting.provider_calls !== 0 || value.accounting.simulated_provider_requests !== 0
    || value.accounting.credential_accesses !== 0 || value.accounting.runtime_network_actions !== 0 || value.accounting.child_requests !== 0
    || value.accounting.external_service_mutations !== 0 || value.accounting.wsl_cli_invocations !== 0
    || value.accounting.docker_containers_created !== 7 || value.accounting.retained_artifacts !== 1
    || value.accounting.terminal_decisions !== 1 || value.accounting.operator_steps !== 0 || value.accounting.cleanup_residue_entries !== 0) fail("ACCOUNTING_MISMATCH", "Provider-free accounting mismatched");
  exact(value.retained_artifacts, [{
    path: "boundary-conformance-package.json", schema: SCHEMA, maximum_bytes: 262_144,
    producer: "lib/recursus/rc7-rlm-containment.mjs", provenance: "rc7-provider-free-gate-b-local-conformance",
    digest_field: "package_sha256", independent_validator: "lib/recursus/rc7-rlm-containment-validator.mjs",
  }], "ARTIFACT_IDENTITY_MISMATCH", "Retained artifact contract");
  exact(value.cleanup, { labelled_containers: 0, created_networks: 0, created_volumes: 0, host_root_residue_entries: 0 }, "CLEANUP_RESIDUE", "Cleanup accounting");
  exact(value.non_claims, NON_CLAIMS, "NON_CLAIM_MISMATCH", "Gate B non-claims");
  if (value.package_sha256 !== sha256V1(canonicalJsonV1(packageProjection(value)))) fail("PACKAGE_DIGEST_MISMATCH", "Gate B package digest mismatched");
  if (packageBytes(value).byteLength > 262_144) fail("OVERSIZED_ARTIFACT", "Gate B package exceeds 262144 bytes");
  return value;
}

export async function validateRc7ContainmentPackageAgainstRepository(value, repositoryRoot) {
  const qualification = await buildRc7QualificationPackage();
  validateRc7ContainmentPackageIndependent(value, qualification);
  const observedCode = [];
  for (const relative of CODE_FILES) {
    const bytes = await readFile(path.join(repositoryRoot, ...relative.split("/")));
    observedCode.push({ path: relative, byte_count: bytes.byteLength, sha256: sha256V1(bytes) });
  }
  exact(value.code_closure.files, observedCode, "STALE_CODE_CLOSURE", "Repository code closure");
  for (const identity of value.boundary.fixture_identities) {
    const bytes = await readFile(path.join(repositoryRoot, ...identity.path.split("/")));
    exact(identity, { path: identity.path, bytes: bytes.byteLength, sha256: sha256V1(bytes) }, "FIXTURE_IDENTITY_MISMATCH", identity.path);
  }
  const seccomp = JSON.parse(await readFile(path.join(repositoryRoot, "tests", "recursus", "fixtures", "rc7-rlm-containment", "outer-seccomp-default-errno.json"), "utf8"));
  if (seccomp.defaultAction !== "SCMP_ACT_ERRNO" || !Array.isArray(seccomp.syscalls) || seccomp.syscalls.length === 0) fail("SECCOMP_POLICY_MISMATCH", "Outer seccomp is not a frozen default-errno allowlist");
  const provenance = JSON.parse(await readFile(path.join(repositoryRoot, "tests", "recursus", "fixtures", "rc7-rlm-containment", "outer-seccomp-provenance.json"), "utf8"));
  if (provenance.source_commit !== "de2c5158b0d0203e9a29f2117f62e97b38813ecd" || provenance.retained_sha256 !== value.boundary.fixture_identities.find((item) => item.path.endsWith("outer-seccomp-default-errno.json")).sha256) fail("SECCOMP_POLICY_MISMATCH", "Outer seccomp provenance mismatched");
  const worker = await readFile(path.join(repositoryRoot, "tests", "recursus", "fixtures", "rc7-rlm-containment", "gate-b-worker.mjs"), "utf8");
  if (!worker.includes("SECCOMP_FILTER_FLAG_TSYNC") || !worker.includes("all_surviving_filter_counts_increased") || !worker.includes("new_thread_inherited")) fail("SECCOMP_POLICY_MISMATCH", "Phase-two TSYNC proof is absent");
  return value;
}

export const __test = Object.freeze({ CODE_FILES, FIXTURES, MODES, packageBytes, packageProjection });
