import assert from "node:assert/strict";
import { mkdtemp, link, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  RC7_CONTAINMENT_POLICY_ID, RC7_REGISTERED_FAULTS, Rc7ContainmentError, __test,
  assertRc7ContainmentRoot, buildRc7ContainmentPackage, inspectRc7Containment,
  prepareRc7Containment, recoverRc7Containment, validateRc7ContainmentPackage,
} from "../../lib/recursus/rc7-rlm-containment.mjs";
import {
  Rc7GateBRouteError, authorizeRc7GateBChildRequest, buildRc7GateBFallback,
  buildRc7GateBRouteSeamContract, decideRc7GateBRoute, prepareRc7GateBProviderFreeSeam,
} from "../../lib/recursus/rc7-rlm-gate-b-route.mjs";
import { buildRc7QualificationPackage } from "../../lib/recursus/rc7-rlm-qualification.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";
import { validateRc7GateBRouteArtifactSetIndependent, validateRc7RecoveryArtifactIndependent } from "../../lib/recursus/rc7-rlm-containment-validator.mjs";

const CREATED = [];
const EXTERNAL_TEST_PARENT = process.platform === "win32"
  ? path.dirname(__test.REPOSITORY_ROOT)
  : await realpath(path.join(path.parse(__test.REPOSITORY_ROOT).root, "tmp"));
const EXECUTED_FAULTS = new Set();
const IMAGE_ID = `sha256:${"a".repeat(64)}`;
const LEASE_ID = sha256V1(canonicalJsonV1({ policy: RC7_CONTAINMENT_POLICY_ID, image_id: IMAGE_ID }));
const SOURCE_BYTES = await readFile(path.join(__test.FIXTURE_ROOT, "source-pack.json"));
const WORKER_BYTES = await readFile(path.join(__test.FIXTURE_ROOT, "gate-b-worker.mjs"));
const SECCOMP_VALUE = `seccomp=${JSON.stringify(JSON.parse(await readFile(path.join(__test.FIXTURE_ROOT, "outer-seccomp-default-errno.json"), "utf8")))}`;
const SOURCE_SHA256 = sha256V1(SOURCE_BYTES);
const WORKER_SHA256 = sha256V1(WORKER_BYTES);
const CONTRACT_SHA256 = sha256V1(Buffer.from(`${canonicalJsonV1({ schema_version: "rc7-gate-b-runtime-contract-v1", policy: RC7_CONTAINMENT_POLICY_ID, source_pack_sha256: SOURCE_SHA256 })}\n`, "utf8"));
const CODE_CLOSURE = await __test.buildCodeClosure();
const CONFORMANCE_RUN = __test.buildConformanceRunManifest({ codeClosureSha256: CODE_CLOSURE.files_sha256, imageId: IMAGE_ID, sourcePackSha256: SOURCE_SHA256 });
const RUN_ID = CONFORMANCE_RUN.run_identity;
const OBSERVED_LEASE_ID = LEASE_ID;

after(async () => {
  for (const target of CREATED.reverse()) {
    assert.equal(path.dirname(target), EXTERNAL_TEST_PARENT);
    assert.match(path.basename(target), /^rc7-containment-test-/u);
    await rm(target, { recursive: true, force: true });
  }
});

async function newRoot(name = "root") {
  const parent = await mkdtemp(path.join(EXTERNAL_TEST_PARENT, "rc7-containment-test-"));
  CREATED.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

function evidence(mode, workerResult) {
  const memory = mode === "memory" ? __test.RESOURCE_LIMITS.memory_probe_bytes : __test.RESOURCE_LIMITS.memory_bytes;
  const pids = mode === "pids" ? __test.RESOURCE_LIMITS.pids_probe : __test.RESOURCE_LIMITS.pids;
  return {
    container_configuration: {
      command: [mode],
      environment_names: [...__test.CONTAINER_ENV_NAMES],
      image_id: IMAGE_ID,
      labels: { lease: OBSERVED_LEASE_ID, mode, policy: RC7_CONTAINMENT_POLICY_ID },
      mode,
      mounts: {
        input: { destination: "/rc7/input", read_only: true },
        output_tmpfs_options: ["gid=65532", "mode=0700", "nodev", "noexec", "nosuid", "nr_inodes=256", "rw", "size=16777216", "uid=65532"],
      },
      namespace_and_authority: {
        network: "none", ipc: "none", pid: "", cgroup: "private", readonly_rootfs: true, privileged: false,
        cap_add: [], cap_drop: ["ALL"], security_opt: ["no-new-privileges:true", SECCOMP_VALUE], devices: [], device_requests: [], ports: {}, exposed_ports: {},
      },
      process: { init: true, log_driver: "none", runtime: "runc", stop_timeout: 1 },
      resources: {
        pids, memory, memory_swap: memory, cpu_nanos: __test.RESOURCE_LIMITS.cpu_nanos,
        ulimits: [
          { Hard: __test.RESOURCE_LIMITS.file_size_bytes, Name: "fsize", Soft: __test.RESOURCE_LIMITS.file_size_bytes },
          { Hard: __test.RESOURCE_LIMITS.nofile, Name: "nofile", Soft: __test.RESOURCE_LIMITS.nofile },
        ],
      },
      user: "65532:65532",
    },
    worker_result: workerResult, docker_diff: [...__test.ALLOWED_DOCKER_DIFF],
    producer: "scripts/recursus/rc7-rlm-containment.mjs+gate-b-worker.mjs",
    provenance: "provider-free-local-docker-inspect-worker-stdout-and-diff",
  };
}

function observations() {
  const conformance = {
    schema_version: "rc7-gate-b-worker-result-v1", mode: "conformance",
    input: { contract_sha256: CONTRACT_SHA256, source_pack_sha256: SOURCE_SHA256 },
    runtime: {
      worker_sha256: WORKER_SHA256, hmac_present: true, loopback: true, node: "v24.19.0", ports_valid: true, python: "/opt/rc7/python/bin/python",
      phase_two_seccomp: {
        flag: "SECCOMP_FILTER_FLAG_TSYNC", clone3_action: "ENOSYS-for-safe-clone-thread-fallback", all_after_seccomp_two: true,
        all_after_no_new_privileges: true, all_after_capabilities_zero: true,
        all_surviving_filter_counts_increased: true, new_thread_inherited: true,
      },
    },
    probes: {
      connection_removed: { denied: true, error: { code: "ENOENT", name: "Error" } },
      docker_socket_absent: { denied: true, error: { code: "ENOENT", name: "Error" } },
      input_readonly: { denied: true, error: { code: "EROFS", name: "Error" } },
      named_pipe_absent: { denied: true, error: { code: "ENOENT", name: "Error" } },
      negative_results: {
        dns: { denied: true, errno: -3, error: "gaierror" }, http: { denied: true, errno: 1, error: "PermissionError" },
        output_escape: { denied: true, errno: 30, error: "OSError" }, python_crud: { passed: true },
        repository_read: { denied: true, errno: 2, error: "FileNotFoundError" }, sibling_read: { denied: true, errno: 2, error: "FileNotFoundError" },
        subprocess: { denied: true, errno: 1, error: "PermissionError" }, synthetic_credential_read: { denied: true, errno: 2, error: "FileNotFoundError" },
        tcp_socket: { denied: true, errno: 1, error: "PermissionError" }, udp_socket: { denied: true, errno: 1, error: "PermissionError" },
        user_layer_read: { denied: true, errno: 2, error: "FileNotFoundError" },
      },
      node_output_crud: true, python_output_crud: true,
      root_escape_denied: { denied: true, error: { code: "EROFS", name: "Error" } },
      symlink_escape_denied: { denied: true, error: { code: "ENOENT", name: "Error" } },
    },
    execution: { bootstrap_status: "ok", compute_result: "42", compute_status: "ok", host_request_count: 0, negative_status: "ok", seccomp_status: "ok", set_status: "ok" },
    output_entries_before_result: ["empty-prime", "global-harness", "home", "ipython", "session", "tmp"], passed: true,
  };
  const probes = { conformance: evidence("conformance", conformance) };
  probes.pids = evidence("pids", { schema_version: "rc7-gate-b-worker-result-v1", mode: "pids", attempted_processes: 32, configured_pids_ceiling: 24, limited_before_all_processes_started: true, passed: true });
  probes["file-size"] = evidence("file-size", { schema_version: "rc7-gate-b-worker-result-v1", mode: "file-size", attempted_bytes: 2_097_152, configured_file_size_ceiling: 1_048_576, denied: true, passed: true });
  probes.inodes = evidence("inodes", { schema_version: "rc7-gate-b-worker-result-v1", mode: "inodes", attempted_inodes: 400, configured_inode_ceiling: 256, denied_before_attempt_complete: true, passed: true });
  probes.bytes = evidence("bytes", { schema_version: "rc7-gate-b-worker-result-v1", mode: "bytes", attempted_bytes: 33_554_432, configured_byte_ceiling: 16_777_216, denied_before_attempt_complete: true, passed: true });
  probes.memory = evidence("memory", { schema_version: "rc7-gate-b-worker-result-v1", mode: "memory", memory_ceiling_bytes: 134_217_728, passed: true });
  probes.cpu = evidence("cpu", { schema_version: "rc7-gate-b-worker-result-v1", mode: "cpu", wall_timeout_ms: 3_000, passed: true });
  return {
    docker: {
      backend: "Docker Desktop WSL2", desktop_version: "4.69.0", client_version: "29.4.0",
      engine_version: "29.4.0", api_version: "1.54", os: "linux", architecture: "amd64",
      kernel: "6.18.33.2-microsoft-standard-WSL2", cgroup_version: "2", operating_system: "Docker Desktop",
      server_name: "docker-desktop", runtime: "runc", containerd_version: "v2.2.1", runc_version: "1.3.4",
      runc_git_commit: "v1.3.4-0-gd6d73eb8", docker_init_version: "0.19.0", image_id: IMAGE_ID,
    },
    image_id: IMAGE_ID, probes, code_closure: CODE_CLOSURE, conformance_run_manifest: CONFORMANCE_RUN,
    runtime_accounting: {
      rlm_executions: 1, provider_calls: 0, simulated_provider_requests: 0, credential_accesses: 0,
      runtime_network_actions: 0, child_requests: 0, external_service_mutations: 0, wsl_cli_invocations: 0,
      docker_containers_created: 7, retained_artifacts: 1, terminal_decisions: 1, operator_steps: 0,
      cleanup_residue_entries: 0,
    },
  };
}

function resign(value) {
  value.package_sha256 = sha256V1(canonicalJsonV1(__test.packageProjection(value)));
  return value;
}

function resealArtifact(set, index) {
  const artifact = set.artifacts[index];
  const bytes = Buffer.from(`${canonicalJsonV1(artifact.value)}\n`, "utf8");
  artifact.byte_count = bytes.byteLength;
  artifact.sha256 = sha256V1(bytes);
  set.artifact_set_sha256 = sha256V1(canonicalJsonV1(set.artifacts.map(({ value, ...identity }) => identity)));
}

async function expectCode(action, expected = undefined) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof Rc7ContainmentError || error instanceof Rc7GateBRouteError || error instanceof Error);
    if (expected) assert.ok([expected].flat().includes(error.code), `${error.code} not in ${[expected].flat().join(",")}`);
    return true;
  });
}

async function writePackage(root, value = BASE_PACKAGE, name = __test.PACKAGE_NAME) {
  await writeFile(path.join(root, name), __test.packageBytes(value), { flag: "wx" });
}

async function newJournalRoot() {
  const item = await newRoot();
  const journal = await __test.createJournal(item.root, LEASE_ID, IMAGE_ID, RUN_ID);
  return { ...item, journal };
}

async function appendProbeCycle(journal, mode, index, stopAfter = "cleanup") {
  const containerId = String(index + 1).padStart(64, "0");
  const resultSha256 = String(index + 11).padStart(64, "0");
  await __test.appendJournal(journal, "PROBE_INTENT", { mode });
  await __test.appendJournal(journal, "CONTAINER_CREATED", { mode, container_id: containerId });
  if (stopAfter === "created") return;
  await __test.appendJournal(journal, "DISPATCH_INTENT", { mode, container_id: containerId });
  if (stopAfter === "before-dispatch") {
    await __test.appendJournal(journal, "CLEANUP_INTENT", { mode, container_id: containerId });
    await __test.appendJournal(journal, "CLEANUP_VERIFIED", { mode, container_id: containerId });
    return;
  }
  await __test.appendJournal(journal, "DISPATCH_OBSERVED", { mode, container_id: containerId });
  if (stopAfter === "after-dispatch") {
    await __test.appendJournal(journal, "CLEANUP_INTENT", { mode, container_id: containerId });
    await __test.appendJournal(journal, "CLEANUP_VERIFIED", { mode, container_id: containerId });
    return;
  }
  await __test.appendJournal(journal, "RAW_RESULT", { mode, container_id: containerId, result_sha256: resultSha256 });
  await __test.appendJournal(journal, "RESULT_SEALED", { mode, container_id: containerId, result_sha256: resultSha256 });
  await __test.appendJournal(journal, "CLEANUP_INTENT", { mode, container_id: containerId });
  await __test.appendJournal(journal, "CLEANUP_VERIFIED", { mode, container_id: containerId });
}

async function publicationRoot(kind) {
  const item = await newJournalRoot();
  for (let index = 0; index < __test.PROBE_MODES.length; index += 1) await appendProbeCycle(item.journal, __test.PROBE_MODES[index], index);
  await __test.appendJournal(item.journal, "PUBLICATION_INTENT", { result_sha256: BASE_PACKAGE.package_sha256 });
  await __test.closeJournal(item.journal);
  const state = { schema_version: "rc7-boundary-state-v1", package_sha256: BASE_PACKAGE.package_sha256, terminal: BASE_PACKAGE.terminal };
  await writeFile(path.join(item.root, ".boundary-conformance-state.json"), `${canonicalJsonV1(state)}\n`, { flag: "wx" });
  if (["stage", "during"].includes(kind)) await writePackage(item.root, BASE_PACKAGE, ".boundary-conformance-package.staged");
  if (kind === "published") await writePackage(item.root);
  return item;
}

const BASE_PACKAGE = await buildRc7ContainmentPackage(observations());

test("Gate B freezes the executable seam, nine permitted route preparations, raw projections, and one terminal", async () => {
  assert.equal(BASE_PACKAGE.policy_identity, RC7_CONTAINMENT_POLICY_ID);
  assert.equal(BASE_PACKAGE.executable_route_seam.default_route, "rc-direct");
  assert.equal(BASE_PACKAGE.executable_route_seam.default_rlm_enabled, false);
  assert.equal(BASE_PACKAGE.executable_route_seam.rlm_only_difference.os_authority.syscall_default_deny_claimed, true);
  assert.equal(BASE_PACKAGE.route_artifact_sets.length, 9);
  assert.equal(BASE_PACKAGE.probe_evidence.modes.length, 7);
  assert.equal(BASE_PACKAGE.accounting.provider_calls, 0);
  assert.equal(BASE_PACKAGE.accounting.credential_accesses, 0);
  assert.equal(BASE_PACKAGE.terminal, "CONTAINMENT_CONFORMANT");
  assert.ok(__test.packageBytes(BASE_PACKAGE).byteLength <= __test.MAX_PACKAGE_BYTES);
  await validateRc7ContainmentPackage(BASE_PACKAGE);
});

test("one failed raw resource predicate produces a blocked package", async () => {
  const input = observations();
  input.probes.memory.worker_result.passed = false;
  assert.equal((await buildRc7ContainmentPackage(input)).terminal, "CONTAINMENT_BLOCKED");
});

test("two provider-free preparations are byte-identical", async () => {
  assert.deepEqual(__test.packageBytes(await buildRc7ContainmentPackage(observations())), __test.packageBytes(await buildRc7ContainmentPackage(observations())));
});

test("independent validator rejects re-signed raw, host, recovery, fault, run, and non-claim weakening", async () => {
  const mutations = [
    (value) => { value.probe_evidence.modes[0].container_configuration.namespace_and_authority.network = "bridge"; },
    (value) => { value.probe_evidence.modes[0].container_configuration.namespace_and_authority.readonly_rootfs = false; },
    (value) => { value.probe_evidence.modes[0].container_configuration.namespace_and_authority.cap_drop = []; },
    (value) => { value.probe_evidence.modes[0].container_configuration.namespace_and_authority.security_opt[1] = "seccomp={\"defaultAction\":\"SCMP_ACT_ALLOW\"}"; },
    (value) => { value.probe_evidence.modes[0].worker_result.runtime.phase_two_seccomp.all_after_seccomp_two = false; },
    (value) => { value.host_runtime.kernel = "substituted-kernel"; },
    (value) => { value.boundary.phase_two_denials = []; },
    (value) => { value.recovery.safe_fallback = "replay-treatment"; },
    (value) => { value.recovery.journal.checkpoints = []; },
    (value) => { value.fault_contract.registered_faults = Array(54).fill("missing-path"); },
    (value) => { value.non_claims = ["production-sandbox-established"]; },
    (value) => { value.conformance_run_manifest.run_identity = "0".repeat(64); },
    (value) => { value.gate_a_case_catalog_sha256 = "0".repeat(64); },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(BASE_PACKAGE);
    mutate(value);
    value.probe_evidence.evidence_sha256 = sha256V1(canonicalJsonV1(value.probe_evidence.modes));
    resign(value);
    await expectCode(() => validateRc7ContainmentPackage(value));
  }
});

test("Docker controller inputs reject arbitrary executables and aliased config bytes before execution", async () => {
  const first = await newRoot();
  const configRoot = path.join(first.parent, "controlled-config");
  await mkdir(configRoot);
  await writeFile(path.join(configRoot, "config.json"), `${canonicalJsonV1({ auths: {} })}\n`);
  await expectCode(() => prepareRc7Containment(first.root, { dockerConfig: configRoot, dockerExecutable: path.join(first.parent, "arbitrary.exe"), imageId: IMAGE_ID }), "INVALID_DOCKER_EXECUTABLE");

  const second = await newRoot();
  const aliasConfig = path.join(second.parent, "alias-config");
  await mkdir(aliasConfig);
  const outside = path.join(second.parent, "outside-config.json");
  await writeFile(outside, `${canonicalJsonV1({ auths: {} })}\n`);
  await link(outside, path.join(aliasConfig, "config.json"));
  await expectCode(() => prepareRc7Containment(second.root, { dockerConfig: aliasConfig, dockerExecutable: "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe", imageId: IMAGE_ID }), "ALIASED_ARTIFACT");
});

test("route seam rejects generic RLM and every child request before provider reachability", () => {
  const seam = buildRc7GateBRouteSeamContract();
  assert.equal(decideRc7GateBRoute({ case_id: "LAB-01", cell: "default-direct" }).selected_route, "rc-direct");
  assert.equal(decideRc7GateBRoute({ case_id: "LAB-01", cell: "rlm-treatment" }).selected_route, "rc-rlm");
  assert.throws(() => decideRc7GateBRoute({ case_id: "SAFE-01", cell: "rlm-treatment" }), (error) => error.code === "GENERIC_RLM_SELECTION");
  assert.throws(() => authorizeRc7GateBChildRequest({ parent_run_identity: "1".repeat(64), child_sequence: 1, authority_identity: seam.rlm_only_difference.child_broker.identity, budget_identity: "rc7-gate-b-zero-child-budget-v1", input_sha256: "2".repeat(64) }), (error) => error.code === "GATE_B_PROVIDER_UNREACHABLE");
});

test("fallback creates a fresh direct run without relabelling or replay", () => {
  const value = buildRc7GateBFallback({ original_run_identity: "1".repeat(64), case_id: "LAB-01", trigger: "rlm-interrupted", code_closure_sha256: "2".repeat(64) });
  assert.notEqual(value.fallback_run_identity, value.original_run_identity);
  assert.equal(value.original_attempt_relabelled, false);
  assert.equal(value.side_effecting_cell_replayed, false);
});

test("provider-free executable seam connects decision, artifacts, broker denial, and fresh direct fallback", async () => {
  const qualification = await buildRc7QualificationPackage();
  const defaultDirect = prepareRc7GateBProviderFreeSeam({ qualification, case_id: "FACT-01", cell: "default-direct", repeat: 1, code_closure_sha256: CODE_CLOSURE.files_sha256, fallback_trigger: null });
  assert.equal(defaultDirect.decision.selected_route, "rc-direct");
  assert.equal(validateRc7GateBRouteArtifactSetIndependent(defaultDirect.selected_route_artifacts, qualification, CODE_CLOSURE.files_sha256).cell, "default-direct");
  const prepared = prepareRc7GateBProviderFreeSeam({ qualification, case_id: "LAB-01", cell: "rlm-treatment", repeat: 1, code_closure_sha256: CODE_CLOSURE.files_sha256, fallback_trigger: null });
  assert.equal(prepared.decision.selected_route, "rc-rlm");
  assert.equal(prepared.rlm_executions, 0);
  assert.equal(prepared.provider_requests, 0);
  const fallback = prepareRc7GateBProviderFreeSeam({ qualification, case_id: "LAB-01", cell: "rlm-treatment", repeat: 1, code_closure_sha256: CODE_CLOSURE.files_sha256, fallback_trigger: "rlm-unavailable" });
  assert.equal(fallback.status, "failed-treatment-appended-safe-direct-prepared");
  assert.notEqual(fallback.attempted_route_artifacts.run_identity, fallback.selected_route_artifacts.run_identity);
  assert.equal(fallback.fallback.original_attempt_relabelled, false);
  assert.throws(() => authorizeRc7GateBChildRequest({ parent_run_identity: prepared.attempted_route_artifacts.run_identity, child_sequence: 1, authority_identity: "rc7-gate-b-deny-all-child-broker-v1", budget_identity: "rc7-gate-b-zero-child-budget-v1", input_sha256: SOURCE_SHA256 }), (error) => error.code === "GATE_B_PROVIDER_UNREACHABLE");
});

test("Docker argv freezes effective authority and exact image", () => {
  const args = __test.buildDockerArguments({ imageId: IMAGE_ID, inputRoot: "F:\\OpenCnid\\rc7-input", leaseIdentity: LEASE_ID, mode: "conformance", name: "rc7-test", seccompPath: "F:\\OpenCnid\\outer-seccomp-default-errno.json" });
  const command = args.join(" ");
  for (const expected of ["--pull=never", "--network=none", "--read-only", "--cap-drop=ALL", "no-new-privileges:true", "--ipc=none", "--cgroupns=private", "--pids-limit 64", "--memory 805306368", "--memory-swap 805306368", "--init", "--log-driver=none", "--runtime=runc", "--stop-timeout=1", "dst=/rc7/input,readonly", "/rc7/output:rw,noexec,nosuid,nodev"]) assert.ok(command.includes(expected), expected);
  for (const denied of ["--privileged", "--device", "--publish", "--volume", "--env-file", "http://", "https://", "credential", "--provider", "provider="]) assert.equal(command.toLowerCase().includes(denied), false, denied);
  assert.equal(args.at(-2), IMAGE_ID);
});

test("fixtures freeze default-errno provenance and phase-two TSYNC", async () => {
  const worker = await readFile(path.join(__test.FIXTURE_ROOT, "gate-b-worker.mjs"), "utf8");
  const outer = JSON.parse(await readFile(path.join(__test.FIXTURE_ROOT, "outer-seccomp-default-errno.json"), "utf8"));
  const provenance = JSON.parse(await readFile(path.join(__test.FIXTURE_ROOT, "outer-seccomp-provenance.json"), "utf8"));
  assert.equal(outer.defaultAction, "SCMP_ACT_ERRNO");
  assert.equal(provenance.source_commit, "de2c5158b0d0203e9a29f2117f62e97b38813ecd");
  assert.match(worker, /SECCOMP_FILTER_FLAG_TSYNC/u);
  assert.match(worker, /all_surviving_filter_counts_increased/u);
  assert.doesNotMatch(worker, /https?:\/\//iu);
});

test("inspection and completed recovery are idempotent", async () => {
  const { root } = await newRoot();
  await writePackage(root);
  assert.deepEqual(await inspectRc7Containment(root), await inspectRc7Containment(root));
  assert.deepEqual(await recoverRc7Containment(root), await recoverRc7Containment(root));
});

test("hash-chained interruption recovers to one immutable blocked terminal without replay", async () => {
  const item = await newJournalRoot();
  await appendProbeCycle(item.journal, "conformance", 0, "after-dispatch");
  await __test.closeJournal(item.journal);
  const first = await recoverRc7Containment(item.root);
  assert.equal(first.status, "blocked-recovered");
  assert.deepEqual(first, await recoverRc7Containment(item.root));
  assert.equal((await inspectRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED");
});

test("recovery reconciles one exact uncleaned leased container through a faithful provider-free controller", async () => {
  const item = await newJournalRoot();
  await appendProbeCycle(item.journal, "conformance", 0, "created");
  await __test.closeJournal(item.journal);
  const containerId = "1".padStart(64, "0");
  const live = new Set([containerId]);
  const calls = [];
  const controller = {
    list: async (lease) => {
      assert.equal(lease, LEASE_ID);
      calls.push(["list", lease]);
      return [...live];
    },
    remove: async (identity) => {
      calls.push(["remove", identity]);
      assert.equal(identity, containerId);
      live.delete(identity);
    },
  };
  const recovered = await __test.recoverWithController(item.root, controller);
  assert.equal(recovered.terminal, "CONTAINMENT_BLOCKED");
  assert.deepEqual([...live], []);
  const marker = JSON.parse(await readFile(path.join(item.root, __test.RECOVERY_NAME), "utf8"));
  assert.equal(marker.containers_cleaned, 1);
  assert.equal(marker.side_effecting_cells_replayed, 0);
  assert.equal(marker.run_identity, RUN_ID);
  assert.equal(marker.artifact.provenance, "rc7-provider-free-gate-b-interrupted-run-recovery");
  assert.deepEqual(calls.map(([operation]) => operation), ["list", "remove", "list"]);
  const weakened = structuredClone(marker);
  weakened.run_identity = "0".repeat(64);
  weakened.recovery_sha256 = sha256V1(canonicalJsonV1(__test.recoveryProjection(weakened)));
  assert.throws(() => __test.validateRecovery(weakened), (error) => error.code === "RUN_IDENTITY_MISMATCH");
  const closure = { code_closure_sha256: CODE_CLOSURE.files_sha256, image_id: IMAGE_ID, source_pack_sha256: SOURCE_SHA256 };
  for (const mutate of [
    (value) => { value.lease_identity = "d".repeat(64); },
    (value) => { value.containers_cleaned = 999; },
  ]) {
    const resigned = structuredClone(marker);
    mutate(resigned);
    resigned.recovery_sha256 = sha256V1(canonicalJsonV1(__test.recoveryProjection(resigned)));
    assert.throws(() => validateRc7RecoveryArtifactIndependent(resigned, closure), (error) => error.code === "RECOVERY_CONTRACT_MISMATCH");
  }
});

test("journal rejects re-signed lease and image switches within one immutable run", async () => {
  for (const field of ["lease_identity", "image_id"]) {
    const item = await newJournalRoot();
    await __test.appendJournal(item.journal, "PROBE_INTENT", { mode: "conformance" });
    await __test.closeJournal(item.journal);
    const journalPath = path.join(item.root, __test.JOURNAL_NAME);
    const entries = (await readFile(journalPath, "utf8")).trimEnd().split(/\r?\n/u).map(JSON.parse);
    entries[1][field] = field === "image_id" ? `sha256:${"e".repeat(64)}` : "e".repeat(64);
    for (let index = 1; index < entries.length; index += 1) {
      entries[index].previous_sha256 = entries[index - 1].entry_sha256;
      const projection = structuredClone(entries[index]);
      delete projection.entry_sha256;
      entries[index].entry_sha256 = sha256V1(canonicalJsonV1(projection));
    }
    await writeFile(journalPath, entries.map((entry) => canonicalJsonV1(entry)).join(""));
    await expectCode(() => __test.readJournal(item.root), "MALFORMED_JOURNAL");
  }
});

function packageFault(mutator) {
  return async () => {
    const value = structuredClone(BASE_PACKAGE);
    await mutator(value);
    resign(value);
    await expectCode(() => validateRc7ContainmentPackage(value));
  };
}

async function partialRecovery(stopAfter = undefined) {
  const item = await newJournalRoot();
  if (stopAfter) await appendProbeCycle(item.journal, "conformance", 0, stopAfter);
  await __test.closeJournal(item.journal);
  assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED");
  return item;
}

const PACKAGE_MUTATIONS = {
  "missing-identity": (value) => { delete value.component.commit; },
  "extra-identity": (value) => { value.component.unregistered = true; },
  "stale-identity": (value) => { value.component.commit = "0".repeat(40); },
  "replaced-identity": (value) => { value.boundary.fixture_identities[0].sha256 = "0".repeat(64); },
  "malformed-case-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.case_id = 7; },
  "mismatched-case-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.case_id = "SAFE-01"; },
  "mismatched-route-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.route_identity = "rc-unknown"; },
  "mismatched-permission-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.shared_permission_identity = "weakened"; },
  "mismatched-budget-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.child_budget_identity = "unbounded"; },
  "mismatched-source-identity": (value) => { value.route_artifact_sets[0].artifacts[0].value.source_pack_identity = "0".repeat(64); },
  "eligibility-leak": (value) => { value.visible_input.eligibility_bytes_present = true; },
  "oracle-leak": (value) => { value.visible_input.evaluator_or_oracle_bytes_present = true; },
  "generic-rlm-selection": (value) => {
    const set = value.route_artifact_sets.find((item) => item.artifacts[0].value.case_id === "SAFE-01");
    set.artifacts[0].value.route_identity = "rc7-rc-rlm-contained-provider-free-prepared-v1";
  },
  "eligible-treatment-omission": (value) => {
    value.route_artifact_sets = value.route_artifact_sets.filter((item) => !(item.artifacts[0].value.case_id === "LAB-01" && item.artifacts[1].value.cell === "rlm-treatment"));
  },
  "malformed-artifact": (value) => { value.route_artifact_sets[0].artifacts[5].value = null; },
  "oversized-artifact": (value) => {
    const set = value.route_artifact_sets[0];
    set.artifacts[5].value.claims = ["x".repeat(140_000)];
    resealArtifact(set, 5);
  },
  "unprovenanced-artifact": (value) => { value.route_artifact_sets[0].artifacts[2].provenance = ""; },
  "conflicting-evidence-artifact": (value) => {
    const set = value.route_artifact_sets[0];
    set.artifacts[3].value.entries = [{ locator: "synthetic:1", claim: "a" }, { locator: "synthetic:1", claim: "not-a" }];
    resealArtifact(set, 3);
  },
  "nested-permission-weakening": (value) => { value.executable_route_seam.rlm_only_difference.os_authority.permitted.push("host-user-layer-read"); },
  "nested-containment-weakening": (value) => { value.boundary.outer_controls.network = "bridge"; },
  "direct-route-authority-widening": (value) => { value.direct_route_conformance.operating_system_authority_delta = "shell"; },
  "cleanup-residue": (value) => { value.cleanup.labelled_containers = 1; },
};

const FAULT_ACTIONS = Object.fromEntries(Object.entries(PACKAGE_MUTATIONS).map(([faultId, mutation]) => [faultId, packageFault(mutation)]));

Object.assign(FAULT_ACTIONS, {
  "missing-path": async () => { const { parent } = await newRoot(); await expectCode(() => assertRc7ContainmentRoot(path.join(parent, "missing")), "MISSING_PATH"); },
  "nonempty-path": async () => { const { root } = await newRoot(); await writeFile(path.join(root, "x"), "x"); await expectCode(() => assertRc7ContainmentRoot(root, { requireEmpty: true }), "NONEMPTY_OUTPUT_ROOT"); },
  "repository-path": async () => expectCode(() => assertRc7ContainmentRoot(__test.REPOSITORY_ROOT), "REPOSITORY_PATH"),
  "broad-path": async () => expectCode(() => assertRc7ContainmentRoot(path.parse(__test.REPOSITORY_ROOT).root), "BROAD_PATH"),
  "aliased-path": async () => {
    const { parent } = await newRoot();
    const native = path.join(parent, "native");
    const alias = path.join(parent, "alias");
    await mkdir(native);
    await symlink(native, alias, "junction");
    await expectCode(() => assertRc7ContainmentRoot(alias), "ALIASED_PATH");
  },
  "overlapping-path": async () => {
    const { root } = await newRoot();
    await expectCode(() => prepareRc7Containment(root, { dockerConfig: root, dockerExecutable: "F:\\missing-docker.exe", imageId: IMAGE_ID }), "OVERLAPPING_PATH");
  },
  "user-layer-path": async () => expectCode(() => assertRc7ContainmentRoot(homedir()), "USER_LAYER_PATH"),
  "credential-like-path": async () => {
    const { parent } = await newRoot();
    const root = path.join(parent, "credentials");
    await mkdir(root);
    await expectCode(() => assertRc7ContainmentRoot(root), "CREDENTIAL_LIKE_PATH");
  },
  "child-budget-exhaustion": async () => {
    assert.throws(() => authorizeRc7GateBChildRequest({ parent_run_identity: "1".repeat(64), child_sequence: 1, authority_identity: "rc7-gate-b-deny-all-child-broker-v1", budget_identity: "rc7-gate-b-zero-child-budget-v1", input_sha256: "2".repeat(64) }), (error) => error.code === "GATE_B_PROVIDER_UNREACHABLE");
  },
  "aliased-artifact-path": async () => {
    const { parent, root } = await newRoot();
    const source = path.join(parent, "outside-package.json");
    await writeFile(source, __test.packageBytes(BASE_PACKAGE));
    await link(source, path.join(root, __test.PACKAGE_NAME));
    await expectCode(() => inspectRc7Containment(root), "ALIASED_ARTIFACT");
  },
  "oversized-state-artifact": async () => {
    const item = await newJournalRoot();
    await __test.closeJournal(item.journal);
    await writeFile(path.join(item.root, ".boundary-conformance-state.json"), Buffer.alloc(4097));
    await expectCode(() => inspectRc7Containment(item.root), "OVERSIZED_ARTIFACT");
  },
  "lock-replacement": async () => {
    const { root } = await newRoot();
    const lockValue = await __test.acquireLock(root);
    await writeFile(lockValue.target, "replacement");
    await expectCode(() => __test.releaseLock(lockValue), "LOCK_IDENTITY_MISMATCH");
  },
  "public-override-rejection": async () => expectCode(() => prepareRc7Containment("F:\\missing", { dockerConfig: "F:\\missing", dockerExecutable: "F:\\missing", imageId: IMAGE_ID, externalUrl: "https://example.invalid" }), "UNEXPECTED_API_OPTION"),
  "fault-authority-weakening": async () => expectCode(() => prepareRc7Containment("F:\\missing", { dockerConfig: "F:\\missing", dockerExecutable: "F:\\missing", imageId: IMAGE_ID, credential: "forbidden" }), "UNEXPECTED_API_OPTION"),
  "interruption-before-dispatch": async () => { await partialRecovery("before-dispatch"); },
  "interruption-after-dispatch-without-sealed-result": async () => { await partialRecovery("after-dispatch"); },
  "interruption-after-result-sealing": async () => { await partialRecovery("cleanup"); },
  "side-effecting-cell-replay": async () => {
    const item = await partialRecovery("after-dispatch");
    const marker = JSON.parse(await readFile(path.join(item.root, __test.RECOVERY_NAME), "utf8"));
    assert.equal(marker.side_effecting_cells_replayed, 0);
  },
  "interruption-after-lock": async () => { await partialRecovery(); },
  "interruption-after-fixture-validation": async () => {
    const item = await newJournalRoot();
    await __test.appendJournal(item.journal, "PROBE_INTENT", { mode: "conformance" });
    await __test.closeJournal(item.journal);
    assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED");
  },
  "interruption-after-state-write": async () => { const item = await publicationRoot("state"); assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED"); },
  "interruption-after-stage-write": async () => { const item = await publicationRoot("stage"); assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED"); },
  "interruption-during-publication": async () => { const item = await publicationRoot("during"); assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED"); },
  "interruption-after-publication": async () => { const item = await publicationRoot("published"); assert.equal((await recoverRc7Containment(item.root)).status, "complete"); },
  "repeated-inspection": async () => { const { root } = await newRoot(); await writePackage(root); assert.deepEqual(await inspectRc7Containment(root), await inspectRc7Containment(root)); },
  "repeated-recovery": async () => { const item = await partialRecovery(); assert.deepEqual(await recoverRc7Containment(item.root), await recoverRc7Containment(item.root)); },
  "concurrent-recovery": async () => {
    const item = await newJournalRoot();
    await __test.closeJournal(item.journal);
    const held = await __test.acquireLock(item.root);
    await expectCode(() => recoverRc7Containment(item.root), "RECOVERY_LOCKED");
    await __test.releaseLock(held);
    assert.equal((await recoverRc7Containment(item.root)).terminal, "CONTAINMENT_BLOCKED");
  },
});

for (const trigger of ["rlm-unavailable", "rlm-disabled", "rlm-over-budget", "rlm-malformed", "rlm-interrupted"]) {
  FAULT_ACTIONS[`fallback-${trigger}`] = async () => {
    const value = buildRc7GateBFallback({ original_run_identity: "1".repeat(64), case_id: "LAB-01", trigger, code_closure_sha256: "2".repeat(64) });
    assert.equal(value.selected_route, "rc-direct");
    assert.equal(value.original_attempt_relabelled, false);
  };
}

for (const faultId of RC7_REGISTERED_FAULTS) {
  test(`[fault:${faultId}] injects one provider-free failure or safe terminal`, async () => {
    assert.equal(typeof FAULT_ACTIONS[faultId], "function", `missing injected fault action: ${faultId}`);
    await FAULT_ACTIONS[faultId]();
    EXECUTED_FAULTS.add(faultId);
  });
}

test("all registered faults were injected", () => {
  assert.deepEqual([...EXECUTED_FAULTS].sort(), [...RC7_REGISTERED_FAULTS].sort());
});
