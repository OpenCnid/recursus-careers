import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, link, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { OrchestratedResearchError, __test as foundationTest } from "../../lib/recursus/orchestrated-research.mjs";
import {
  STAGE2_ACTIONS,
  STAGE2_FAULTS,
  STAGE2_PERMISSION_ID,
  __test,
  decideActionAdmission,
  exerciseStage2,
  inspectStage2,
  normalizedStage2PreparationBytes,
  parseOrchestratorAction,
  prepareStage2,
  recoverStage2,
  validateOrchestratorAction,
  validateStage2Ledger,
} from "../../lib/recursus/orchestrated-research-stage2.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const execFileAsync = promisify(execFile);
const TEMP_PARENTS = [];
let baseline;

async function newRoot(name = "root") {
  const parent = await mkdtemp(path.join(tmpdir(), "orchestrated-research-stage2-test-"));
  TEMP_PARENTS.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function readJson(target) {
  return JSON.parse(await readFile(target, "utf8"));
}

async function expectCode(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof OrchestratedResearchError, String(error));
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function reseal(entries) {
  let previous = "0".repeat(64);
  return entries.map((entry, index) => {
    const sealed = __test.sealEntry(index + 1, previous, entry.kind, structuredClone(entry.payload));
    previous = sealed.entry_digest;
    return sealed;
  });
}

before(async () => {
  baseline = await newRoot("baseline");
  await prepareStage2(baseline.root);
});

after(async () => {
  for (const target of TEMP_PARENTS) {
    const resolved = path.resolve(target);
    assert.ok(resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.match(path.basename(resolved), /^orchestrated-research-stage2-test-/u);
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

test("closed action flow exercises direct work, RLM denials and failures, fallback, synthesis, stop, and exact zero-authority accounting", async () => {
  const inspection = await inspectStage2(baseline.root);
  assert.equal(inspection.state, "complete");
  assert.equal(inspection.decision, "FOUNDATION_CONFORMANT");
  assert.equal(inspection.operation_dispatches, 4);
  assert.deepEqual(inspection.circuit, { state: "open", equivalent_failures: 2, reason: "two-consecutive-equivalent-failures" });

  const registration = await readJson(path.join(baseline.root, "registration.json"));
  assert.equal(registration.permission_contract.identity, STAGE2_PERMISSION_ID);
  assert.deepEqual(registration.action_grammar_identity.kinds, STAGE2_ACTIONS);
  const accounting = await readJson(path.join(baseline.root, "accounting.json"));
  assert.deepEqual(accounting, {
    accepted_evidence: 2,
    circuit_open_events: 1,
    cleanup_failures: 0,
    credential_accesses: 0,
    denied_actions: 2,
    docker_invocations: 0,
    external_mutations: 0,
    fake_direct_dispatches: 2,
    fake_operation_dispatches: 4,
    fake_rlm_dispatches: 2,
    network_actions: 0,
    operation_terminals: 4,
    producer: "lib/recursus/orchestrated-research-stage2.mjs",
    provenance: "validated-host-ledger-counts",
    provider_requests: 0,
    rejected_evidence: 1,
    residue_count: 0,
    retries: 0,
    rlm_executions: 0,
    schema_version: "orchestrated-research-stage2-accounting-v1",
    terminal_decisions: 1,
    wsl_invocations: 0,
  });
});

test("ledger proves every closed action was proposed but only distinct host admissions became executable", async () => {
  const ledger = await __test.readLedger(baseline.root);
  const proposed = ledger.entries.filter((entry) => entry.kind === "ACTION_PROPOSED").map((entry) => entry.payload.action);
  assert.deepEqual([...new Set(proposed.map((action) => action.kind))].sort(), [...STAGE2_ACTIONS].sort());
  const admissions = ledger.entries.filter((entry) => entry.kind === "OPERATION_ADMITTED");
  const dispatches = ledger.entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED");
  assert.equal(admissions.length, 4);
  assert.equal(dispatches.length, 4);
  for (const dispatch of dispatches) assert.ok(admissions.some((admission) => admission.payload.operation_id === dispatch.payload.operation_id));
  assert.equal(admissions.filter((entry) => entry.payload.operation_kind === "REQUEST_RLM_OPERATION").length, 2);
  const denied = ledger.entries.filter((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.admission_status === "denied");
  assert.equal(denied.find((entry) => entry.payload.action_id === "S2-A03").payload.reason, "RLM_NOT_ELIGIBLE");
  assert.equal(denied.find((entry) => entry.payload.action_id === "S2-A06").payload.reason, "CIRCUIT_OPEN");
  assert.equal(ledger.entries.find((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.action_id === "S2-A04").payload.circuit.state, "closed");
  assert.equal(ledger.entries.find((entry) => entry.kind === "DECISION_RECORDED" && entry.payload.action_id === "S2-A05").payload.circuit.state, "open");
  assert.ok(admissions.some((entry) => entry.payload.operation_id === "S2-OP-DIRECT-LAB-FALLBACK"));
});

test("route-visible inputs contain source bytes but no evaluator truth, alternate route, eligibility, path, or host-authority bytes", async () => {
  const inputs = await __test.loadInputs();
  for (const action of inputs.actions.actions) {
    const orchestratorText = await readFile(path.join(baseline.root, "orchestrator", action.action_id, "input.json"), "utf8");
    for (const forbidden of [inputs.evaluator.leak_canary, inputs.evaluator.alternate_route_canary, "evaluator_only", "expected_synthesis_evidence_ids", "rlm_eligible_case_ids", "physical_root_binding", '"circuit"', "rejected_evidence_summaries"]) assert.equal(orchestratorText.includes(forbidden), false, `${action.action_id}: ${forbidden}`);
  }
  for (const operationId of ["S2-OP-DIRECT-FACT-01", "S2-OP-RLM-LAB-01", "S2-OP-RLM-LAB-02", "S2-OP-DIRECT-LAB-FALLBACK"]) {
    const operationText = await readFile(path.join(baseline.root, "operations", operationId, "input.json"), "utf8");
    assert.match(operationText, /"source_projection"/u);
    assert.match(operationText, /"bytes_utf8"/u);
    for (const forbidden of [inputs.evaluator.leak_canary, inputs.evaluator.alternate_route_canary, "evaluator_only", "expected_synthesis_evidence_ids", "rlm_eligible_case_ids", "physical_root_binding"]) assert.equal(operationText.includes(forbidden), false, `${operationId}: ${forbidden}`);
  }
});

test("closed parser and admission gate reject unknown, smuggled, self-authorizing, over-budget, recursive, stale, concurrent, and unregistered proposals", async () => {
  const inputs = await __test.loadInputs();
  const direct = structuredClone(inputs.actions.actions[0]);
  const rlm = structuredClone(inputs.actions.actions.find((action) => action.action_id === "S2-A04"));
  assert.throws(() => validateOrchestratorAction({ ...direct, kind: "EXECUTE_SHELL" }), { code: "UNKNOWN_ACTION" });
  assert.throws(() => validateOrchestratorAction({ ...direct, admitted: true }), { code: "UNKNOWN_OR_MISSING_FIELD" });
  assert.throws(() => validateOrchestratorAction({ ...direct, objective_id: "smuggle REQUEST_RLM_OPERATION" }), { code: "ACTION_SMUGGLING" });
  assert.throws(() => validateOrchestratorAction({ ...direct, limits: { ...direct.limits, max_wall_ms: direct.limits.max_wall_ms + 1 } }), { code: "BUDGET_EXPANSION_DENIED" });
  assert.throws(() => validateOrchestratorAction({ ...rlm, recursive_depth: 2 }), { code: "RECURSIVE_DEPTH_DENIED" });
  assert.throws(() => parseOrchestratorAction('{"kind":"STOP","kind":"REQUEST_RLM_OPERATION"}'), { code: "DUPLICATE_JSON_KEY" });

  const baseState = { checkpoint_id: direct.checkpoint_id, active_operation: null, used_operation_ids: new Set(), gaps: [], circuit: { state: "closed" }, rlm_eligible_case_ids: ["LAB-01"] };
  assert.equal(decideActionAdmission(direct, { ...baseState, checkpoint_id: "S2-CHECKPOINT-9999" }).reason, "STALE_CHECKPOINT");
  assert.equal(decideActionAdmission(direct, { ...baseState, active_operation: "S2-OP-OTHER" }).reason, "CONCURRENT_OPERATION_DENIED");
  assert.equal(decideActionAdmission(direct, { ...baseState, fake_operation_dispatches: 4 }).reason, "OPERATION_BUDGET_EXHAUSTED");
  assert.equal(decideActionAdmission({ ...direct, operation_id: "S2-OP-UNREGISTERED" }, baseState).reason, "UNREGISTERED_OR_MISMATCHED_OPERATION");
});

test("candidate-fact safety, append-only ordering, single-operation state, and rejected-evidence exclusion survive ledger reconstruction", async () => {
  const ledger = await __test.readLedger(baseline.root);
  assert.equal(ledger.operations.size, 4);
  assert.ok([...ledger.operations.values()].every((state) => state === "terminal"));
  const accepted = ledger.entries.filter((entry) => entry.kind === "EVIDENCE_ACCEPTED").map((entry) => entry.payload.evidence.evidence_id).sort();
  const rejected = ledger.entries.filter((entry) => entry.kind === "EVIDENCE_REJECTED").map((entry) => entry.payload.rejection.evidence_id).sort();
  assert.deepEqual(accepted, ["EVIDENCE-FACT01-CANDIDATE-01", "EVIDENCE-LAB-CANDIDATE-01"]);
  assert.deepEqual(rejected, ["EVIDENCE-FACT01-CANDIDATE-02"]);
  const result = await readJson(path.join(baseline.root, "result.json"));
  assert.deepEqual(result.accepted_evidence.map((item) => item.evidence_id).sort(), accepted);
  assert.deepEqual(result.rejected_evidence_ids, rejected);
  const checkpoint = await readJson(path.join(baseline.root, "checkpoint.json"));
  assert.equal(checkpoint.accepted_evidence_ids.includes(rejected[0]), false);
  for (const action of (await __test.loadInputs()).actions.actions.slice(1)) {
    const view = await readJson(path.join(baseline.root, "orchestrator", action.action_id, "input.json"));
    assert.equal(view.accepted_evidence.some((item) => item.evidence_id === rejected[0]), false, action.action_id);
  }

  const missingAdmissionIndex = ledger.entries.findIndex((entry) => entry.kind === "OPERATION_ADMITTED");
  assert.throws(() => validateStage2Ledger(reseal(ledger.entries.filter((_, index) => index !== missingAdmissionIndex))), { code: "LEDGER_TRANSITION_INVALID" });
  const firstProposalIndex = ledger.entries.findIndex((entry) => entry.kind === "ACTION_PROPOSED");
  assert.throws(() => validateStage2Ledger(reseal(ledger.entries.filter((_, index) => index !== firstProposalIndex))), { code: "OPERATION_SELF_AUTHORIZATION" });
  const concurrentProposal = structuredClone(ledger.entries.find((entry) => entry.kind === "ACTION_PROPOSED" && entry.payload.action_id === "S2-A02"));
  assert.throws(() => validateStage2Ledger(reseal([...ledger.entries.slice(0, firstProposalIndex + 1), concurrentProposal, ...ledger.entries.slice(firstProposalIndex + 1)])), { code: "CONCURRENT_ACTION_DENIED" });
  const wrongWorker = structuredClone(ledger.entries);
  wrongWorker.find((entry) => entry.kind === "OPERATION_DISPATCHED").payload.worker_identity = "unregistered-worker";
  assert.throws(() => validateStage2Ledger(reseal(wrongWorker)), { code: "UNREGISTERED_WORKER" });
  const wrongDecision = structuredClone(ledger.entries);
  wrongDecision.find((entry) => entry.kind === "DECISION_RECORDED").payload.accepted_count += 1;
  assert.throws(() => validateStage2Ledger(reseal(wrongDecision)), { code: "DECISION_PROJECTION_MISMATCH" });
  const reappeared = structuredClone(ledger.entries);
  reappeared.find((entry) => entry.kind === "SYNTHESIS_ELIGIBLE").payload.accepted_evidence_ids.push(rejected[0]);
  assert.throws(() => validateStage2Ledger(reseal(reappeared)), { code: "REJECTED_EVIDENCE_REAPPEARED" });
});

test("each fake RLM failure class preserves prior accepted evidence and reaches fallback without prohibited accounting", async () => {
  for (const fault of STAGE2_FAULTS.filter((item) => item.startsWith("rlm-"))) {
    const target = await newRoot(`fault-${fault}`);
    const inspection = await exerciseStage2(target.root, fault);
    assert.equal(inspection.decision, "FOUNDATION_CONFORMANT", fault);
    const result = await readJson(path.join(target.root, "result.json"));
    assert.ok(result.accepted_evidence.some((item) => item.evidence_id === "EVIDENCE-FACT01-CANDIDATE-01"), fault);
    assert.ok(result.accepted_evidence.some((item) => item.evidence_id === "EVIDENCE-LAB-CANDIDATE-01"), fault);
    assert.equal(result.accepted_evidence.some((item) => result.rejected_evidence_ids.includes(item.evidence_id)), false, fault);
    const accounting = await readJson(path.join(target.root, "accounting.json"));
    for (const key of ["provider_requests", "credential_accesses", "rlm_executions", "network_actions", "docker_invocations", "wsl_invocations", "external_mutations", "retries", "cleanup_failures", "residue_count"]) assert.equal(accounting[key], 0, `${fault}: ${key}`);
    assert.ok(accounting.fake_operation_dispatches <= 4, fault);
  }
});

test("every interruption recovers without replay, repeated recovery is byte-idempotent, and accepted evidence is retained", async () => {
  for (const fault of STAGE2_FAULTS.filter((item) => !item.startsWith("rlm-"))) {
    const target = await newRoot(`interrupt-${fault}`);
    const partial = await exerciseStage2(target.root, fault);
    assert.equal(partial.fault, fault);
    const before = await __test.readLedger(target.root);
    const dispatchCounts = new Map();
    for (const entry of before.entries.filter((item) => item.kind === "OPERATION_DISPATCHED")) dispatchCounts.set(entry.payload.operation_id, (dispatchCounts.get(entry.payload.operation_id) ?? 0) + 1);
    const recovered = await recoverStage2(target.root);
    assert.equal(recovered.decision, "FOUNDATION_CONFORMANT", fault);
    assert.ok(recovered.accepted_evidence >= 2, fault);
    const finalLedger = await __test.readLedger(target.root);
    for (const [operationId, count] of dispatchCounts) assert.equal(finalLedger.entries.filter((entry) => entry.kind === "OPERATION_DISPATCHED" && entry.payload.operation_id === operationId).length, count, `${fault}: replayed ${operationId}`);
    const firstBytes = await normalizedStage2PreparationBytes(target.root);
    const repeated = await recoverStage2(target.root);
    const secondBytes = await normalizedStage2PreparationBytes(target.root);
    assert.equal(repeated.decision, "FOUNDATION_CONFORMANT", fault);
    assert.deepEqual(firstBytes, secondBytes, fault);
  }
});

test("concurrent recovery is excluded by the physical-root lock and later recovery remains single-terminal", async () => {
  const target = await newRoot("concurrent-recovery");
  await exerciseStage2(target.root, "after-operation-admission");
  const context = await foundationTest.validateDisposableRoot(target.root);
  const lock = await foundationTest.acquireRoot(context);
  try {
    await expectCode(() => recoverStage2(target.root), "ROOT_ALREADY_ACQUIRED");
  } finally {
    await foundationTest.releaseRoot(context, lock);
  }
  const recovered = await recoverStage2(target.root);
  assert.equal(recovered.decision, "FOUNDATION_CONFORMANT");
  const ledger = await __test.readLedger(target.root);
  assert.equal(ledger.entries.filter((entry) => entry.kind === "RUN_TERMINAL").length, 1);
});

test("two fresh provider-free preparations have byte-identical normalized captures", async () => {
  const second = await newRoot("second");
  await prepareStage2(second.root);
  const left = await normalizedStage2PreparationBytes(baseline.root);
  const right = await normalizedStage2PreparationBytes(second.root);
  assert.deepEqual(left, right);
  assert.equal(sha256V1(left), (await inspectStage2(second.root)).normalized_capture_sha256);
  assert.equal(left.includes(Buffer.from(baseline.root, "utf8")), false);
  assert.equal(right.includes(Buffer.from(second.root, "utf8")), false);
});

test("artifact substitution, hard links, residue, and root replacement fail closed", async (t) => {
  await t.test("registered run, route, permission, budget, evaluator, code, source, and plan identity drift", async () => {
    const target = await newRoot("identity-drift");
    await prepareStage2(target.root);
    const registrationPath = path.join(target.root, "registration.json");
    const originalRegistration = await readFile(registrationPath);
    const registration = JSON.parse(originalRegistration.toString("utf8"));
    const mutations = [
      (value) => { value.run_id = "OTHER-RUN"; },
      (value) => { value.route_id = "other-route"; },
      (value) => { value.permission_contract.identity = "other-permission"; },
      (value) => { value.budget_contract.max_fake_operation_dispatches += 1; },
      (value) => { value.evaluator_identity.sha256 = "f".repeat(64); },
      (value) => { value.code_identity.sha256 = "f".repeat(64); },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(registration);
      mutate(changed);
      await writeFile(registrationPath, canonicalJsonV1(changed));
      await expectCode(() => inspectStage2(target.root), "REGISTRATION_DRIFT");
      await writeFile(registrationPath, originalRegistration);
    }
    const manifestPath = path.join(target.root, "source-manifest.json");
    const originalManifest = await readFile(manifestPath);
    const manifest = JSON.parse(originalManifest.toString("utf8"));
    manifest.cases[0].sources[0].sha256 = "f".repeat(64);
    await writeFile(manifestPath, canonicalJsonV1(manifest));
    await expectCode(() => inspectStage2(target.root), "SOURCE_MANIFEST_DRIFT");
    await writeFile(manifestPath, originalManifest);
    const planPath = path.join(target.root, "plan.json");
    const originalPlan = await readFile(planPath);
    const plan = JSON.parse(originalPlan.toString("utf8"));
    plan.operation_ids.push("S2-OP-UNBOUNDED");
    await writeFile(planPath, canonicalJsonV1(plan));
    await expectCode(() => inspectStage2(target.root), "PLAN_DRIFT");
    await writeFile(planPath, originalPlan);
  });

  await t.test("ledger-bound action output substitution", async () => {
    const target = await newRoot("action-substitution");
    await prepareStage2(target.root);
    const outputPath = path.join(target.root, "orchestrator", "S2-A09", "output.json");
    const output = await readJson(outputPath);
    output.reason = "different-host-stop-reason";
    await writeFile(outputPath, canonicalJsonV1(output));
    await expectCode(() => inspectStage2(target.root), "ACTION_ARTIFACT_MISMATCH");
  });

  await t.test("hard-link substitution", async () => {
    const target = await newRoot("hardlink");
    await prepareStage2(target.root);
    const resultPath = path.join(target.root, "result.json");
    const copyPath = path.join(target.parent, "result-copy.json");
    await copyFile(resultPath, copyPath);
    await rm(resultPath);
    await link(copyPath, resultPath);
    await expectCode(() => inspectStage2(target.root), "ALIASED_ARTIFACT");
  });

  await t.test("unknown residue", async () => {
    const target = await newRoot("residue");
    await prepareStage2(target.root);
    await writeFile(path.join(target.root, "unregistered.bin"), "residue");
    await expectCode(() => inspectStage2(target.root), "UNREGISTERED_ARTIFACT");
  });

  if (process.platform === "win32") {
    await t.test("alternate data stream", async () => {
      const target = await newRoot("alternate-stream");
      await prepareStage2(target.root);
      await writeFile(`${path.join(target.root, "result.json")}:hidden`, "residue");
      await expectCode(() => inspectStage2(target.root), "ALTERNATE_DATA_STREAM");
    });
  }

  await t.test("physical root replacement", async () => {
    const target = await newRoot("replace-me");
    await exerciseStage2(target.root, "before-synthesis");
    const original = `${target.root}-original`;
    await rename(target.root, original);
    await mkdir(target.root);
    await expectCode(() => recoverStage2(target.root), "MISSING_ARTIFACT");
    assert.ok((await readFile(path.join(original, "registration.json"), "utf8")).includes("physical_root_binding"));
  });
});

test("CLI and implementation expose no authority-bearing or real execution seam", async () => {
  const repositoryRoot = path.resolve(path.dirname(__test.FIXTURE_ROOT), "..", "..", "..");
  const scriptPath = path.join(repositoryRoot, "scripts", "recursus", "orchestrated-research-stage2.mjs");
  await assert.rejects(execFileAsync(process.execPath, [scriptPath, "prepare", "--output-root", baseline.root, "--provider", "x"]), (error) => {
    assert.match(error.stderr, /PROHIBITED_AUTHORITY_ARGUMENT/u);
    return true;
  });
  await assert.rejects(execFileAsync(process.execPath, [scriptPath, "dispatch", "--output-root", baseline.root]), (error) => {
    assert.match(error.stderr, /USAGE/u);
    return true;
  });
  const library = await readFile(path.join(repositoryRoot, "lib", "recursus", "orchestrated-research-stage2.mjs"), "utf8");
  const script = await readFile(scriptPath, "utf8");
  for (const denied of ["node:http", "node:https", "node:net", "node:tls", "node:dns", "fetch(", "WebSocket", "docker.exe", "wsl.exe", "rc7-rlm-gate-c", "rc7-rlm-qualification.mjs\""]) {
    assert.equal(library.includes(denied), false, denied);
    assert.equal(script.includes(denied), false, denied);
  }
  assert.match(library, /powershell\.exe/u, "Windows physical inspection is the only spawned host process");
});
