import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";
import { __test as liveCapsuleTest } from "../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs";
import { RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS } from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";

import { __test as executorTest, buildRc7GateCGateBReference, buildRc7GateCRlmProgram } from "../../lib/recursus/rc7-rlm-gate-c-executor.mjs";
import {
  RC7_GATE_C_RLM_COMPONENT_COMMIT,
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_INHERITED_ENVIRONMENT,
  RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
  RC7_GATE_C_RLM_LIMITS,
  buildRc7GateCRlmCreateArguments,
  prepareRc7GateCRlmLauncher,
  publishRc7GateCRlmProgram,
  runRc7GateCRlmWithController,
} from "../../lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs";
import {
  RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME,
  RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME,
  RC7_GATE_C_TREATMENT_PROOF_RUN_ID,
  authorizeRc7GateCTreatmentProofDispatch,
  buildRc7GateCTreatmentProofRequest,
  buildRc7GateCTreatmentProofSealedResult,
  closeRc7GateCTreatmentProofReservation,
  consumeRc7GateCTreatmentProofReservation,
  initializeRc7GateCTreatmentProofLedger,
  inspectRc7GateCTreatmentProofLedger,
  preflightRc7GateCTreatmentProofLiveDispatch,
  prepareRc7GateCTreatmentProofFreeze,
  recoverRc7GateCTreatmentProofLedger,
  recordRc7GateCTreatmentProofProviderFreeConformance,
  recordRc7GateCTreatmentProofApproval,
  sealRc7GateCTreatmentProofRequest,
  __test,
} from "../../lib/recursus/rc7-rlm-gate-c-treatment-proof.mjs";

const TEST_CONTAINER_ID = "f".repeat(64);
const TEST_BASE_OUTPUT = Object.freeze({
  schema_version: "rc7-gate-c-signature-output-v1",
  case_id: "LAB-01",
  completion: "incomplete",
  evidence_items: [],
  gaps: [{ code: "insufficient_evidence", locators: [] }],
  safety_events: [],
});

function recordWithDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

function canonicalRecordBytes(value) {
  return Buffer.from(`${canonicalJsonV1(value)}\n`, "utf8");
}

function phaseTwoRecord(context) {
  return recordWithDigest({
    schema_version: "rc7-gate-c-rlm-phase-two-attestation-v1",
    state: "tsync-active-before-program-and-child-proposals",
    activation_sha256: context.launch.activation_sha256,
    run_identity: context.launch.run_identity,
    intent_sha256: context.launch.intent_sha256,
    dispatch_sha256: context.launch.dispatch_sha256,
    semantic_request_sha256: context.launch.semantic_request_sha256,
    worker_sha256: context.launch.worker_sha256,
    phase_two: {
      all_before_capabilities_zero: true,
      all_before_no_new_privileges: true,
      all_before_seccomp_two: true,
      clone3_action: "ENOSYS-for-safe-clone-thread-fallback",
      filesystem_open_denied_after_filter: true,
      flag: "SECCOMP_FILTER_FLAG_TSYNC",
      new_thread_survived: true,
    },
  }, "phase_two_sha256");
}

async function validDockerInspect(context) {
  const create = buildRc7GateCRlmCreateArguments(context);
  const environment = Object.entries(RC7_GATE_C_RLM_INHERITED_ENVIRONMENT).map(([name, value]) => `${name}=${value}`);
  for (let index = 0; index < create.args.length; index += 1) if (create.args[index] === "--env") environment.push(create.args[index + 1]);
  const seccompBytes = await readFile(path.resolve("tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-default-errno.json"));
  const seccomp = `seccomp=${JSON.stringify(JSON.parse(seccompBytes.toString("utf8")))}`;
  return [{
    Id: TEST_CONTAINER_ID,
    Image: context.launch.image_id,
    State: { Running: true, Paused: false, Restarting: false, Dead: false, Status: "running" },
    Config: { User: "65532:65532", Labels: create.labels, Env: environment, StopTimeout: 1, ExposedPorts: null },
    HostConfig: {
      NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, IpcMode: "none", PidMode: "", CgroupnsMode: "private",
      CapAdd: [], CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true", seccomp],
      PidsLimit: RC7_GATE_C_RLM_LIMITS.pids, Memory: RC7_GATE_C_RLM_LIMITS.memory_bytes,
      MemorySwap: RC7_GATE_C_RLM_LIMITS.memory_bytes, NanoCpus: RC7_GATE_C_RLM_LIMITS.cpu_nanos,
      Ulimits: [
        { Name: "fsize", Soft: RC7_GATE_C_RLM_LIMITS.file_size_bytes, Hard: RC7_GATE_C_RLM_LIMITS.file_size_bytes },
        { Name: "nofile", Soft: RC7_GATE_C_RLM_LIMITS.nofile, Hard: RC7_GATE_C_RLM_LIMITS.nofile },
      ],
      Init: true, LogConfig: { Type: "none", Config: {} }, Runtime: "runc", RestartPolicy: { Name: "no", MaximumRetryCount: 0 },
      Binds: null, Devices: [], DeviceRequests: [], Links: null, VolumesFrom: null, PortBindings: {},
      Tmpfs: {
        "/rc7/state": `rw,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.state_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.state_inodes},uid=65532,gid=65532,mode=0700`,
        "/rc7/output": `rw,noexec,nosuid,nodev,size=${RC7_GATE_C_RLM_LIMITS.output_bytes},nr_inodes=${RC7_GATE_C_RLM_LIMITS.output_inodes},uid=65532,gid=65532,mode=0700`,
      },
    },
    Mounts: [
      { Type: "bind", Source: path.join(context.root, "source"), Destination: "/rc7/source", RW: false },
      { Type: "bind", Source: path.join(context.root, "launcher"), Destination: "/rc7/launcher", RW: false },
      { Type: "bind", Source: path.join(context.root, "exchange"), Destination: "/rc7/exchange", RW: true },
    ],
    NetworkSettings: { Ports: {} },
  }];
}

class FourChildConformanceController {
  created = false;
  started = false;
  removed = false;
  context = null;
  async list() { return this.created && !this.removed ? [TEST_CONTAINER_ID] : []; }
  async create() { this.created = true; return TEST_CONTAINER_ID; }
  async start() { this.started = true; }
  async inspect() {
    const value = await validDockerInspect(this.context);
    value[0].State.Running = this.started && !this.removed;
    return value;
  }
  async remove() { this.removed = true; }
  async tick({ context }) {
    this.context = context;
    const phasePath = path.join(context.root, "exchange", "results", "phase-two.json");
    try { await readFile(phasePath); } catch { await writeFile(phasePath, canonicalRecordBytes(phaseTwoRecord(context)), { flag: "wx" }); }
    const requestsRoot = path.join(context.root, "exchange", "requests");
    const responsesRoot = path.join(context.root, "exchange", "responses");
    const requests = (await readdir(requestsRoot)).sort();
    const responses = (await readdir(responsesRoot)).sort();
    if (responses.length < 4 && requests.length === responses.length) {
      const sequence = requests.length + 1;
      const proposal = recordWithDigest({
        schema_version: "rc7-gate-c-rlm-child-proposal-v1",
        state: "proposed-provider-unreachable",
        activation_sha256: context.launch.activation_sha256,
        run_identity: context.launch.run_identity,
        intent_sha256: context.launch.intent_sha256,
        dispatch_sha256: context.launch.dispatch_sha256,
        semantic_request_sha256: context.launch.semantic_request_sha256,
        child_sequence: sequence,
        parent_depth: 0,
        child_depth: 1,
        child_question: `Synthetic child ${sequence}`,
        excerpt_locator: { kind: "synthetic-section", value: `section-${sequence}` },
        max_children: 4,
        max_depth: 2,
      }, "request_sha256");
      await writeFile(path.join(requestsRoot, `${String(sequence).padStart(4, "0")}.json`), canonicalRecordBytes(proposal), { flag: "wx" });
      return;
    }
    if (responses.length === 4) {
      const resultPath = path.join(context.root, "exchange", "results", "container-result.json");
      try { await readFile(resultPath); return; } catch {}
      const program = JSON.parse(await readFile(path.join(context.root, "exchange", "commands", "program.json"), "utf8"));
      const requestDigests = [];
      for (const entry of requests) requestDigests.push(JSON.parse(await readFile(path.join(requestsRoot, entry), "utf8")).request_sha256);
      const result = recordWithDigest({
        schema_version: "rc7-gate-c-rlm-container-result-v1",
        state: "sealed-provider-free-container-output",
        policy_identity: RC7_GATE_C_RLM_LAUNCHER_POLICY_ID,
        activation_sha256: context.launch.activation_sha256,
        run_identity: context.launch.run_identity,
        intent_sha256: context.launch.intent_sha256,
        dispatch_sha256: context.launch.dispatch_sha256,
        semantic_request_sha256: context.launch.semantic_request_sha256,
        image_id: context.launch.image_id,
        worker_sha256: context.launch.worker_sha256,
        program_sha256: program.program_sha256,
        component_commit: RC7_GATE_C_RLM_COMPONENT_COMMIT,
        kernel_generation: 1,
        phase_two: phaseTwoRecord(context).phase_two,
        child_request_count: 4,
        child_request_sha256s: requestDigests,
        route_output: TEST_BASE_OUTPUT,
        route_output_sha256: sha256V1(canonicalJsonV1(TEST_BASE_OUTPUT)),
        direct_container_provider_access: "denied-network-none",
      }, "result_sha256");
      await writeFile(resultPath, canonicalRecordBytes(result), { flag: "wx" });
    }
  }
}

const CONFORMANCE_BASE = await mkdtemp(path.join(tmpdir(), "rc7-treatment-proof-conformance-"));
const TEST_CONFORMANCE = Object.freeze({
  rlm: path.join(CONFORMANCE_BASE, "rlm-conformance"),
  ledger: path.join(CONFORMANCE_BASE, "conformance-ledger"),
});
await mkdir(TEST_CONFORMANCE.rlm);
await mkdir(TEST_CONFORMANCE.ledger);
await mkdir(path.join(TEST_CONFORMANCE.ledger, "docker-cli-config"));
const semanticRequest = {
  schema_version: "rc7-gate-c-semantic-request-v1",
  model: "gpt-5.6-sol",
  messages: [{ role: "system", content: "Synthetic conformance only." }, { role: "user", content: "Return the closed signature." }],
  reasoning: "xhigh",
};
const semanticRequestSha256 = sha256V1(Buffer.from(`${canonicalJsonV1(semanticRequest)}\n`, "utf8"));
const preparedConformance = await prepareRc7GateCRlmLauncher(TEST_CONFORMANCE.rlm, {
  activation_sha256: "a".repeat(64), arm: "rc-rlm", case_id: "LAB-01", dispatch_sha256: "d".repeat(64),
  image_id: RC7_GATE_C_RLM_IMAGE_ID, intent_sha256: "c".repeat(64), run_identity: "b".repeat(64), selected_route: "rc-rlm",
  semantic_request: semanticRequest, semantic_request_sha256: semanticRequestSha256,
});
const closedConformanceProgram = await buildRc7GateCRlmProgram({ case_id: "LAB-01", base_output: TEST_BASE_OUTPUT });
await publishRc7GateCRlmProgram(TEST_CONFORMANCE.rlm, {
  activation_sha256: preparedConformance.launch.activation_sha256,
  base_output: closedConformanceProgram.base_output,
  base_output_sha256: closedConformanceProgram.base_output_sha256,
  dispatch_sha256: preparedConformance.launch.dispatch_sha256,
  intent_sha256: preparedConformance.launch.intent_sha256,
  python_code: closedConformanceProgram.python_code,
  run_identity: preparedConformance.launch.run_identity,
  semantic_request_sha256: preparedConformance.launch.semantic_request_sha256,
});
const conformanceController = new FourChildConformanceController();
conformanceController.context = preparedConformance;
await runRc7GateCRlmWithController(TEST_CONFORMANCE.rlm, {
  abort_signal: new AbortController().signal,
  controller: conformanceController,
  broker_child: async (request) => {
    const responseText = canonicalJsonV1(TEST_BASE_OUTPUT);
    return {
      state: "durable-intent-dispatched-once-trusted-sealed",
      request_sha256: request.request_sha256,
      durable_intent_sha256: sha256V1(`intent-${request.child_sequence}`),
      durable_dispatch_sha256: sha256V1(`dispatch-${request.child_sequence}`),
      sealed_result_sha256: sha256V1(`result-${request.child_sequence}`),
      response_text: responseText,
      response_text_sha256: sha256V1(responseText),
    };
  },
});
await recordRc7GateCTreatmentProofProviderFreeConformance(TEST_CONFORMANCE.rlm, TEST_CONFORMANCE.ledger);
after(() => rm(CONFORMANCE_BASE, { recursive: true, force: true }));

async function roots(t) {
  const base = await mkdtemp(path.join(tmpdir(), "rc7-treatment-proof-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const value = { base };
  for (const name of ["freeze-a", "freeze-b", "ledger", "results", "rlm"]) {
    value[name.replace("-", "_")] = path.join(base, name);
    await mkdir(path.join(base, name));
  }
  value.conformance_rlm = TEST_CONFORMANCE.rlm;
  value.conformance_ledger = TEST_CONFORMANCE.ledger;
  return value;
}

function topInput() {
  return { run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "top-level", child_sequence: 0, child_question: null, excerpt_locator: null };
}

function redigest(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  copy[field] = sha256V1(canonicalJsonV1(copy));
  return copy;
}

test("the proof combined-artifact digest covers the exact one-LF canonical bytes", () => {
  const routeOutput = {
    case_id: "LAB-01",
    completion: "incomplete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
    schema_version: "rc7-gate-c-signature-output-v1",
  };
  const expected = sha256V1(canonicalJsonV1(routeOutput));
  assert.equal(__test.combinedArtifactSha256(routeOutput), expected);
  assert.notEqual(expected, sha256V1(`${canonicalJsonV1(routeOutput)}\n`));
});

async function approveAndInitialize(value) {
  const freeze = await prepareRc7GateCTreatmentProofFreeze(
    value.freeze_a, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
  );
  await recordRc7GateCTreatmentProofApproval(value.ledger, {
    results_root: value.results,
    rlm_root: value.rlm,
    conformance_rlm_root: value.conformance_rlm,
    conformance_ledger_root: value.conformance_ledger,
    freeze_sha256: freeze.freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    exact_approval_text: freeze.exact_approval_text,
  });
  await initializeRc7GateCTreatmentProofLedger(value.ledger);
  return freeze;
}

test("two fresh freezes are byte-identical and grant no live authority", async (t) => {
  const value = await roots(t);
  const first = await prepareRc7GateCTreatmentProofFreeze(
    value.freeze_a, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
  );
  const second = await prepareRc7GateCTreatmentProofFreeze(
    value.freeze_b, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
  );
  assert.equal(first.closure_sha256, second.closure_sha256);
  assert.equal(first.freeze_sha256, second.freeze_sha256);
  assert.deepEqual(
    await readFile(path.join(value.freeze_a, RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME)),
    await readFile(path.join(value.freeze_b, RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME)),
  );
  const retained = JSON.parse(await readFile(path.join(value.freeze_a, RC7_GATE_C_TREATMENT_PROOF_FREEZE_NAME), "utf8"));
  assert.deepEqual(retained.accounting, { provider_calls: 0, credential_accesses: 0, network_requests: 0, rlm_executions: 0, docker_invocations: 0, external_mutations: 0 });
  assert.deepEqual(retained.closure.provider_free_rlm_conformance.accounting, {
    provider_calls: 0,
    oauth_refresh_posts: 0,
    credential_accesses: 0,
    external_network_requests: 0,
    synthetic_child_responses: 4,
    rlm_executions: 1,
    docker_executions: 1,
  });
  assert.equal(retained.closure.provider_free_rlm_conformance.image_id, RC7_GATE_C_RLM_IMAGE_ID);
  assert.equal(retained.closure.provider_free_rlm_conformance.child_request_count, 4);
  assert.equal(retained.closure.provider_free_rlm_conformance.cleanup_residue_entries, 0);
  assert.equal(retained.closure.provider_free_rlm_conformance.python_code_byte_ceiling, 16_384);
  assert.equal(retained.closure.provider_free_rlm_conformance.route_output_byte_ceiling, 65_536);
  assert.equal(retained.closure.provider_free_rlm_conformance.exchange_package_byte_ceiling, 131_072);
  assert.equal(retained.closure.budget.total_generation_reservations, 6);
  assert.equal(retained.closure.budget.logical_generation_requests, 5);
  assert.equal(retained.closure.budget.global_transient_replacement_reservations, 1);
  assert.equal(retained.closure.budget.hard_output_plus_reasoning_authority_total, 6 * 128_000);
  assert.equal(retained.closure.budget.maximum_discarded_replay_state_utf8_bytes_per_request, 1_048_576);
  assert.equal(retained.closure.budget.maximum_discarded_replay_state_utf8_bytes_total, 6 * 1_048_576);
  assert.equal(retained.closure.budget.maximum_stream_block_index, 65_535);
  assert.equal(retained.closure.budget.maximum_stream_chunks_per_response, 65_536);
  assert.equal(retained.closure.budget.maximum_provider_active_seconds_per_request, 300);
  assert.equal(retained.closure.budget.top_level_provider_active_seconds, 300);
  assert.equal(retained.closure.budget.recursive_child_provider_active_seconds_per_request, 120);
  assert.equal(retained.closure.budget.provider_active_seconds_total, 1_080);
  assert.equal(retained.closure.budget.replacement_backoff_milliseconds, 15_000);
  assert.deepEqual(retained.closure.budget.replaceable_failure_codes, [
    "PROVIDER_TERMINAL_ERROR_RATE_LIMIT",
    "PROVIDER_TERMINAL_ERROR_TIMEOUT",
    "PROVIDER_TERMINAL_ERROR_UNAVAILABLE",
  ]);
  assert.equal(retained.closure.supersession.prior_proofs.length, 14);
  assert.deepEqual(retained.closure.supersession.prior_proofs.at(-1), {
    closure_sha256: "8c0d7c67449361ef60331d826432ee358f9513bf9d4611a8d897e9951823443b",
    activation_sha256: "473f21a408592c4d433730a8945ca482820958d32d27fc56acc537db7d26ad5a",
    terminal_sha256: "9e0d781d8a40aa0f139a25c697e441dc9294ac08d3fb9405aab2f399810be6f0",
    state: "indeterminate-no-replay-after-trusted-top-level-with-unbound-rlm-program-oversized-before-container",
    roots: retained.closure.supersession.prior_proofs.at(-1).roots,
    reservations: 1,
    durable_handoffs: 1,
    provider_posts: 1,
    refresh_posts: 0,
    provider_active_milliseconds: 184_816,
    child_requests: 0,
    rlm_executions: 0,
    docker_invocations: 0,
  });
  assert.equal(retained.closure.run.matrix_member, false);
  assert.equal(retained.closure.run.score_bearing, false);
});

test("missing or tampered provider-free conformance evidence denies freeze and activation", async (t) => {
  const value = await roots(t);
  const manifestPath = path.join(value.conformance_ledger, RC7_GATE_C_TREATMENT_PROOF_CONFORMANCE_NAME);
  const originalBytes = await readFile(manifestPath);

  await rm(manifestPath);
  try {
    await assert.rejects(
      prepareRc7GateCTreatmentProofFreeze(
        value.freeze_a, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
      ),
      (error) => error.code === "TREATMENT_PROOF_CONFORMANCE_MISMATCH",
    );
  } finally {
    await writeFile(manifestPath, originalBytes, { flag: "wx" });
  }

  const freeze = await prepareRc7GateCTreatmentProofFreeze(
    value.freeze_a, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
  );
  await recordRc7GateCTreatmentProofApproval(value.ledger, {
    results_root: value.results,
    rlm_root: value.rlm,
    conformance_rlm_root: value.conformance_rlm,
    conformance_ledger_root: value.conformance_ledger,
    freeze_sha256: freeze.freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    exact_approval_text: freeze.exact_approval_text,
  });

  const tampered = JSON.parse(originalBytes.toString("utf8"));
  tampered.cleanup_residue_entries = 1;
  await writeFile(manifestPath, canonicalRecordBytes(tampered));
  try {
    await assert.rejects(
      initializeRc7GateCTreatmentProofLedger(value.ledger),
      (error) => error.code === "TREATMENT_PROOF_CONFORMANCE_MISMATCH",
    );
  } finally {
    await writeFile(manifestPath, originalBytes);
  }
});

test("superseded ledger, results, and RLM roots cannot be reused, recreated, or identity-substituted", () => {
  assert.equal(Object.isFrozen(__test.SUPERSEDED_TREATMENT_PROOFS), true);
  assert.equal(Object.isFrozen(__test.SUPERSEDED_TREATMENT_PROOFS[0]), true);
  assert.equal(Object.isFrozen(__test.SUPERSEDED_TREATMENT_PROOFS[0].roots), true);
  assert.equal(Object.isFrozen(__test.SUPERSEDED_TREATMENT_PROOFS[0].roots.ledger), true);
  const current = structuredClone(__test.SUPERSEDED_TREATMENT_PROOFS.at(-1).roots);
  assert.throws(() => __test.assertFreshTreatmentProofRoots(current), (error) => error.code === "SUPERSEDED_TREATMENT_PROOF_ROOT");

  const recreatedPath = structuredClone(current);
  for (const root of Object.values(recreatedPath)) {
    root.device_id = "1";
    root.file_id = "2";
    root.birthtime_ns = "3";
    root.root_sha256 = "a".repeat(64);
  }
  assert.throws(() => __test.assertFreshTreatmentProofRoots(recreatedPath), (error) => error.code === "SUPERSEDED_TREATMENT_PROOF_ROOT");

  const substitutedIdentity = structuredClone(current);
  for (const [index, root] of Object.values(substitutedIdentity).entries()) {
    root.normalized_physical_root = `f:\\external\\fresh-proof-${index}`;
    root.root_sha256 = String(index + 1).repeat(64);
  }
  assert.throws(() => __test.assertFreshTreatmentProofRoots(substitutedIdentity), (error) => error.code === "SUPERSEDED_TREATMENT_PROOF_ROOT");
});

test("the real capsule validator and accepted-broker selector preserve the proof-only usage ceiling", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const permit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  const dispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit });
  const sealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: dispatch.dispatch_sha256, request: top });
  assert.equal(dispatch.replacement_ordinal, 0);
  assert.equal(
    liveCapsuleTest.createStreamStateForAcceptedBroker({ sealed: { intent: sealed.intent }, dispatch }).output_plus_reasoning_token_ceiling,
    RC7_GATE_C_TREATMENT_PROOF_MAX_OUTPUT_PLUS_REASONING_TOKENS,
  );

  const capsuleUrl = new URL("../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", import.meta.url).href;
  const encodedDispatch = Buffer.from(JSON.stringify(dispatch), "utf8").toString("base64url");
  const source = [
    `const capsule = await import(${JSON.stringify(capsuleUrl)});`,
    `const dispatch = JSON.parse(Buffer.from(${JSON.stringify(encodedDispatch)}, "base64url").toString("utf8"));`,
    "const accepted = capsule.__test.validateDispatch(dispatch);",
    'process.stdout.write(JSON.stringify({ dispatch_sha256: accepted.dispatch_sha256, replacement_ordinal: accepted.replacement_ordinal }) + "\\n");',
  ].join("\n");
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: value.base,
    env: { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const exit = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  assert.deepEqual(exit, { code: 0, signal: null });
  assert.equal(Buffer.concat(stderr).toString("utf8"), "");
  assert.deepEqual(JSON.parse(Buffer.concat(stdout).toString("utf8")), {
    dispatch_sha256: dispatch.dispatch_sha256,
    replacement_ordinal: 0,
  });
});

test("one validated provider failure is durably sealed without prose or replay authority", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const permit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  const dispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit });
  const sealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: dispatch.dispatch_sha256, request: top });
  const gateB = buildRc7GateCGateBReference({ activation_sha256: dispatch.activation_sha256, intent: top.intent, dispatch, container_id: null });
  await preflightRc7GateCTreatmentProofLiveDispatch({
    ledger_root: value.ledger,
    sealed_request: sealed,
    dispatch_sha256: dispatch.dispatch_sha256,
    gate_b_attestation: gateB,
    handoff_nonce: "2".repeat(64),
  });
  const accounting = executorTest.closedFailureAccounting({
    code: "MALFORMED_STREAM",
    details: {
      terminal_kind: null,
      provider_failure_code: null,
      integration_failure_phase: null,
      stream_failure_phase: "BLOCK_INDEX",
      observations: { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 76_844, automatic_retry_count: 0 },
    },
  });
  const terminal = await closeRc7GateCTreatmentProofReservation(value.ledger, dispatch, {
    state: "indeterminate-no-replay",
    sealed_result: null,
    accounting,
  });
  assert.equal(terminal.accounting.failure_code, "MALFORMED_STREAM_BLOCK_INDEX");
  assert.deepEqual(terminal.accounting.observations, { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 76_844, automatic_retry_count: 0 });
  assert.equal(terminal.replay_permitted, false);
  assert.doesNotMatch(JSON.stringify(terminal), /provider prose|request[_ -]?id|reasoning|replayState/iu);
  await assert.rejects(
    authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent),
    (error) => error.code === "TREATMENT_PROOF_NO_REPLAY",
  );
  assert.equal((await inspectRc7GateCTreatmentProofLedger(value.ledger)).state, "stopped-no-replay");
});

test("approval is exact, reservations are ordered, and an indeterminate child stops continuation without replay", async (t) => {
  const value = await roots(t);
  const freeze = await prepareRc7GateCTreatmentProofFreeze(
    value.freeze_a, value.ledger, value.results, value.rlm, value.conformance_rlm, value.conformance_ledger,
  );
  await assert.rejects(
    recordRc7GateCTreatmentProofApproval(value.ledger, {
      results_root: value.results, rlm_root: value.rlm,
      conformance_rlm_root: value.conformance_rlm, conformance_ledger_root: value.conformance_ledger,
      freeze_sha256: "0".repeat(64),
      future_activation_sha256: freeze.future_activation_sha256, exact_approval_text: freeze.exact_approval_text,
    }),
    (error) => error.code === "TREATMENT_PROOF_APPROVAL_REQUIRED",
  );
  await recordRc7GateCTreatmentProofApproval(value.ledger, {
    results_root: value.results, rlm_root: value.rlm,
    conformance_rlm_root: value.conformance_rlm, conformance_ledger_root: value.conformance_ledger,
    freeze_sha256: freeze.freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256, exact_approval_text: freeze.exact_approval_text,
  });
  await initializeRc7GateCTreatmentProofLedger(value.ledger);

  const specs = (await import("../../lib/recursus/rc7-rlm-gate-c-treatment-spec.mjs")).buildRc7GateCRlmChildSpecs;
  const firstSpec = (await specs("LAB-01"))[0];
  const childOne = await buildRc7GateCTreatmentProofRequest({
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "recursive-child", child_sequence: 1,
    child_question: firstSpec.child_question, excerpt_locator: firstSpec.excerpt_locator,
  });
  await assert.rejects(
    authorizeRc7GateCTreatmentProofDispatch(value.ledger, childOne.intent),
    (error) => error.code === "TREATMENT_PROOF_ORDER_MISMATCH",
  );

  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const topPermit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  const topDispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit: topPermit });
  const topSealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: topDispatch.dispatch_sha256, request: top });
  const gateB = buildRc7GateCGateBReference({ activation_sha256: topDispatch.activation_sha256, intent: top.intent, dispatch: topDispatch, container_id: null });
  const preflight = await preflightRc7GateCTreatmentProofLiveDispatch({
    ledger_root: value.ledger, sealed_request: topSealed, dispatch_sha256: topDispatch.dispatch_sha256,
    gate_b_attestation: gateB, handoff_nonce: "1".repeat(64),
  });
  const topResult = buildRc7GateCTreatmentProofSealedResult({
    activation_sha256: topDispatch.activation_sha256, intent_sha256: topDispatch.intent_sha256,
    permit_sha256: topDispatch.permit_sha256, dispatch_nonce: topDispatch.dispatch_nonce,
    artifact_sha256: "a".repeat(64), usage_sha256: "b".repeat(64), provenance_sha256: "c".repeat(64),
    permission_sha256: "d".repeat(64), authority_sha256: "e".repeat(64), cleanup_sha256: "f".repeat(64),
  });
  await closeRc7GateCTreatmentProofReservation(value.ledger, topDispatch, {
    state: "trusted-sealed", sealed_result: topResult,
    accounting: { gate_b: preflight.gate_b, observations: { provider_posts: 1 }, usage: { input_tokens: 1, output_tokens: 1 } },
  });

  const childPermit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, childOne.intent);
  const forgedIntent = redigest({
    ...childOne.intent,
    semantic_request_sha256: top.intent.semantic_request_sha256,
    semantic_request_byte_count: top.intent.semantic_request_byte_count,
  }, "intent_sha256");
  const forgedPermit = redigest({
    ...childPermit,
    intent_sha256: forgedIntent.intent_sha256,
    semantic_request_sha256: forgedIntent.semantic_request_sha256,
    semantic_request_byte_count: forgedIntent.semantic_request_byte_count,
    dispatch_nonce: sha256V1(canonicalJsonV1({
      activation_sha256: freeze.future_activation_sha256,
      intent_sha256: forgedIntent.intent_sha256,
    })),
  }, "permit_sha256");
  await assert.rejects(
    consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: forgedIntent, permit: forgedPermit }),
    (error) => error.code === "TREATMENT_PROOF_REQUEST_DENIED",
  );
  const childDispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: childOne.intent, permit: childPermit });
  await closeRc7GateCTreatmentProofReservation(value.ledger, childDispatch, { state: "indeterminate-no-replay", sealed_result: null, accounting: null });
  const secondSpec = (await specs("LAB-01"))[1];
  const childTwo = await buildRc7GateCTreatmentProofRequest({
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "recursive-child", child_sequence: 2,
    child_question: secondSpec.child_question, excerpt_locator: secondSpec.excerpt_locator,
  });
  await assert.rejects(
    authorizeRc7GateCTreatmentProofDispatch(value.ledger, childTwo.intent),
    (error) => error.code === "TREATMENT_PROOF_NO_REPLAY",
  );
  const inspection = await inspectRc7GateCTreatmentProofLedger(value.ledger);
  assert.deepEqual({ reservations: inspection.reservations, terminals: inspection.terminals, handoffs: inspection.durable_handoffs, active: inspection.active },
    { reservations: 2, terminals: 2, handoffs: 1, active: false });
});

test("request family rejects generic, direct, fifth-child, and altered registered-child inputs", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  await assert.rejects(buildRc7GateCTreatmentProofRequest({ run_id: "0".repeat(64), request_kind: "top-level", child_sequence: 0, child_question: null, excerpt_locator: null }), (error) => error.code === "TREATMENT_PROOF_REQUEST_DENIED");
  await assert.rejects(buildRc7GateCTreatmentProofRequest({ run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "recursive-child", child_sequence: 5, child_question: "x", excerpt_locator: null }), (error) => error.code === "TREATMENT_PROOF_REQUEST_DENIED");
  const specs = await import("../../lib/recursus/rc7-rlm-gate-c-treatment-spec.mjs").then((module) => module.buildRc7GateCRlmChildSpecs("LAB-01"));
  await assert.rejects(buildRc7GateCTreatmentProofRequest({
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "recursive-child", child_sequence: 1,
    child_question: `${specs[0].child_question} widened`, excerpt_locator: specs[0].excerpt_locator,
  }), (error) => error.code === "TREATMENT_PROOF_REQUEST_DENIED");
});

test("recovery converts an interrupted active reservation to one immutable no-replay terminal", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const permit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit });
  const first = await recoverRc7GateCTreatmentProofLedger(value.ledger);
  assert.equal(first.changed, true);
  assert.equal(first.state, "recovered-indeterminate-no-replay");
  const second = await recoverRc7GateCTreatmentProofLedger(value.ledger);
  assert.deepEqual({ changed: second.changed, state: second.state, replay_permitted: second.replay_permitted },
    { changed: false, state: "stopped-no-replay", replay_permitted: false });
  await assert.rejects(
    consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit }),
    (error) => ["TREATMENT_PROOF_NO_REPLAY", "TREATMENT_PROOF_ORDER_MISMATCH"].includes(error.code),
  );
});

test("one transient terminal permits exactly one fresh global replacement and any later failure stops", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const firstPermit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  const firstDispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit: firstPermit });
  const firstSealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: firstDispatch.dispatch_sha256, request: top });
  const firstGateB = buildRc7GateCGateBReference({ activation_sha256: firstDispatch.activation_sha256, intent: top.intent, dispatch: firstDispatch, container_id: null });
  await preflightRc7GateCTreatmentProofLiveDispatch({
    ledger_root: value.ledger, sealed_request: firstSealed, dispatch_sha256: firstDispatch.dispatch_sha256,
    gate_b_attestation: firstGateB, handoff_nonce: "3".repeat(64),
  });
  const unavailable = executorTest.closedFailureAccounting({
    code: "PROVIDER_TERMINAL_REJECTED",
    details: {
      terminal_kind: "error", provider_failure_code: "UNAVAILABLE", integration_failure_phase: null,
      stream_failure_phase: null,
      observations: { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 793, automatic_retry_count: 0 },
    },
  });
  await closeRc7GateCTreatmentProofReservation(value.ledger, firstDispatch, {
    state: "indeterminate-no-replay", sealed_result: null, accounting: unavailable,
  });
  assert.equal((await inspectRc7GateCTreatmentProofLedger(value.ledger)).state, "replacement-available");

  const replacementPermit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  assert.notEqual(replacementPermit.dispatch_nonce, firstPermit.dispatch_nonce);
  const replacementDispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit: replacementPermit });
  assert.equal(replacementDispatch.reservation_ordinal, 2);
  assert.equal(replacementDispatch.replacement_ordinal, 1);
  assert.notEqual(replacementDispatch.reservation_key, firstDispatch.reservation_key);
  const replacementSealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: replacementDispatch.dispatch_sha256, request: top });
  const replacementGateB = buildRc7GateCGateBReference({ activation_sha256: replacementDispatch.activation_sha256, intent: top.intent, dispatch: replacementDispatch, container_id: null });
  const replacementPreflight = await preflightRc7GateCTreatmentProofLiveDispatch({
    ledger_root: value.ledger, sealed_request: replacementSealed, dispatch_sha256: replacementDispatch.dispatch_sha256,
    gate_b_attestation: replacementGateB, handoff_nonce: "4".repeat(64),
  });
  const replacementResult = buildRc7GateCTreatmentProofSealedResult({
    activation_sha256: replacementDispatch.activation_sha256, intent_sha256: replacementDispatch.intent_sha256,
    permit_sha256: replacementDispatch.permit_sha256, dispatch_nonce: replacementDispatch.dispatch_nonce,
    artifact_sha256: "1".repeat(64), usage_sha256: "2".repeat(64), provenance_sha256: "3".repeat(64),
    permission_sha256: "4".repeat(64), authority_sha256: "5".repeat(64), cleanup_sha256: "6".repeat(64),
  });
  await closeRc7GateCTreatmentProofReservation(value.ledger, replacementDispatch, {
    state: "trusted-sealed", sealed_result: replacementResult,
    accounting: { gate_b: replacementPreflight.gate_b, observations: { provider_posts: 1 }, usage: { input_tokens: 1, output_tokens: 1 } },
  });

  const firstSpec = await import("../../lib/recursus/rc7-rlm-gate-c-treatment-spec.mjs")
    .then((module) => module.buildRc7GateCRlmChildSpecs("LAB-01"))
    .then((specs) => specs[0]);
  const child = await buildRc7GateCTreatmentProofRequest({
    run_id: RC7_GATE_C_TREATMENT_PROOF_RUN_ID, request_kind: "recursive-child", child_sequence: 1,
    child_question: firstSpec.child_question, excerpt_locator: firstSpec.excerpt_locator,
  });
  const childPermit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, child.intent);
  const childDispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: child.intent, permit: childPermit });
  assert.equal(childDispatch.replacement_ordinal, 0);
  await closeRc7GateCTreatmentProofReservation(value.ledger, childDispatch, {
    state: "indeterminate-no-replay", sealed_result: null, accounting: null,
  });
  await assert.rejects(
    authorizeRc7GateCTreatmentProofDispatch(value.ledger, child.intent),
    (error) => error.code === "TREATMENT_PROOF_NO_REPLAY",
  );
  const inspection = await inspectRc7GateCTreatmentProofLedger(value.ledger);
  assert.deepEqual({ state: inspection.state, reservations: inspection.reservations, replacement_reservations: inspection.replacement_reservations },
    { state: "stopped-no-replay", reservations: 3, replacement_reservations: 1 });
});

test("retained terminal identity and closed accounting are revalidated before replacement authority", async (t) => {
  const value = await roots(t);
  await approveAndInitialize(value);
  const top = await buildRc7GateCTreatmentProofRequest(topInput());
  const permit = await authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent);
  const dispatch = await consumeRc7GateCTreatmentProofReservation(value.ledger, { intent: top.intent, permit });
  const sealed = await sealRc7GateCTreatmentProofRequest(value.ledger, { dispatch_sha256: dispatch.dispatch_sha256, request: top });
  const gateB = buildRc7GateCGateBReference({ activation_sha256: dispatch.activation_sha256, intent: top.intent, dispatch, container_id: null });
  await preflightRc7GateCTreatmentProofLiveDispatch({
    ledger_root: value.ledger, sealed_request: sealed, dispatch_sha256: dispatch.dispatch_sha256,
    gate_b_attestation: gateB, handoff_nonce: "9".repeat(64),
  });
  const authentication = executorTest.closedFailureAccounting({
    code: "PROVIDER_TERMINAL_REJECTED",
    details: {
      terminal_kind: "error", provider_failure_code: "AUTH", integration_failure_phase: null,
      stream_failure_phase: null,
      observations: { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 10, automatic_retry_count: 0 },
    },
  });
  await closeRc7GateCTreatmentProofReservation(value.ledger, dispatch, {
    state: "indeterminate-no-replay", sealed_result: null, accounting: authentication,
  });
  const terminalPath = path.join(value.ledger, "terminals", `${dispatch.reservation_key}.json`);
  const tampered = JSON.parse(await readFile(terminalPath, "utf8"));
  tampered.accounting.failure_code = "PROVIDER_TERMINAL_ERROR_UNAVAILABLE";
  const recomputed = redigest(tampered, "terminal_sha256");
  await writeFile(terminalPath, `${canonicalJsonV1(recomputed)}\n`, "utf8");
  await assert.rejects(
    authorizeRc7GateCTreatmentProofDispatch(value.ledger, top.intent),
    (error) => error.code === "TREATMENT_PROOF_RESULT_MISMATCH",
  );
});

test("the treatment-proof CLI applies one retained-failure wall to both run and recover", async () => {
  const source = await readFile(new URL("../../scripts/recursus/rc7-rlm-gate-c-treatment-proof.mjs", import.meta.url), "utf8");
  const hardWallIndex = source.indexOf('const hardWall = ["run", "recover"].includes(input.command)');
  const runIndex = source.indexOf('input.command === "run"');
  const recoverIndex = source.indexOf('input.command === "recover"');
  const clearIndex = source.indexOf('if (hardWall !== null) clearTimeout(hardWall)');
  assert.ok(hardWallIndex > 0 && runIndex > hardWallIndex && recoverIndex > runIndex && clearIndex > recoverIndex);
  assert.equal(source.includes("RC7_GATE_C_TREATMENT_PROOF_RETAINED_FAILURE_WALL_CEILING_MS"), true);
});
