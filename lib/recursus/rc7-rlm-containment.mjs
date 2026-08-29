import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RC7_REGISTERED_FAULTS, buildRc7QualificationPackage } from "./rc7-rlm-qualification.mjs";
import { canonicalJsonV1, sha256V1 } from "./prompt-context-v1.mjs";
import {
  Rc7ContainmentValidationError,
  validateRc7RecoveryArtifactIndependent,
  validateRc7ContainmentPackageAgainstRepository,
  validateRc7ContainmentPackageIndependent,
} from "./rc7-rlm-containment-validator.mjs";
import {
  buildRc7GateBRouteArtifactSet,
  buildRc7GateBRouteSeamContract,
  executeRc7GateBProviderFreeDirect,
} from "./rc7-rlm-gate-b-route.mjs";

export { RC7_REGISTERED_FAULTS };

export const RC7_CONTAINMENT_SCHEMA = "rc7-rlm-boundary-conformance-package-v1";
export const RC7_CONTAINMENT_POLICY_ID = "rc7-rlm-gate-b-docker-contained-provider-free-v1";
export const RC7_CONTAINMENT_TERMINALS = Object.freeze(["CONTAINMENT_CONFORMANT", "CONTAINMENT_BLOCKED"]);
export const RC7_RLM_COMPONENT_COMMIT = "4772c12b0630706f14d16e70be0ad67bff116690";
export const RC7_GATE_A_QUALIFICATION_SHA256 = "9a0535825a0cdea1372f89266643e00b3b20dd4cde8eb9ea97c2b4b398a893bb";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(MODULE_DIR, "..", "..");
const FIXTURE_ROOT = path.join(REPOSITORY_ROOT, "tests", "recursus", "fixtures", "rc7-rlm-containment");
const PACKAGE_NAME = "boundary-conformance-package.json";
const STAGE_NAME = ".boundary-conformance-package.staged";
const STATE_NAME = ".boundary-conformance-state.json";
const LOCK_NAME = ".boundary-conformance.lock";
const JOURNAL_NAME = ".boundary-conformance-journal.jsonl";
const RECOVERY_NAME = "boundary-conformance-recovery.json";
const MAX_PACKAGE_BYTES = 256 * 1024;
const IMAGE_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const CONTAINER_ENV_NAMES = Object.freeze([
  "GPG_KEY", "HOME", "LANG", "LC_ALL", "PATH", "PYTHON_SHA256", "PYTHON_VERSION",
  "RC7_GATE_B_POLICY", "TMPDIR", "TZ",
]);
const ALLOWED_DOCKER_DIFF = Object.freeze([
  "A /rc7/input", "A /usr/sbin/docker-init", "C /rc7", "C /usr", "C /usr/sbin",
]);
const PROBE_MODES = Object.freeze(["conformance", "pids", "file-size", "inodes", "bytes", "memory", "cpu"]);
export const RC7_CONTAINMENT_INTERRUPTION_POINTS = Object.freeze([
  "after-lock", "after-fixture-validation", "before-dispatch", "after-dispatch-without-sealed-result",
  "after-result-sealing", "after-state-write", "after-stage-write", "during-publication", "after-publication",
]);
const OUTER_SECCOMP_NAME = "outer-seccomp-default-errno.json";
const CODE_FILES = Object.freeze([
  "lib/recursus/prompt-context-v1.mjs",
  "lib/recursus/rc7-rlm-qualification.mjs",
  "lib/recursus/rc7-rlm-containment.mjs",
  "lib/recursus/rc7-rlm-containment-validator.mjs",
  "lib/recursus/rc7-rlm-gate-b-route.mjs",
  "scripts/recursus/rc7-rlm-containment.mjs",
  "tests/recursus/fixtures/rc7-rlm-containment/Dockerfile",
  "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-default-errno.json",
  "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-provenance.json",
  "tests/recursus/fixtures/rc7-rlm-containment/source-pack.json",
  "tests/recursus/fixtures/rc7-rlm-containment/gate-b-worker.mjs",
]);
const DOCKER_EXECUTABLE = "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe";
const DOCKER_EXECUTABLE_SHA256 = "805149723eb721d3cbb944c441423c01a4f4fcd6968a81e57bc1781441762a85";
const QUALIFICATION_CASE_CATALOG_SHA256 = "b4df0e08b047c3f161dcee56cd13cd6694b550c7786cc49ff514e1e4a83bbf1e";

const BASE_IMAGES = Object.freeze({
  node: "node@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df",
  python: "python@sha256:0bee7276f83efd4a1ee05bbbf4281d95ed28e079220a9457f25a93e3f1e3c31b",
});
const DEPENDENCY_LOCKS = Object.freeze({
  pnpm_lock_sha256: "d1ae2cc697db86d42dadda4653f82ae64131f7010b440e130d5b4fb6d30cc08d",
  uv_lock_sha256: "588a9165560eba4a70bfad798b4f67418c09498dc77b64e8c5ec7b4e150c7413",
  managed_requirements_sha256: "0d72c8c450c62fdb405db96cfa5dbffb3a60eedacb24dc37c028267696d258af",
  pnpm_version: "9.14.4",
  python_version: "3.11.16",
});
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

export class Rc7ContainmentError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "Rc7ContainmentError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new Rc7ContainmentError(code, message, details);
}

function normalizedPath(value) {
  return path.resolve(value).replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase();
}

function isWithin(parent, child) {
  const parentValue = normalizedPath(parent);
  const childValue = normalizedPath(child);
  return childValue === parentValue || childValue.startsWith(`${parentValue}\\`);
}

function credentialLike(target) {
  return target.split(/[\\/]+/u).some((segment) => /^(?:\.aws|\.azure|\.docker|\.gnupg|\.kube|\.npmrc|\.pypirc|\.ssh|credential(?:s)?|keychain|secrets?|vault)$/iu.test(segment));
}

function sameFileIdentity(left, right) {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino)
    && String(left.size) === String(right.size) && String(left.mtimeNs) === String(right.mtimeNs);
}

async function readBoundedNativeFile(target, maximumBytes, label) {
  const before = await lstat(target, { bigint: true }).catch((error) => {
    if (error?.code === "ENOENT") fail("MISSING_ARTIFACT", `${label} is missing`);
    throw error;
  });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maximumBytes)) fail(before.size > BigInt(maximumBytes) ? "OVERSIZED_ARTIFACT" : "ALIASED_ARTIFACT", `${label} must be one bounded native regular file`);
  if (normalizedPath(await realpath(target)) !== normalizedPath(path.resolve(target))) fail("ALIASED_ARTIFACT", `${label} resolves through an alias`);
  const handle = await open(target, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, opened)) fail("REPLACED_ARTIFACT", `${label} changed before open`);
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const final = await lstat(target, { bigint: true });
    if (!sameFileIdentity(opened, after) || !sameFileIdentity(after, final) || final.isSymbolicLink() || !final.isFile() || final.nlink !== 1n || bytes.byteLength !== Number(final.size)) fail("REPLACED_ARTIFACT", `${label} changed while being read`);
    return bytes;
  } finally {
    await handle.close();
  }
}

async function assertNativeDirectory(target, label) {
  if (typeof target !== "string" || target.trim() !== target || target.length === 0) fail("INVALID_PATH", `${label} must be an explicit path`);
  const lexical = path.resolve(target);
  let info;
  try { info = await lstat(lexical); } catch (error) {
    if (error?.code === "ENOENT") fail("MISSING_PATH", `${label} is missing`);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail("ALIASED_PATH", `${label} must be one native directory`);
  const resolved = await realpath(lexical);
  if (normalizedPath(resolved) !== normalizedPath(lexical)) fail("ALIASED_PATH", `${label} resolves through an alias`);
  return lexical;
}

export async function assertRc7ContainmentRoot(target, options = {}) {
  const root = await assertNativeDirectory(target, "containment output root");
  const parsed = path.parse(root);
  if (normalizedPath(root) === normalizedPath(parsed.root) || path.dirname(root) === root) fail("BROAD_PATH", "Containment output root is too broad");
  if (isWithin(REPOSITORY_ROOT, root) || isWithin(root, REPOSITORY_ROOT)) fail("REPOSITORY_PATH", "Containment output root must be outside the repository");
  if (isWithin(homedir(), root) || isWithin(root, homedir())) fail("USER_LAYER_PATH", "Containment output root must not overlap the user layer");
  if (credentialLike(root)) fail("CREDENTIAL_LIKE_PATH", "Containment output root resembles a credential location");
  if (options.requireEmpty && (await readdir(root)).length !== 0) fail("NONEMPTY_OUTPUT_ROOT", "Containment output root must be empty");
  return root;
}

async function assertEmptyDockerConfig(target, outputRoot) {
  const root = await assertNativeDirectory(target, "Docker configuration root");
  if (isWithin(root, outputRoot) || isWithin(outputRoot, root)) fail("OVERLAPPING_PATH", "Docker configuration and output roots must not overlap");
  if (isWithin(REPOSITORY_ROOT, root) || isWithin(root, REPOSITORY_ROOT)) fail("REPOSITORY_PATH", "Controlled Docker configuration must be outside the repository");
  if (isWithin(homedir(), root) || isWithin(root, homedir())) fail("USER_LAYER_PATH", "The real user Docker configuration is forbidden");
  if (credentialLike(root)) fail("CREDENTIAL_LIKE_PATH", "Controlled Docker configuration resembles a credential location");
  const entries = (await readdir(root)).sort();
  if (canonicalJsonV1(entries) !== canonicalJsonV1(["config.json"])) fail("DOCKER_CONFIG_NOT_EMPTY", "Docker configuration root must contain only config.json");
  let value;
  try { value = JSON.parse((await readBoundedNativeFile(path.join(root, "config.json"), 4096, "controlled Docker config")).toString("utf8")); } catch (error) {
    if (error instanceof Rc7ContainmentError) throw error;
    fail("MALFORMED_DOCKER_CONFIG", "Controlled Docker config is malformed");
  }
  if (canonicalJsonV1(value) !== canonicalJsonV1({ auths: {} })) fail("DOCKER_CONFIG_AUTHORITY", "Controlled Docker config must contain exactly an empty auths object");
  return root;
}

async function assertDockerExecutable(target) {
  if (typeof target !== "string" || !path.isAbsolute(target) || normalizedPath(target) !== normalizedPath(DOCKER_EXECUTABLE)) fail("INVALID_DOCKER_EXECUTABLE", "Gate B accepts only the exact pinned Docker Desktop client path");
  const bytes = await readBoundedNativeFile(DOCKER_EXECUTABLE, 64 * 1024 * 1024, "pinned Docker Desktop client");
  if (sha256V1(bytes) !== DOCKER_EXECUTABLE_SHA256) fail("INVALID_DOCKER_EXECUTABLE", "Pinned Docker Desktop client digest mismatched");
  return DOCKER_EXECUTABLE;
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("MALFORMED_ARTIFACT", `${label} must be an object`);
  if (canonicalJsonV1(Object.keys(value).sort()) !== canonicalJsonV1([...keys].sort())) fail("MALFORMED_ARTIFACT", `${label} keys mismatched`);
}

function packageProjection(value) {
  const copy = structuredClone(value);
  delete copy.package_sha256;
  return copy;
}

function packageBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

async function fixtureIdentity(name) {
  const bytes = await readFile(path.join(FIXTURE_ROOT, name));
  return { path: `tests/recursus/fixtures/rc7-rlm-containment/${name}`, bytes: bytes.byteLength, sha256: sha256V1(bytes) };
}

async function buildCodeClosure() {
  const files = [];
  for (const relative of CODE_FILES) {
    const bytes = await readFile(path.join(REPOSITORY_ROOT, ...relative.split("/")));
    files.push({ path: relative, byte_count: bytes.byteLength, sha256: sha256V1(bytes) });
  }
  return {
    base_commit: "7db74cfc59537c8a9b08d3ea7e0dd38079b15cb5",
    files,
    files_sha256: sha256V1(canonicalJsonV1(files)),
  };
}

function buildConformanceRunManifest({ codeClosureSha256, imageId, sourcePackSha256 }) {
  const seam = buildRc7GateBRouteSeamContract();
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
    route_identity: "rc7-rc-rlm-contained-provider-free-prepared-v1",
    execution_class: "provider-free-containment-conformance-not-gate-c-case-attempt",
    component_revision: RC7_RLM_COMPONENT_COMMIT,
    provider_and_model: seam.shared_conditions,
    prompt_and_output_contracts: {
      prompt: seam.shared_conditions.semantic_prompt_block_identities,
      output: seam.shared_conditions.output_contract_identity,
    },
    shared_permission_identity: seam.shared_permission_identity,
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

function routeContract() {
  return {
    default_route: "rc-direct",
    direct_identity: "rc7-rc-direct-provider-free-prepared-v1",
    generic_case_route: "rc-direct",
    eligible_treatment_route: "rc-rlm",
    rlm_identity: "rc7-rc-rlm-contained-provider-free-prepared-v1",
    rlm_is_opt_in: true,
    automatic_routing_claimed: false,
    shared_conditions_frozen_for_gate_c: false,
    gate_c_execution_authorized: false,
  };
}

function boundaryContract(imageId, fixtureIdentities) {
  return {
    implementation: "docker-desktop-linux-container-plus-phase-two-kernel-seccomp",
    image_id: imageId,
    host_controller: { docker_executable: DOCKER_EXECUTABLE, sha256: DOCKER_EXECUTABLE_SHA256 },
    base_images: BASE_IMAGES,
    fixture_identities: fixtureIdentities,
    capability_policy_default: "deny-unlisted-high-level-capability",
    syscall_filter_model: "frozen-default-errno-allowlist-plus-phase-two-tsync-denials",
    syscall_default_deny: true,
    direct_python_is_operating_system_authority: true,
    outer_controls: {
      network: "none",
      root_filesystem: "read-only",
      user: "65532:65532",
      capabilities: "drop-all",
      no_new_privileges: true,
      ipc: "none",
      pid: "private-default",
      cgroup_namespace: "private",
      devices: "none",
      ports: "none",
      input_mount: "one-read-only-synthetic-bind",
      output_mount: "one-noexec-nosuid-nodev-bounded-tmpfs",
      docker_socket: "absent",
      host_user_layer_mounts: "absent",
    },
    phase_two_denials: [
      "new-process", "exec", "new-socket", "mount", "namespace", "ptrace", "device",
      "bpf", "keyring", "privilege-escalation",
    ],
    resource_limits: RESOURCE_LIMITS,
    environment_names: CONTAINER_ENV_NAMES,
    allowed_engine_structural_diff: ALLOWED_DOCKER_DIFF,
  };
}

function normalizeProbeResults(raw) {
  const worker = Object.fromEntries(Object.entries(raw).map(([mode, evidence]) => [mode, evidence.worker_result]));
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
}

function allProbePredicatesPass(probes) {
  return probes.broker.child_requests === 0
    && probes.broker.host_requests === 0
    && probes.broker.provider_reachable === false
    && probes.conformance.compute_result === "42"
    && probes.conformance.connection_removed
    && probes.conformance.hmac_present
    && probes.conformance.input_readonly
    && probes.conformance.loopback_only
    && probes.conformance.negative_authority_probes_passed
    && probes.conformance.phase_two_seccomp_tsync === "SECCOMP_FILTER_FLAG_TSYNC"
    && probes.conformance.phase_two_clone3_action === "ENOSYS-for-safe-clone-thread-fallback"
    && probes.conformance.phase_two_all_threads_filtered
    && probes.conformance.phase_two_no_new_privileges
    && probes.conformance.phase_two_capabilities_zero
    && probes.conformance.phase_two_filter_counts_increased
    && probes.conformance.phase_two_new_thread_inherited
    && probes.conformance.python_output_crud
    && probes.conformance.root_escape_denied
    && probes.conformance.symlink_escape_denied
    && Object.values(probes.resources).every(Boolean);
}

export async function buildRc7ContainmentPackage(observations) {
  exactKeys(observations, ["docker", "image_id", "probes", "runtime_accounting", "code_closure", "conformance_run_manifest"], "Gate B observations");
  if (!IMAGE_PATTERN.test(observations.image_id)) fail("IMAGE_IDENTITY_MISMATCH", "Gate B requires an exact Docker image ID");
  const fixtureIdentities = await Promise.all(["Dockerfile", OUTER_SECCOMP_NAME, "outer-seccomp-provenance.json", "source-pack.json", "gate-b-worker.mjs"].map(fixtureIdentity));
  const codeClosure = await buildCodeClosure();
  if (canonicalJsonV1(observations.code_closure) !== canonicalJsonV1(codeClosure)) fail("CODE_CLOSURE_MISMATCH", "Pre-dispatch code closure changed before package construction");
  const sourcePackIdentity = fixtureIdentities.find((item) => item.path.endsWith("/source-pack.json"));
  const expectedConformanceRun = buildConformanceRunManifest({ codeClosureSha256: codeClosure.files_sha256, imageId: observations.image_id, sourcePackSha256: sourcePackIdentity.sha256 });
  if (canonicalJsonV1(observations.conformance_run_manifest) !== canonicalJsonV1(expectedConformanceRun)) fail("RUN_IDENTITY_MISMATCH", "Pre-dispatch conformance run identity mismatched");
  const qualification = await buildRc7QualificationPackage();
  const routeArtifactSets = [];
  for (const caseId of qualification.cases.map((item) => item.case_id)) {
    const cells = ["LAB-01", "PAPER-01", "REPO-01"].includes(caseId) ? ["direct-control", "rlm-treatment"] : ["direct-control"];
    for (const cell of cells) {
      routeArtifactSets.push(buildRc7GateBRouteArtifactSet({ qualification, case_id: caseId, cell, repeat: 1, code_closure_sha256: codeClosure.files_sha256 }));
    }
  }
  const probes = normalizeProbeResults(observations.probes);
  const probeEvidenceModes = PROBE_MODES.map((mode) => ({ mode, ...observations.probes[mode] }));
  const probeEvidence = {
    schema_version: "rc7-gate-b-probe-evidence-v1",
    run_identity: expectedConformanceRun.run_identity,
    modes: probeEvidenceModes,
    evidence_sha256: sha256V1(canonicalJsonV1(probeEvidenceModes)),
  };
  const terminal = allProbePredicatesPass(probes) ? "CONTAINMENT_CONFORMANT" : "CONTAINMENT_BLOCKED";
  const value = {
    schema_version: RC7_CONTAINMENT_SCHEMA,
    policy_identity: RC7_CONTAINMENT_POLICY_ID,
    gate_a_qualification_sha256: RC7_GATE_A_QUALIFICATION_SHA256,
    gate_a_case_catalog_sha256: sha256V1(canonicalJsonV1(qualification.cases)),
    code_closure: codeClosure,
    conformance_run_manifest: expectedConformanceRun,
    route_contract: routeContract(),
    executable_route_seam: buildRc7GateBRouteSeamContract(),
    route_artifact_sets: routeArtifactSets,
    component: {
      source: "OpenCnid/deepseek-rlm",
      commit: RC7_RLM_COMPONENT_COMMIT,
      dependency_locks: DEPENDENCY_LOCKS,
      invocation: "internal-KernelManager-provider-free-conformance-only",
      public_provider_adapter_exposed: false,
      python_provisioning_at_runtime: false,
      max_depth: 0,
      accepted_recursus_profile_reproduced: false,
      accepted_archive_bytes_claimed: false,
    },
    boundary: boundaryContract(observations.image_id, fixtureIdentities),
    host_runtime: observations.docker,
    visible_input: {
      identity: fixtureIdentities.find((item) => item.path.endsWith("/source-pack.json")),
      synthetic_only: true,
      eligibility_bytes_present: false,
      evaluator_or_oracle_bytes_present: false,
    },
    direct_route_conformance: executeRc7GateBProviderFreeDirect(
      JSON.parse((await readFile(path.join(FIXTURE_ROOT, "source-pack.json"))).toString("utf8")),
      fixtureIdentities.find((item) => item.path.endsWith("/source-pack.json")).sha256,
    ),
    probe_evidence: probeEvidence,
    probes,
    recovery: {
      exclusive_lock: LOCK_NAME,
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
        checkpoints: [
          "RUN_INTENT", "PROBE_INTENT", "CONTAINER_CREATED", "DISPATCH_INTENT", "DISPATCH_OBSERVED",
          "RAW_RESULT", "RESULT_SEALED", "CLEANUP_INTENT", "CLEANUP_VERIFIED", "PUBLICATION_INTENT",
          "PUBLICATION_COMPLETE", "TERMINAL_COMPLETE",
        ],
      },
    },
    fault_contract: {
      count: RC7_REGISTERED_FAULTS.length,
      registered_faults: [...RC7_REGISTERED_FAULTS],
      result_claim: "none-in-package-focused-harness-must-inject-each-fault",
      provider_free_required: true,
      rejects: ["real-credentials", "provider-authority", "external-urls", "external-mutation"],
    },
    accounting: observations.runtime_accounting,
    retained_artifacts: [{
      path: PACKAGE_NAME,
      schema: RC7_CONTAINMENT_SCHEMA,
      maximum_bytes: MAX_PACKAGE_BYTES,
      producer: "lib/recursus/rc7-rlm-containment.mjs",
      provenance: "rc7-provider-free-gate-b-local-conformance",
      digest_field: "package_sha256",
      independent_validator: "lib/recursus/rc7-rlm-containment-validator.mjs",
    }],
    cleanup: { labelled_containers: 0, created_networks: 0, created_volumes: 0, host_root_residue_entries: 0 },
    terminal,
    non_claims: [
      "no-provider-or-model-behavior-tested",
      "no-accepted-recursus-profile-byte-reproduction",
      "no-gate-c-ablation-result",
      "no-production-sandbox-or-supported-route",
      "no-automatic-routing-evidence",
    ],
  };
  value.package_sha256 = sha256V1(canonicalJsonV1(packageProjection(value)));
  validateRc7ContainmentPackageIndependent(value, qualification);
  return value;
}

export async function validateRc7ContainmentPackage(value) {
  try {
    await validateRc7ContainmentPackageAgainstRepository(value, REPOSITORY_ROOT);
    return value;
  } catch (error) {
    if (error instanceof Rc7ContainmentValidationError) fail(error.code, error.message, error.details);
    throw error;
  }
}

function boundedJson(stdout, label) {
  const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch { /* continue */ }
  }
  fail("MALFORMED_RUNTIME_OUTPUT", `${label} did not emit bounded JSON`);
}

function dockerEnvironment(dockerConfig) {
  return {
    DOCKER_CLI_HINTS: "false",
    DOCKER_CONFIG: dockerConfig,
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    WINDIR: process.env.WINDIR ?? process.env.SystemRoot ?? "C:\\Windows",
  };
}

async function execute(executable, args, environment, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let byteCount = 0;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs ?? 45_000);
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]]) {
      stream.on("data", (chunk) => {
        byteCount += chunk.byteLength;
        if (byteCount > 1024 * 1024) child.kill();
        else chunks.push(chunk);
      });
    }
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      const result = { code, signal, timedOut, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
      if (!options.allowNonzero && (code !== 0 || timedOut || byteCount > 1024 * 1024)) reject(new Rc7ContainmentError("DOCKER_COMMAND_FAILED", "Docker command failed closed", { args, ...result }));
      else resolve(result);
    });
  });
}

async function dockerJson(context, args) {
  const result = await execute(context.executable, args, context.environment);
  try { return JSON.parse(result.stdout); } catch { fail("MALFORMED_DOCKER_OUTPUT", "Docker returned malformed JSON", { args }); }
}

function createArguments({ imageId, inputRoot, leaseIdentity, mode, name, seccompPath }) {
  const memory = mode === "memory" ? RESOURCE_LIMITS.memory_probe_bytes : RESOURCE_LIMITS.memory_bytes;
  const pids = mode === "pids" ? RESOURCE_LIMITS.pids_probe : RESOURCE_LIMITS.pids;
  return [
    "create", "--name", name,
    "--label", `rc7.policy=${RC7_CONTAINMENT_POLICY_ID}`,
    "--label", `rc7.lease=${leaseIdentity}`,
    "--label", `rc7.mode=${mode}`,
    "--pull=never", "--network=none", "--read-only", "--user", "65532:65532",
    "--cap-drop=ALL", "--security-opt", "no-new-privileges:true", "--security-opt", `seccomp=${seccompPath}`,
    "--ipc=none", "--cgroupns=private", "--pids-limit", String(pids), "--cpus", "1",
    "--memory", String(memory), "--memory-swap", String(memory),
    "--ulimit", `${`fsize=${RESOURCE_LIMITS.file_size_bytes}`}:${RESOURCE_LIMITS.file_size_bytes}`,
    "--ulimit", `${`nofile=${RESOURCE_LIMITS.nofile}`}:${RESOURCE_LIMITS.nofile}`,
    "--init", "--log-driver=none", "--runtime=runc", "--stop-timeout=1",
    "--mount", `type=bind,src=${inputRoot},dst=/rc7/input,readonly`,
    "--tmpfs", `/rc7/output:rw,noexec,nosuid,nodev,size=${RESOURCE_LIMITS.output_bytes},nr_inodes=${RESOURCE_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`,
    "--env", `RC7_GATE_B_POLICY=${RC7_CONTAINMENT_POLICY_ID}`, "--env", "TZ=UTC", "--env", "LANG=C.UTF-8",
    "--env", "LC_ALL=C.UTF-8", "--env", "HOME=/rc7/output/home", "--env", "TMPDIR=/rc7/output/tmp",
    imageId, mode,
  ];
}

function envNames(values) {
  return values.map((value) => value.slice(0, value.indexOf("="))).sort();
}

function validateInspect(item, expected) {
  if (item.Id !== expected.containerId || item.Image !== expected.imageId) fail("CONTAINER_IDENTITY_MISMATCH", "Container identity mismatched");
  const host = item.HostConfig;
  if (host.NetworkMode !== "none" || host.ReadonlyRootfs !== true || host.Privileged !== false || host.IpcMode !== "none" || !["", "private"].includes(host.PidMode) || host.CgroupnsMode !== "private") fail("CONTAINMENT_WEAKENED", "Namespace or rootfs boundary weakened");
  if (host.PidsLimit !== expected.pids || host.Memory !== expected.memory || host.MemorySwap !== expected.memory || host.NanoCpus !== RESOURCE_LIMITS.cpu_nanos) fail("RESOURCE_IDENTITY_MISMATCH", "Container resource identity mismatched");
  if ((host.CapAdd?.length ?? 0) !== 0 || canonicalJsonV1(host.CapDrop) !== canonicalJsonV1(["ALL"])
    || canonicalJsonV1([...host.SecurityOpt].sort()) !== canonicalJsonV1(["no-new-privileges:true", expected.seccompInspectValue])) fail("CONTAINMENT_WEAKENED", "Capability or exact outer seccomp identity weakened");
  if (item.Config.User !== "65532:65532" || item.Config.Labels["rc7.policy"] !== RC7_CONTAINMENT_POLICY_ID || item.Config.Labels["rc7.lease"] !== expected.leaseIdentity || item.Config.Labels["rc7.mode"] !== expected.mode) fail("CONTAINER_IDENTITY_MISMATCH", "Container user or label identity mismatched");
  if (canonicalJsonV1(envNames(item.Config.Env)) !== canonicalJsonV1(CONTAINER_ENV_NAMES)) fail("ENVIRONMENT_IDENTITY_MISMATCH", "Container environment names mismatched");
  if (item.Mounts.length !== 1 || item.Mounts[0].Destination !== "/rc7/input" || item.Mounts[0].RW !== false || normalizedPath(item.Mounts[0].Source) !== normalizedPath(expected.inputRoot)) fail("MOUNT_IDENTITY_MISMATCH", "Container input mount mismatched");
  const expectedTmpfs = `/rc7/output:rw,noexec,nosuid,nodev,size=${RESOURCE_LIMITS.output_bytes},nr_inodes=${RESOURCE_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`;
  const observedTmpfs = host.Tmpfs?.["/rc7/output"] ?? "";
  const tmpfsOptions = observedTmpfs.split(",").filter(Boolean).sort();
  const expectedTmpfsOptions = expectedTmpfs.slice(expectedTmpfs.indexOf(":") + 1).split(",").sort();
  if (canonicalJsonV1(tmpfsOptions) !== canonicalJsonV1(expectedTmpfsOptions)) fail("MOUNT_IDENTITY_MISMATCH", "Output tmpfs options mismatched");
  const ulimits = [...(host.Ulimits ?? [])].map((itemValue) => ({ Name: itemValue.Name, Soft: itemValue.Soft, Hard: itemValue.Hard })).sort((left, right) => left.Name.localeCompare(right.Name));
  if (canonicalJsonV1(ulimits) !== canonicalJsonV1([
    { Name: "fsize", Soft: RESOURCE_LIMITS.file_size_bytes, Hard: RESOURCE_LIMITS.file_size_bytes },
    { Name: "nofile", Soft: RESOURCE_LIMITS.nofile, Hard: RESOURCE_LIMITS.nofile },
  ])) fail("RESOURCE_IDENTITY_MISMATCH", "Container ulimit identity mismatched");
  if (host.Init !== true || host.LogConfig?.Type !== "none" || Object.keys(host.LogConfig?.Config ?? {}).length !== 0 || host.Runtime !== "runc" || item.Config.StopTimeout !== 1) fail("CONTAINMENT_WEAKENED", "Init, log, runtime, or stop-timeout identity mismatched", { init: host.Init, log_config: host.LogConfig, runtime: host.Runtime, stop_timeout: item.Config.StopTimeout });
  if (host.Binds?.length || host.Devices?.length || host.DeviceRequests?.length || host.Links?.length || host.VolumesFrom?.length
    || host.PortBindings && Object.keys(host.PortBindings).length || item.Config.ExposedPorts && Object.keys(item.Config.ExposedPorts).length
    || Object.keys(item.NetworkSettings.Ports ?? {}).length) fail("CONTAINMENT_WEAKENED", "Unexpected bind, device, link, volume, or port authority present");
  return {
    image_id: item.Image,
    mode: expected.mode,
    user: item.Config.User,
    command: item.Config.Cmd,
    environment_names: envNames(item.Config.Env),
    labels: { policy: item.Config.Labels["rc7.policy"], lease: item.Config.Labels["rc7.lease"], mode: item.Config.Labels["rc7.mode"] },
    namespace_and_authority: {
      network: host.NetworkMode, ipc: host.IpcMode, pid: host.PidMode, cgroup: host.CgroupnsMode,
      readonly_rootfs: host.ReadonlyRootfs, privileged: host.Privileged, cap_add: host.CapAdd ?? [], cap_drop: host.CapDrop,
      security_opt: [...host.SecurityOpt].sort(), devices: host.Devices ?? [], device_requests: host.DeviceRequests ?? [],
      ports: host.PortBindings ?? {}, exposed_ports: item.Config.ExposedPorts ?? {},
    },
    resources: { pids: host.PidsLimit, memory: host.Memory, memory_swap: host.MemorySwap, cpu_nanos: host.NanoCpus, ulimits },
    mounts: { input: { destination: item.Mounts[0].Destination, read_only: item.Mounts[0].RW === false }, output_tmpfs_options: tmpfsOptions },
    process: { init: host.Init, log_driver: host.LogConfig.Type, runtime: host.Runtime, stop_timeout: item.Config.StopTimeout },
  };
}

async function inspectContainer(context, containerId) {
  const values = await dockerJson(context, ["inspect", containerId]);
  if (!Array.isArray(values) || values.length !== 1) fail("CONTAINER_IDENTITY_MISMATCH", "Expected one exact container inspection");
  return values[0];
}

async function labelledContainers(context, leaseIdentity = undefined) {
  const args = ["ps", "-aq", "--filter", `label=rc7.policy=${RC7_CONTAINMENT_POLICY_ID}`];
  if (leaseIdentity) args.push("--filter", `label=rc7.lease=${leaseIdentity}`);
  const result = await execute(context.executable, args, context.environment);
  return result.stdout.trim().split(/\r?\n/u).filter(Boolean);
}

async function runProbe(context, configuration) {
  const name = `rc7-gb-${configuration.leaseIdentity.slice(0, 16)}-${configuration.mode}`;
  let containerId;
  let containerConfiguration;
  try {
    await appendJournal(configuration.journal, "PROBE_INTENT", { mode: configuration.mode });
    const create = await execute(context.executable, createArguments({ ...configuration, name }), context.environment);
    containerId = create.stdout.trim();
    if (!/^[0-9a-f]{64}$/u.test(containerId)) fail("CONTAINER_IDENTITY_MISMATCH", "Docker create returned an invalid container ID");
    await appendJournal(configuration.journal, "CONTAINER_CREATED", { mode: configuration.mode, container_id: containerId });
    const expected = {
      containerId,
      imageId: configuration.imageId,
      inputRoot: configuration.inputRoot,
      memory: configuration.mode === "memory" ? RESOURCE_LIMITS.memory_probe_bytes : RESOURCE_LIMITS.memory_bytes,
      mode: configuration.mode,
      pids: configuration.mode === "pids" ? RESOURCE_LIMITS.pids_probe : RESOURCE_LIMITS.pids,
      seccompInspectValue: configuration.seccompInspectValue,
    };
    expected.leaseIdentity = configuration.leaseIdentity;
    containerConfiguration = validateInspect(await inspectContainer(context, containerId), expected);
    await appendJournal(configuration.journal, "DISPATCH_INTENT", { mode: configuration.mode, container_id: containerId });
    if (configuration.mode === "conformance") maybeInterrupt("before-dispatch", configuration.interruptAt);
    let result;
    if (configuration.mode === "memory") {
      await execute(context.executable, ["start", containerId], context.environment);
      await appendJournal(configuration.journal, "DISPATCH_OBSERVED", { mode: configuration.mode, container_id: containerId });
      const waited = await execute(context.executable, ["wait", containerId], context.environment, { allowNonzero: true, timeoutMs: 20_000 });
      const inspected = await inspectContainer(context, containerId);
      result = { schema_version: "rc7-gate-b-worker-result-v1", mode: configuration.mode, memory_ceiling_bytes: expected.memory, passed: !waited.timedOut && inspected.State.OOMKilled === true && inspected.State.ExitCode !== 0 };
    } else if (configuration.mode === "cpu") {
      await execute(context.executable, ["start", containerId], context.environment);
      await appendJournal(configuration.journal, "DISPATCH_OBSERVED", { mode: configuration.mode, container_id: containerId });
      await new Promise((resolve) => setTimeout(resolve, RESOURCE_LIMITS.cpu_wall_timeout_ms));
      const beforeKill = await inspectContainer(context, containerId);
      await execute(context.executable, ["kill", containerId], context.environment, { allowNonzero: true });
      const afterKill = await inspectContainer(context, containerId);
      result = { schema_version: "rc7-gate-b-worker-result-v1", mode: configuration.mode, wall_timeout_ms: RESOURCE_LIMITS.cpu_wall_timeout_ms, passed: beforeKill.State.Running === true && afterKill.State.Running === false && afterKill.State.OOMKilled === false };
    } else {
      const started = await execute(context.executable, ["start", "--attach", containerId], context.environment, { allowNonzero: true, timeoutMs: 50_000 });
      await appendJournal(configuration.journal, "DISPATCH_OBSERVED", { mode: configuration.mode, container_id: containerId });
      if (configuration.mode === "conformance") maybeInterrupt("after-dispatch-without-sealed-result", configuration.interruptAt);
      const inspected = await inspectContainer(context, containerId);
      if (started.code !== 0 || started.timedOut || inspected.State.ExitCode !== 0 || inspected.State.OOMKilled) fail("PROBE_EXECUTION_FAILED", `${configuration.mode} probe failed`, { started, state: inspected.State });
      result = boundedJson(started.stdout, configuration.mode);
      if (result.schema_version !== "rc7-gate-b-worker-result-v1" || result.mode !== configuration.mode) fail("PROBE_IDENTITY_MISMATCH", `${configuration.mode} result identity mismatched`);
      if (configuration.mode === "conformance") {
        if (result.runtime.worker_sha256 !== configuration.workerSha256 || result.input.source_pack_sha256 !== configuration.sourcePackSha256 || result.execution.host_request_count !== 0) fail("PROBE_IDENTITY_MISMATCH", "Conformance worker, source, or broker identity mismatched");
      }
    }
    const resultSha256 = sha256V1(canonicalJsonV1(result));
    await appendJournal(configuration.journal, "RAW_RESULT", { mode: configuration.mode, container_id: containerId, result_sha256: resultSha256 });
    await appendJournal(configuration.journal, "RESULT_SEALED", { mode: configuration.mode, container_id: containerId, result_sha256: resultSha256 });
    if (configuration.mode === "conformance") maybeInterrupt("after-result-sealing", configuration.interruptAt);
    const diffResult = await execute(context.executable, ["diff", containerId], context.environment);
    const diff = diffResult.stdout.trim().split(/\r?\n/u).filter(Boolean).sort();
    const unexpectedDiff = diff.filter((entry) => !ALLOWED_DOCKER_DIFF.includes(entry));
    if (unexpectedDiff.length) fail("ROOTFS_RESIDUE", "Container rootfs has unexpected residue", { unexpectedDiff });
    return {
      container_configuration: containerConfiguration,
      worker_result: result,
      docker_diff: diff,
      producer: "scripts/recursus/rc7-rlm-containment.mjs+gate-b-worker.mjs",
      provenance: "provider-free-local-docker-inspect-worker-stdout-and-diff",
    };
  } finally {
    if (containerId && /^[0-9a-f]{64}$/u.test(containerId)) {
      await appendJournal(configuration.journal, "CLEANUP_INTENT", { mode: configuration.mode, container_id: containerId });
      await execute(context.executable, ["rm", "--force", containerId], context.environment, { allowNonzero: true });
      const remaining = await labelledContainers(context, configuration.leaseIdentity);
      if (remaining.includes(containerId)) fail("CLEANUP_RESIDUE", "Exact Gate B container remained after cleanup");
      await appendJournal(configuration.journal, "CLEANUP_VERIFIED", { mode: configuration.mode, container_id: containerId });
    }
  }
}

function dockerProjection(version, info, image) {
  const components = Object.fromEntries((version.Server?.Components ?? []).map((item) => [item.Name, item]));
  return {
    backend: "Docker Desktop WSL2",
    desktop_version: "4.69.0",
    client_version: version.Client?.Version ?? null,
    engine_version: version.Server?.Version ?? null,
    api_version: version.Server?.ApiVersion ?? null,
    os: version.Server?.Os ?? null,
    architecture: version.Server?.Arch ?? null,
    kernel: info.KernelVersion ?? null,
    cgroup_version: info.CgroupVersion ?? null,
    operating_system: info.OperatingSystem ?? null,
    server_name: info.Name ?? null,
    runtime: info.DefaultRuntime ?? null,
    containerd_version: components.containerd?.Version ?? null,
    runc_version: components.runc?.Version ?? null,
    runc_git_commit: components.runc?.Details?.GitCommit ?? null,
    docker_init_version: components["docker-init"]?.Version ?? null,
    image_id: image.Id,
  };
}

async function acquireLock(root) {
  const target = path.join(root, LOCK_NAME);
  try {
    const handle = await open(target, "wx+");
    const bytes = Buffer.from(`${canonicalJsonV1({ policy: RC7_CONTAINMENT_POLICY_ID, owner: randomUUID() })}\n`);
    await handle.writeFile(bytes);
    await handle.sync();
    const identity = await handle.stat({ bigint: true });
    return { handle, target, bytes, identity };
  } catch (error) {
    if (error?.code === "EEXIST") fail("RECOVERY_LOCKED", "Gate B root is already locked");
    throw error;
  }
}

async function releaseLock(lock) {
  if (!lock) return;
  const opened = await lock.handle.stat({ bigint: true });
  const currentPath = await lstat(lock.target, { bigint: true });
  if (!sameFileIdentity(lock.identity, opened) || !sameFileIdentity(opened, currentPath) || currentPath.isSymbolicLink() || !currentPath.isFile() || currentPath.nlink !== 1n) { await lock.handle.close(); fail("LOCK_IDENTITY_MISMATCH", "Gate B lock was replaced"); }
  const current = Buffer.alloc(lock.bytes.byteLength);
  const { bytesRead } = await lock.handle.read(current, 0, current.byteLength, 0);
  if (bytesRead !== current.byteLength || !current.equals(lock.bytes)) { await lock.handle.close(); fail("LOCK_IDENTITY_MISMATCH", "Gate B lock ownership bytes were replaced"); }
  await lock.handle.close();
  if (!sameFileIdentity(lock.identity, await lstat(lock.target, { bigint: true }))) fail("LOCK_IDENTITY_MISMATCH", "Gate B lock changed before release");
  await rm(lock.target);
}

function maybeInterrupt(point, requestedPoint) {
  if (requestedPoint === point) fail("INJECTED_INTERRUPTION", `Provider-free Gate B interruption at ${point}`, { checkpoint: point });
}

async function createJournal(root, leaseIdentity, imageId, runIdentity) {
  const target = path.join(root, JOURNAL_NAME);
  const handle = await open(target, "ax+");
  if (!HASH_PATTERN.test(runIdentity)) fail("RUN_IDENTITY_MISMATCH", "Journal requires one immutable conformance run identity");
  const journal = { handle, target, sequence: 0, previousSha256: "0".repeat(64), leaseIdentity, imageId, runIdentity };
  await appendJournal(journal, "RUN_INTENT");
  return journal;
}

async function appendJournal(journal, event, details = {}) {
  exactKeys(details, ["mode", "container_id", "result_sha256"].filter((key) => Object.hasOwn(details, key)), "journal details");
  const projection = {
    schema_version: "rc7-gate-b-journal-entry-v1",
    sequence: journal.sequence + 1,
    event,
    mode: details.mode ?? null,
    container_id: details.container_id ?? null,
    result_sha256: details.result_sha256 ?? null,
    lease_identity: journal.leaseIdentity,
    image_id: journal.imageId,
    run_identity: journal.runIdentity,
    previous_sha256: journal.previousSha256,
  };
  const entry = { ...projection, entry_sha256: sha256V1(canonicalJsonV1(projection)) };
  await journal.handle.appendFile(canonicalJsonV1(entry), "utf8");
  await journal.handle.sync();
  journal.sequence = entry.sequence;
  journal.previousSha256 = entry.entry_sha256;
  return entry;
}

async function closeJournal(journal) {
  if (journal?.handle) {
    await journal.handle.close();
    journal.handle = null;
  }
}

async function readJournal(root) {
  const target = path.join(root, JOURNAL_NAME);
  const rawBytes = await readBoundedNativeFile(target, 262_144, "Gate B journal");
  const raw = rawBytes.toString("utf8");
  if (!raw.endsWith("\n")) fail("MALFORMED_JOURNAL", "Gate B journal is not newline terminated");
  const entries = raw.trimEnd().split(/\r?\n/u).map((line) => {
    try { return JSON.parse(line); } catch { fail("MALFORMED_JOURNAL", "Gate B journal contains malformed JSON"); }
  });
  let previousSha256 = "0".repeat(64);
  let firstLeaseIdentity;
  let firstImageId;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    exactKeys(entry, ["schema_version", "sequence", "event", "mode", "container_id", "result_sha256", "lease_identity", "image_id", "run_identity", "previous_sha256", "entry_sha256"], "journal entry");
    const projection = structuredClone(entry);
    delete projection.entry_sha256;
    if (entry.schema_version !== "rc7-gate-b-journal-entry-v1" || entry.sequence !== index + 1 || entry.previous_sha256 !== previousSha256
      || entry.entry_sha256 !== sha256V1(canonicalJsonV1(projection)) || !HASH_PATTERN.test(entry.lease_identity) || !IMAGE_PATTERN.test(entry.image_id)
      || !HASH_PATTERN.test(entry.run_identity) || index > 0 && entry.run_identity !== entries[0].run_identity) fail("MALFORMED_JOURNAL", "Gate B journal hash chain or identity mismatched");
    if (index === 0) {
      firstLeaseIdentity = entry.lease_identity;
      firstImageId = entry.image_id;
      if (firstLeaseIdentity !== sha256V1(canonicalJsonV1({ policy: RC7_CONTAINMENT_POLICY_ID, image_id: firstImageId }))) fail("MALFORMED_JOURNAL", "Gate B journal lease is not derived from the exact policy and image");
    } else if (entry.lease_identity !== firstLeaseIdentity || entry.image_id !== firstImageId) {
      fail("MALFORMED_JOURNAL", "Gate B journal lease or image changed within one run");
    }
    previousSha256 = entry.entry_sha256;
  }
  if (entries[0]?.event !== "RUN_INTENT") fail("MALFORMED_JOURNAL", "Gate B journal is missing RUN_INTENT");
  const allowedEvents = new Set([
    "RUN_INTENT", "PROBE_INTENT", "CONTAINER_CREATED", "DISPATCH_INTENT", "DISPATCH_OBSERVED", "RAW_RESULT",
    "RESULT_SEALED", "CLEANUP_INTENT", "CLEANUP_VERIFIED", "PUBLICATION_INTENT", "PUBLICATION_COMPLETE", "TERMINAL_COMPLETE",
  ]);
  const states = new Map();
  let publicationState = "none";
  for (const entry of entries) {
    if (!allowedEvents.has(entry.event)) fail("MALFORMED_JOURNAL", "Gate B journal contains an unknown event");
    if (["RUN_INTENT", "PUBLICATION_INTENT", "PUBLICATION_COMPLETE", "TERMINAL_COMPLETE"].includes(entry.event)) {
      if (entry.mode !== null || entry.container_id !== null) fail("MALFORMED_JOURNAL", "Run/publication journal event carried probe identity");
      if (entry.event === "RUN_INTENT" && entry.sequence !== 1) fail("MALFORMED_JOURNAL", "RUN_INTENT was not first");
      if (entry.event === "PUBLICATION_INTENT") publicationState = publicationState === "none" ? "intent" : "invalid";
      if (entry.event === "PUBLICATION_COMPLETE") publicationState = publicationState === "intent" ? "complete" : "invalid";
      if (entry.event === "TERMINAL_COMPLETE") publicationState = publicationState === "complete" ? "terminal" : "invalid";
      if (publicationState === "invalid") fail("MALFORMED_JOURNAL", "Gate B publication journal order mismatched");
      continue;
    }
    if (!PROBE_MODES.includes(entry.mode)) fail("MALFORMED_JOURNAL", "Gate B journal probe mode mismatched");
    const state = states.get(entry.mode) ?? { phase: "none", containerId: null, resultSha256: null };
    if (entry.event === "PROBE_INTENT" && state.phase === "none" && entry.container_id === null) state.phase = "intent";
    else if (entry.event === "CONTAINER_CREATED" && state.phase === "intent" && /^[0-9a-f]{64}$/u.test(entry.container_id)) { state.phase = "created"; state.containerId = entry.container_id; }
    else if (entry.event === "DISPATCH_INTENT" && state.phase === "created" && entry.container_id === state.containerId) state.phase = "dispatch-intent";
    else if (entry.event === "DISPATCH_OBSERVED" && state.phase === "dispatch-intent" && entry.container_id === state.containerId) state.phase = "dispatch-observed";
    else if (entry.event === "RAW_RESULT" && state.phase === "dispatch-observed" && entry.container_id === state.containerId && HASH_PATTERN.test(entry.result_sha256)) { state.phase = "raw-result"; state.resultSha256 = entry.result_sha256; }
    else if (entry.event === "RESULT_SEALED" && state.phase === "raw-result" && entry.container_id === state.containerId && entry.result_sha256 === state.resultSha256) state.phase = "result-sealed";
    else if (entry.event === "CLEANUP_INTENT" && ["created", "dispatch-intent", "dispatch-observed", "raw-result", "result-sealed"].includes(state.phase) && entry.container_id === state.containerId) state.phase = "cleanup-intent";
    else if (entry.event === "CLEANUP_VERIFIED" && state.phase === "cleanup-intent" && entry.container_id === state.containerId) state.phase = "cleanup-verified";
    else fail("MALFORMED_JOURNAL", `Gate B journal transition mismatched for ${entry.mode}:${entry.event}`);
    states.set(entry.mode, state);
  }
  if (publicationState !== "none" && PROBE_MODES.some((mode) => states.get(mode)?.phase !== "cleanup-verified")) fail("MALFORMED_JOURNAL", "Publication began before every probe cleanup was verified");
  return entries;
}

async function publish(root, value, journal, interruptAt) {
  const bytes = packageBytes(value);
  const state = { schema_version: "rc7-boundary-state-v1", package_sha256: value.package_sha256, terminal: value.terminal };
  await appendJournal(journal, "PUBLICATION_INTENT", { result_sha256: value.package_sha256 });
  await writeFile(path.join(root, STATE_NAME), `${canonicalJsonV1(state)}\n`, { flag: "wx" });
  maybeInterrupt("after-state-write", interruptAt);
  await writeFile(path.join(root, STAGE_NAME), bytes, { flag: "wx" });
  maybeInterrupt("after-stage-write", interruptAt);
  maybeInterrupt("during-publication", interruptAt);
  await rename(path.join(root, STAGE_NAME), path.join(root, PACKAGE_NAME));
  maybeInterrupt("after-publication", interruptAt);
  await rm(path.join(root, STATE_NAME));
  await appendJournal(journal, "PUBLICATION_COMPLETE", { result_sha256: value.package_sha256 });
  await appendJournal(journal, "TERMINAL_COMPLETE", { result_sha256: value.package_sha256 });
  await closeJournal(journal);
  await rm(path.join(root, JOURNAL_NAME));
  return bytes;
}

export async function prepareRc7Containment(root, options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("MALFORMED_ARTIFACT", "Gate B runtime options must be an object");
  const optionKeys = Object.keys(options);
  if (!["dockerConfig", "dockerExecutable", "imageId", "interruptAt"].every((key) => optionKeys.includes(key) || key === "interruptAt")
    || optionKeys.some((key) => !["dockerConfig", "dockerExecutable", "imageId", "interruptAt"].includes(key))) fail("UNEXPECTED_API_OPTION", "Gate B runtime options do not match the closed provider-free interface");
  if (options.interruptAt !== undefined && !RC7_CONTAINMENT_INTERRUPTION_POINTS.includes(options.interruptAt)) fail("UNREGISTERED_FAULT", "Only registered provider-free interruption points are accepted");
  if (!IMAGE_PATTERN.test(options.imageId)) fail("IMAGE_IDENTITY_MISMATCH", "An exact Docker image ID is required");
  const safeRoot = await assertRc7ContainmentRoot(root, { requireEmpty: true });
  const dockerConfig = await assertEmptyDockerConfig(options.dockerConfig, safeRoot);
    const executable = await assertDockerExecutable(options.dockerExecutable);
    const lock = await acquireLock(safeRoot);
    const inputRoot = path.join(safeRoot, ".input");
    const leaseIdentity = sha256V1(canonicalJsonV1({ policy: RC7_CONTAINMENT_POLICY_ID, image_id: options.imageId }));
    let journal;
    try {
    const sourcePackBytes = await readFile(path.join(FIXTURE_ROOT, "source-pack.json"));
    const workerBytes = await readFile(path.join(FIXTURE_ROOT, "gate-b-worker.mjs"));
    const seccompBytes = await readFile(path.join(FIXTURE_ROOT, OUTER_SECCOMP_NAME));
    const sourcePackSha256 = sha256V1(sourcePackBytes);
    const workerSha256 = sha256V1(workerBytes);
    const codeClosure = await buildCodeClosure();
    const conformanceRunManifest = buildConformanceRunManifest({ codeClosureSha256: codeClosure.files_sha256, imageId: options.imageId, sourcePackSha256 });
    journal = await createJournal(safeRoot, leaseIdentity, options.imageId, conformanceRunManifest.run_identity);
    maybeInterrupt("after-lock", options.interruptAt);
    const context = { executable, environment: dockerEnvironment(dockerConfig) };
    if ((await labelledContainers(context)).length !== 0) fail("PREEXISTING_CONTAINER_RESIDUE", "Gate B labelled container residue exists");
    const version = await dockerJson(context, ["version", "--format", "{{json .}}"]);
    const info = await dockerJson(context, ["info", "--format", "{{json .}}"]);
    const images = await dockerJson(context, ["image", "inspect", options.imageId]);
    if (!Array.isArray(images) || images.length !== 1 || images[0].Id !== options.imageId) fail("IMAGE_IDENTITY_MISMATCH", "Exact Gate B image is unavailable");
    const imageLabels = images[0].Config?.Labels ?? {};
    if (imageLabels["rc7.policy"] !== RC7_CONTAINMENT_POLICY_ID
      || imageLabels["rc7.component.commit"] !== RC7_RLM_COMPONENT_COMMIT
      || imageLabels["rc7.component.pnpm-lock-sha256"] !== DEPENDENCY_LOCKS.pnpm_lock_sha256
      || imageLabels["rc7.component.uv-lock-sha256"] !== DEPENDENCY_LOCKS.uv_lock_sha256
      || imageLabels["rc7.component.managed-requirements-sha256"] !== DEPENDENCY_LOCKS.managed_requirements_sha256) fail("IMAGE_PROVENANCE_MISMATCH", "Gate B image provenance labels mismatched");
    await mkdir(inputRoot);
    let seccompInspectValue;
    try { seccompInspectValue = `seccomp=${JSON.stringify(JSON.parse(seccompBytes.toString("utf8")))}`; } catch { fail("SECCOMP_POLICY_MISMATCH", "Frozen outer seccomp fixture is malformed"); }
    await writeFile(path.join(inputRoot, "source-pack.json"), sourcePackBytes, { flag: "wx" });
    await writeFile(path.join(inputRoot, "contract.json"), `${canonicalJsonV1({ schema_version: "rc7-gate-b-runtime-contract-v1", policy: RC7_CONTAINMENT_POLICY_ID, source_pack_sha256: sourcePackSha256 })}\n`, { flag: "wx" });
    maybeInterrupt("after-fixture-validation", options.interruptAt);
    const configuration = { imageId: options.imageId, inputRoot, interruptAt: options.interruptAt, journal, leaseIdentity, seccompInspectValue, seccompPath: path.join(FIXTURE_ROOT, OUTER_SECCOMP_NAME), sourcePackSha256, workerSha256 };
    const probes = {};
    for (const mode of PROBE_MODES) probes[mode] = await runProbe(context, { ...configuration, mode });
    await rm(inputRoot, { recursive: true, force: true });
    if ((await labelledContainers(context)).length !== 0) fail("CLEANUP_RESIDUE", "Gate B container cleanup left labelled residue");
    const runtimeAccounting = {
      rlm_executions: 1,
      provider_calls: 0,
      simulated_provider_requests: 0,
      credential_accesses: 0,
      runtime_network_actions: 0,
      child_requests: 0,
      external_service_mutations: 0,
      wsl_cli_invocations: 0,
      docker_containers_created: PROBE_MODES.length,
      retained_artifacts: 1,
      terminal_decisions: 1,
      operator_steps: 0,
      cleanup_residue_entries: 0,
    };
    const value = await buildRc7ContainmentPackage({ docker: dockerProjection(version, info, images[0]), image_id: options.imageId, probes, runtime_accounting: runtimeAccounting, code_closure: codeClosure, conformance_run_manifest: conformanceRunManifest });
    const bytes = await publish(safeRoot, value, journal, options.interruptAt);
    return { root: safeRoot, package_path: path.join(safeRoot, PACKAGE_NAME), byte_count: bytes.byteLength, package_sha256: value.package_sha256, terminal: value.terminal, accounting: value.accounting };
  } finally {
    await rm(inputRoot, { recursive: true, force: true });
    await closeJournal(journal);
    await releaseLock(lock);
  }
}

async function readPackage(root, name = PACKAGE_NAME) {
  const target = path.join(root, name);
  const raw = await readBoundedNativeFile(target, MAX_PACKAGE_BYTES, `Gate B package ${name}`);
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { fail("MALFORMED_ARTIFACT", "Gate B package is malformed"); }
  await validateRc7ContainmentPackage(value);
  if (!raw.equals(packageBytes(value))) fail("MALFORMED_ARTIFACT", "Gate B package is not canonical JSON");
  return { value, raw };
}

async function readState(root) {
  const raw = await readBoundedNativeFile(path.join(root, STATE_NAME), 4096, "Gate B publication state");
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { fail("MALFORMED_STATE", "Gate B publication state is malformed"); }
  exactKeys(value, ["schema_version", "package_sha256", "terminal"], "Gate B publication state");
  if (value.schema_version !== "rc7-boundary-state-v1" || !HASH_PATTERN.test(value.package_sha256) || !RC7_CONTAINMENT_TERMINALS.includes(value.terminal)
    || !raw.equals(Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8"))) fail("MALFORMED_STATE", "Gate B publication state identity mismatched");
  return value;
}

function recoveryProjection(value) {
  const copy = structuredClone(value);
  delete copy.recovery_sha256;
  return copy;
}

function recoveryBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function validateRecovery(value) {
  exactKeys(value, ["schema_version", "policy_identity", "run_identity", "run_manifest", "lease_identity", "image_id", "terminal", "reason", "provider_reachable_dispatches", "side_effecting_cells_replayed", "containers_cleaned", "cleaned_container_identities", "cleanup_residue_entries", "artifact", "recovery_sha256"], "Gate B recovery terminal");
  const expectedLease = sha256V1(canonicalJsonV1({ policy: RC7_CONTAINMENT_POLICY_ID, image_id: value.image_id }));
  if (value.schema_version !== "rc7-gate-b-recovery-terminal-v1" || value.policy_identity !== RC7_CONTAINMENT_POLICY_ID
    || !HASH_PATTERN.test(value.run_identity) || value.lease_identity !== expectedLease || !IMAGE_PATTERN.test(value.image_id) || value.terminal !== "CONTAINMENT_BLOCKED"
    || value.reason !== "interrupted-unsealed-never-replayed" || value.provider_reachable_dispatches !== 0
    || value.side_effecting_cells_replayed !== 0 || !Number.isSafeInteger(value.containers_cleaned) || value.containers_cleaned < 0 || value.containers_cleaned > PROBE_MODES.length
    || !Array.isArray(value.cleaned_container_identities) || value.cleaned_container_identities.length !== value.containers_cleaned
    || new Set(value.cleaned_container_identities).size !== value.cleaned_container_identities.length || value.cleaned_container_identities.some((identity) => !HASH_PATTERN.test(identity))
    || value.cleanup_residue_entries !== 0 || value.recovery_sha256 !== sha256V1(canonicalJsonV1(recoveryProjection(value)))) fail("MALFORMED_ARTIFACT", "Gate B recovery terminal mismatched");
  const manifest = value.run_manifest;
  if (!manifest || value.run_identity !== manifest.run_identity
    || canonicalJsonV1(manifest) !== canonicalJsonV1(buildConformanceRunManifest({ codeClosureSha256: manifest.code_closure_sha256, imageId: value.image_id, sourcePackSha256: manifest.source_pack_identity }))) fail("RUN_IDENTITY_MISMATCH", "Gate B recovery run manifest mismatched");
  if (canonicalJsonV1(value.artifact) !== canonicalJsonV1({
    path: RECOVERY_NAME,
    schema: "rc7-gate-b-recovery-terminal-v1",
    maximum_bytes: 16_384,
    producer: "lib/recursus/rc7-rlm-containment.mjs",
    provenance: "rc7-provider-free-gate-b-interrupted-run-recovery",
    independent_validator: "lib/recursus/rc7-rlm-containment-validator.mjs:validateRc7RecoveryArtifactIndependent",
    digest_field: "recovery_sha256",
  })) fail("MALFORMED_ARTIFACT", "Gate B recovery artifact identity mismatched");
  return value;
}

async function readRecovery(root) {
  const raw = await readBoundedNativeFile(path.join(root, RECOVERY_NAME), 16_384, "Gate B recovery terminal");
  let value;
  try { value = JSON.parse(raw.toString("utf8")); } catch { fail("MALFORMED_ARTIFACT", "Gate B recovery terminal is malformed"); }
  validateRecovery(value);
  const codeClosure = await buildCodeClosure();
  const sourceIdentity = await fixtureIdentity("source-pack.json");
  try {
    validateRc7RecoveryArtifactIndependent(value, { code_closure_sha256: codeClosure.files_sha256, image_id: value.image_id, source_pack_sha256: sourceIdentity.sha256 });
  } catch (error) {
    if (error instanceof Rc7ContainmentValidationError) fail(error.code, error.message, error.details);
    throw error;
  }
  if (!raw.equals(recoveryBytes(value))) fail("MALFORMED_ARTIFACT", "Gate B recovery terminal is not canonical JSON");
  return { value, raw };
}

export async function inspectRc7Containment(root) {
  const safeRoot = await assertRc7ContainmentRoot(root);
  const entries = (await readdir(safeRoot)).sort();
  if (canonicalJsonV1(entries) === canonicalJsonV1([PACKAGE_NAME])) {
    const { value, raw } = await readPackage(safeRoot);
    return { status: "complete", entries, package_sha256: value.package_sha256, terminal: value.terminal, byte_count: raw.byteLength };
  }
  if (canonicalJsonV1(entries) === canonicalJsonV1([RECOVERY_NAME])) {
    const { value, raw } = await readRecovery(safeRoot);
    return { status: "blocked-recovered", entries, recovery_sha256: value.recovery_sha256, terminal: value.terminal, byte_count: raw.byteLength };
  }
  if (entries.includes(LOCK_NAME)) fail("RECOVERY_LOCKED", "Gate B root is locked; inspection will not infer liveness");
  const knownPartial = new Set([JOURNAL_NAME, STATE_NAME, STAGE_NAME]);
  if (entries.includes(JOURNAL_NAME) && entries.every((entry) => knownPartial.has(entry))) {
    const journal = await readJournal(safeRoot);
    if (entries.includes(STATE_NAME)) await readState(safeRoot);
    if (entries.includes(STAGE_NAME)) await readPackage(safeRoot, STAGE_NAME);
    return { status: "interrupted", entries, last_event: journal.at(-1).event, lease_identity: journal[0].lease_identity, image_id: journal[0].image_id };
  }
  fail("UNKNOWN_RESIDUE", "Gate B root does not match a closed complete, recovery, or interrupted inventory", { entries });
}

async function reconcileActiveContainers(controller, leaseIdentity, active) {
  exactKeys(controller, ["list", "remove"], "Gate B recovery controller");
  if (typeof controller.list !== "function" || typeof controller.remove !== "function") fail("MALFORMED_ARTIFACT", "Gate B recovery controller is malformed");
  const labelled = await controller.list(leaseIdentity);
  if (!Array.isArray(labelled) || labelled.some((containerId) => !/^[0-9a-f]{64}$/u.test(containerId))) fail("CONTAINER_IDENTITY_MISMATCH", "Recovery controller returned malformed container identities");
  if (labelled.some((containerId) => !active.includes(containerId))) fail("CONTAINER_IDENTITY_MISMATCH", "Lease has an unjournaled container; recovery refuses broad cleanup");
  const removed = [];
  for (const containerId of active) {
    if (labelled.includes(containerId)) {
      await controller.remove(containerId);
      removed.push(containerId);
    }
  }
  if ((await controller.list(leaseIdentity)).length !== 0) fail("CLEANUP_RESIDUE", "Recovery could not remove the exact leased container set");
  return removed;
}

async function recoverRc7ContainmentCore(root, options = {}, injectedController = undefined) {
  const safeRoot = await assertRc7ContainmentRoot(root);
  const lock = await acquireLock(safeRoot);
  try {
    const entries = (await readdir(safeRoot)).filter((entry) => entry !== LOCK_NAME).sort();
    if (canonicalJsonV1(entries) === canonicalJsonV1([PACKAGE_NAME])) {
      const { value, raw } = await readPackage(safeRoot);
      return { status: "complete", entries, package_sha256: value.package_sha256, terminal: value.terminal, byte_count: raw.byteLength };
    }
    if (canonicalJsonV1(entries) === canonicalJsonV1([RECOVERY_NAME])) {
      const { value, raw } = await readRecovery(safeRoot);
      return { status: "blocked-recovered", entries, recovery_sha256: value.recovery_sha256, terminal: value.terminal, byte_count: raw.byteLength };
    }
    if (!entries.includes(JOURNAL_NAME)) fail("UNRECOVERABLE_NO_REPLAY", "Gate B recovery requires a valid durable journal and will not infer or replay missing work");
    const allowed = new Set([JOURNAL_NAME, STATE_NAME, STAGE_NAME, PACKAGE_NAME]);
    if (entries.some((entry) => !allowed.has(entry))) fail("UNKNOWN_RESIDUE", "Recovery will not delete unregistered Gate B residue", { entries });
    const journal = await readJournal(safeRoot);
    if (entries.includes(STATE_NAME)) await readState(safeRoot);
    if (entries.includes(STAGE_NAME)) await readPackage(safeRoot, STAGE_NAME);
    const leaseIdentity = journal[0].lease_identity;
    const imageId = journal[0].image_id;
    const runIdentity = journal[0].run_identity;
    const cleaned = new Set(journal.filter((entry) => entry.event === "CLEANUP_VERIFIED").map((entry) => entry.container_id));
    const active = [...new Set(journal.filter((entry) => entry.event === "CONTAINER_CREATED" && !cleaned.has(entry.container_id)).map((entry) => entry.container_id))];
    let cleanedContainerIdentities = [];
    if (active.length > 0) {
      let controller = injectedController;
      if (controller === undefined) {
        exactKeys(options, ["dockerConfig", "dockerExecutable"], "Gate B recovery runtime options");
        const dockerConfig = await assertEmptyDockerConfig(options.dockerConfig, safeRoot);
        const executable = await assertDockerExecutable(options.dockerExecutable);
        const context = { executable, environment: dockerEnvironment(dockerConfig) };
        controller = {
          list: (lease) => labelledContainers(context, lease),
          remove: (containerId) => execute(executable, ["rm", "--force", containerId], context.environment, { allowNonzero: true }),
        };
      } else if (Object.keys(options).length !== 0) {
        fail("UNEXPECTED_API_OPTION", "Internal recovery controller cannot be combined with public runtime options");
      }
      cleanedContainerIdentities = await reconcileActiveContainers(controller, leaseIdentity, active);
    } else if (Object.keys(options).length !== 0) {
      fail("UNEXPECTED_API_OPTION", "Docker recovery authority is accepted only when the journal proves an uncleaned exact container");
    }
    if (entries.includes(PACKAGE_NAME)) {
      const { value, raw } = await readPackage(safeRoot);
      if (entries.includes(STAGE_NAME)) fail("CONFLICTING_ARTIFACT", "Published and staged Gate B packages conflict");
      await rm(path.join(safeRoot, STATE_NAME), { force: true });
      await rm(path.join(safeRoot, JOURNAL_NAME));
      return { status: "complete", entries: [PACKAGE_NAME], package_sha256: value.package_sha256, terminal: value.terminal, byte_count: raw.byteLength };
    }
    await rm(path.join(safeRoot, STAGE_NAME), { force: true });
    await rm(path.join(safeRoot, STATE_NAME), { force: true });
    const recoveryCodeClosure = await buildCodeClosure();
    const recoverySourceIdentity = await fixtureIdentity("source-pack.json");
    const recoveryRunManifest = buildConformanceRunManifest({ codeClosureSha256: recoveryCodeClosure.files_sha256, imageId, sourcePackSha256: recoverySourceIdentity.sha256 });
    if (recoveryRunManifest.run_identity !== runIdentity) fail("STALE_CODE_CLOSURE", "Interrupted run identity cannot be attributed to the current trusted code and source closure");
    await rm(path.join(safeRoot, JOURNAL_NAME));
    const marker = {
      schema_version: "rc7-gate-b-recovery-terminal-v1",
      policy_identity: RC7_CONTAINMENT_POLICY_ID,
      run_identity: runIdentity,
      run_manifest: recoveryRunManifest,
      lease_identity: leaseIdentity,
      image_id: imageId,
      terminal: "CONTAINMENT_BLOCKED",
      reason: "interrupted-unsealed-never-replayed",
      provider_reachable_dispatches: 0,
      side_effecting_cells_replayed: 0,
      containers_cleaned: cleanedContainerIdentities.length,
      cleaned_container_identities: cleanedContainerIdentities,
      cleanup_residue_entries: 0,
      artifact: {
        path: RECOVERY_NAME,
        schema: "rc7-gate-b-recovery-terminal-v1",
        maximum_bytes: 16_384,
        producer: "lib/recursus/rc7-rlm-containment.mjs",
        provenance: "rc7-provider-free-gate-b-interrupted-run-recovery",
        independent_validator: "lib/recursus/rc7-rlm-containment-validator.mjs:validateRc7RecoveryArtifactIndependent",
        digest_field: "recovery_sha256",
      },
    };
    marker.recovery_sha256 = sha256V1(canonicalJsonV1(recoveryProjection(marker)));
    await writeFile(path.join(safeRoot, RECOVERY_NAME), recoveryBytes(marker), { flag: "wx" });
    return { status: "blocked-recovered", entries: [RECOVERY_NAME], recovery_sha256: marker.recovery_sha256, terminal: marker.terminal, byte_count: recoveryBytes(marker).byteLength };
  } finally {
    await releaseLock(lock);
  }
}

export async function recoverRc7Containment(root, options = {}) {
  return recoverRc7ContainmentCore(root, options);
}

export function formatRc7ContainmentError(error) {
  if (error instanceof Rc7ContainmentError) return { ok: false, code: error.code, message: error.message, details: error.details };
  return { ok: false, code: "UNEXPECTED_ERROR", message: error instanceof Error ? error.message : String(error) };
}

export const __test = Object.freeze({
  ALLOWED_DOCKER_DIFF,
  CONTAINER_ENV_NAMES,
  FIXTURE_ROOT,
  JOURNAL_NAME,
  LOCK_NAME,
  MAX_PACKAGE_BYTES,
  PACKAGE_NAME,
  PROBE_MODES,
  RECOVERY_NAME,
  REPOSITORY_ROOT,
  RESOURCE_LIMITS,
  buildCodeClosure,
  buildConformanceRunManifest,
  buildDockerArguments: createArguments,
  appendJournal,
  acquireLock,
  closeJournal,
  createJournal,
  packageBytes,
  packageProjection,
  readJournal,
  recoverWithController: (root, controller) => recoverRc7ContainmentCore(root, {}, controller),
  recoveryProjection,
  validateRecovery,
  releaseLock,
  validateInspect,
});
