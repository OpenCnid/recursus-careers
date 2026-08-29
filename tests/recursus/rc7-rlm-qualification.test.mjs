import assert from "node:assert/strict";
import { copyFile, link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  RC7_CASE_ORDER,
  RC7_INTERRUPTION_POINTS,
  RC7_PERMISSION_POLICY_ID,
  RC7_REGISTERED_FAULTS,
  Rc7QualificationError,
  __test,
  buildRc7QualificationPackage,
  inspectRc7Qualification,
  prepareRc7Qualification,
  recoverRc7Qualification,
  validateRc7QualificationPackage,
} from "../../lib/recursus/rc7-rlm-qualification.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const CREATED_TEMP_PARENTS = [];
const EXECUTED_FAULTS = new Set();

after(async () => {
  for (const target of CREATED_TEMP_PARENTS) {
    const normalized = path.resolve(target);
    assert.ok(normalized.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.match(path.basename(normalized), /^rc7-qualification-test-/u);
    await rm(normalized, { recursive: true, force: true });
  }
});

async function newRoot(name = "root") {
  const parent = await mkdtemp(path.join(tmpdir(), "rc7-qualification-test-"));
  CREATED_TEMP_PARENTS.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function expectCode(action, expectedCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof Rc7QualificationError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function resign(value) {
  value.qualification_sha256 = sha256V1(canonicalJsonV1(__test.packageProjection(value)));
  return value;
}

function faultTest(name, body) {
  test(`[fault:${name}]`, async () => {
    EXECUTED_FAULTS.add(name);
    await body();
  });
}

test("qualification package freezes six cases, one-variable parity, containment, and zero authority use", async () => {
  const value = await buildRc7QualificationPackage();
  assert.deepEqual(value.cases.map((item) => item.case_id), RC7_CASE_ORDER);
  assert.equal(value.cases.filter((item) => item.class === "eligible-hypothesis").length, 3);
  assert.equal(value.cases.filter((item) => item.class === "generic-control").length, 3);
  assert.equal(value.permission_policy.identity, RC7_PERMISSION_POLICY_ID);
  assert.equal(value.containment_plan.direct_python_is_os_authority_not_sandbox, true);
  assert.equal(value.containment_plan.status, "plan-only-unproven-gate-b-prerequisite");
  assert.equal(value.ablation_plan.top_level_attempt_count, 36);
  assert.equal(value.ablation_plan.rlm_only_difference.operating_system_authority, "externally-contained-treatment-only");
  assert.equal(value.planned_request_budget.recursive_child_requests_total_ceiling, 36);
  assert.deepEqual(value.accounting, {
    rlm_executions: 0,
    provider_calls: 0,
    simulated_provider_requests: 0,
    credential_accesses: 0,
    network_or_live_browsing_actions: 0,
    external_mutations: 0,
    wsl_invocations: 0,
    docker_invocations: 0,
    retained_artifacts: 1,
    terminal_decisions: 1,
    required_operator_steps: 1,
    cleanup_residue_entries: 0,
  });
  assert.equal(value.terminal_decision, "QUALIFIED_FOR_ABLATION");
});

test("eligible source packs have hidden twelve-item evaluators and no route-visible oracle bytes", async () => {
  for (const caseId of RC7_CASE_ORDER.slice(0, 3)) {
    const visible = await readFile(path.join(__test.FIXTURE_ROOT, "visible", `${caseId}.json`), "utf8");
    const evaluator = JSON.parse(await readFile(path.join(__test.FIXTURE_ROOT, "evaluator-only", `${caseId}.json`), "utf8"));
    assert.equal(evaluator.expected_relationships.length, 12);
    assert.doesNotMatch(visible, new RegExp(evaluator.leak_canary, "u"));
    for (const key of ["eligibility", "expected_relationships", "leak_canary", "metric", "preferred_route", "scoring"]) {
      assert.equal(Object.hasOwn(JSON.parse(visible), key), false);
    }
  }
});

test("two fresh preparations retain byte-identical normalized packages", async () => {
  const first = await newRoot("first");
  const second = await newRoot("second");
  const firstResult = await prepareRc7Qualification(first.root);
  const secondResult = await prepareRc7Qualification(second.root);
  const firstBytes = await readFile(firstResult.package_path);
  const secondBytes = await readFile(secondResult.package_path);
  assert.equal(firstResult.qualification_sha256, secondResult.qualification_sha256);
  assert.deepEqual(firstBytes, secondBytes);
  assert.deepEqual((await inspectRc7Qualification(first.root)).entries, [__test.PACKAGE_NAME]);
  assert.deepEqual((await inspectRc7Qualification(second.root)).entries, [__test.PACKAGE_NAME]);
});

test("the Gate A implementation import surface excludes execution and network modules", async () => {
  const library = await readFile(path.join(__test.REPOSITORY_ROOT, "lib/recursus/rc7-rlm-qualification.mjs"), "utf8");
  for (const denied of ["node:child_process", "node:http", "node:https", "node:net", "node:tls", "node:dns", "fetch(", "WebSocket", "process.env"]) {
    assert.equal(library.includes(denied), false, denied);
  }
});

faultTest("missing-path", async () => {
  const { parent } = await newRoot("existing");
  await expectCode(() => prepareRc7Qualification(path.join(parent, "missing")), "MISSING_OUTPUT_ROOT");
});

faultTest("nonempty-path", async () => {
  const { root } = await newRoot();
  await writeFile(path.join(root, "occupied.txt"), "occupied");
  await expectCode(() => prepareRc7Qualification(root), "NONEMPTY_OUTPUT_ROOT");
});

faultTest("repository-path", async () => {
  await expectCode(() => prepareRc7Qualification(__test.REPOSITORY_ROOT), "REPOSITORY_OUTPUT_ROOT");
});

faultTest("broad-path", async () => {
  await expectCode(() => prepareRc7Qualification(tmpdir()), "BROAD_OUTPUT_ROOT");
});

faultTest("aliased-path", async () => {
  const { parent, root } = await newRoot("junction-target");
  const junction = path.join(parent, "junction-alias");
  await symlink(root, junction, "junction");
  await expectCode(() => prepareRc7Qualification(junction), "ALIASED_OUTPUT_ROOT");
});

faultTest("overlapping-path", async () => {
  await expectCode(() => prepareRc7Qualification(path.dirname(__test.REPOSITORY_ROOT)), "REPOSITORY_OUTPUT_ROOT");
});

faultTest("user-layer-path", async () => {
  const { parent } = await newRoot("holder");
  await expectCode(() => prepareRc7Qualification(path.join(parent, "data", "attempt")), "PROTECTED_OUTPUT_ROOT");
  await expectCode(() => prepareRc7Qualification(path.join(homedir(), "AppData", "Local", "rc7-user-layer-root")), "PROTECTED_OUTPUT_ROOT");
});

faultTest("credential-like-path", async () => {
  const { parent } = await newRoot("holder");
  await expectCode(() => prepareRc7Qualification(path.join(parent, ".ssh", "attempt")), "PROTECTED_OUTPUT_ROOT");
});

const identityFaults = [
  ["missing-identity", (value) => { delete value.cases[0].route_visible_source_pack; }, "IDENTITY_SET_MISMATCH"],
  ["extra-identity", (value) => { value.cases[0].unexpected_identity = "denied"; }, "IDENTITY_SET_MISMATCH"],
  ["stale-identity", (value) => { value.repository_contract.base_commit = "0".repeat(40); }, "REPOSITORY_IDENTITY_MISMATCH"],
  ["replaced-identity", (value) => { value.cases[0].route_visible_source_pack.id = "RC7-REPLACED"; }, "SOURCE_IDENTITY_MISMATCH"],
  ["malformed-case-identity", (value) => { value.cases[0].case_id = 7; }, "CASE_IDENTITY_MISMATCH"],
  ["mismatched-case-identity", (value) => { [value.cases[0], value.cases[1]] = [value.cases[1], value.cases[0]]; }, "CASE_IDENTITY_MISMATCH"],
  ["mismatched-route-identity", (value) => { value.cases[0].route_assignment["rc-rlm"] = "direct"; }, "ROUTE_IDENTITY_MISMATCH"],
  ["mismatched-permission-identity", (value) => { value.permission_policy.identity = "open"; }, "PERMISSION_IDENTITY_MISMATCH"],
  ["mismatched-budget-identity", (value) => { value.planned_request_budget.top_level_requests_total_ceiling = 37; }, "BUDGET_IDENTITY_MISMATCH"],
];

for (const [name, mutate, expectedCode] of identityFaults) {
  faultTest(name, async () => {
    const value = structuredClone(await buildRc7QualificationPackage());
    mutate(value);
    resign(value);
    assert.throws(() => validateRc7QualificationPackage(value), (error) => error instanceof Rc7QualificationError && error.code === expectedCode);
  });
}

faultTest("mismatched-source-identity", async () => {
  const eligible = structuredClone(await buildRc7QualificationPackage());
  eligible.cases[0].route_visible_source_pack.sources[0].locator = "/sources/99";
  resign(eligible);
  assert.throws(() => validateRc7QualificationPackage(eligible), (error) => error instanceof Rc7QualificationError && error.code === "SOURCE_IDENTITY_MISMATCH");

  const eligibleBytes = structuredClone(await buildRc7QualificationPackage());
  eligibleBytes.cases[0].route_visible_source_pack.sources[0].byte_count += 1;
  resign(eligibleBytes);
  assert.throws(() => validateRc7QualificationPackage(eligibleBytes), (error) => error instanceof Rc7QualificationError && error.code === "SOURCE_IDENTITY_MISMATCH");

  const control = structuredClone(await buildRc7QualificationPackage());
  control.cases[3].route_visible_source_pack.files[0].byte_count += 1;
  resign(control);
  assert.throws(() => validateRc7QualificationPackage(control), (error) => error instanceof Rc7QualificationError && error.code === "SOURCE_IDENTITY_MISMATCH");
});

faultTest("eligibility-leak", async () => {
  const { root } = await newRoot();
  await expectCode(() => __test.exerciseClosedProviderFreeFault(root, "eligibility-leak"), "IDENTITY_SET_MISMATCH");
});

faultTest("oracle-leak", async () => {
  const { root } = await newRoot();
  await expectCode(() => __test.exerciseClosedProviderFreeFault(root, "oracle-leak"), "ROUTE_VISIBILITY_LEAK");
});

faultTest("generic-rlm-selection", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.cases[3].route_assignment["rc-rlm"] = "rlm-forced";
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "ROUTE_IDENTITY_MISMATCH");
});

faultTest("eligible-treatment-omission", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.cases[1].route_assignment["rc-rlm"] = "direct";
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "ROUTE_IDENTITY_MISMATCH");
});

faultTest("child-budget-exhaustion", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.planned_request_budget.eligible_rlm_child_requests_per_attempt_ceiling = 5;
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "BUDGET_IDENTITY_MISMATCH");
  assert.equal(value.accounting.provider_calls, 0);
  assert.equal(value.accounting.simulated_provider_requests, 0);
});

faultTest("malformed-artifact", async () => {
  const { root } = await newRoot();
  const result = await prepareRc7Qualification(root);
  await writeFile(result.package_path, "not-json\n");
  await expectCode(() => inspectRc7Qualification(root), "MALFORMED_ARTIFACT");
});

faultTest("oversized-artifact", async () => {
  const { root } = await newRoot();
  const result = await prepareRc7Qualification(root);
  await writeFile(result.package_path, Buffer.alloc(__test.MAX_PACKAGE_BYTES + 1, 0x20));
  await expectCode(() => inspectRc7Qualification(root), "OVERSIZED_ARTIFACT");
});

faultTest("unprovenanced-artifact", async () => {
  const { root } = await newRoot();
  const result = await prepareRc7Qualification(root);
  const value = JSON.parse(await readFile(result.package_path, "utf8"));
  value.provenance = "unknown";
  resign(value);
  await writeFile(result.package_path, `${canonicalJsonV1(value)}\n`);
  await expectCode(() => inspectRc7Qualification(root), "UNPROVENANCED_ARTIFACT");
});

faultTest("conflicting-evidence-artifact", async () => {
  const { root } = await newRoot();
  await expectCode(() => prepareRc7Qualification(root, { interruptAt: "after-stage-write" }), "INJECTED_INTERRUPTION");
  await copyFile(path.join(root, __test.STAGE_NAME), path.join(root, __test.PACKAGE_NAME));
  await expectCode(() => inspectRc7Qualification(root), "CONFLICTING_ARTIFACT");
});

faultTest("aliased-artifact-path", async () => {
  const { parent, root } = await newRoot();
  const result = await prepareRc7Qualification(root);
  const external = path.join(parent, "synthetic-external-package.json");
  await writeFile(external, "synthetic-canary-not-a-credential\n");
  await rm(result.package_path);
  await link(external, result.package_path);
  await expectCode(() => inspectRc7Qualification(root), "ALIASED_ARTIFACT");
});

faultTest("oversized-state-artifact", async () => {
  const { root } = await newRoot();
  await expectCode(() => prepareRc7Qualification(root, { interruptAt: "after-state-write" }), "INJECTED_INTERRUPTION");
  await writeFile(path.join(root, __test.STATE_NAME), Buffer.alloc(4097, 0x20));
  await expectCode(() => recoverRc7Qualification(root), "OVERSIZED_ARTIFACT");
});

faultTest("lock-replacement", async () => {
  const { root } = await newRoot();
  await expectCode(() => __test.exerciseClosedProviderFreeFault(root, "lock-replacement"), "LOCK_IDENTITY_MISMATCH");
  assert.ok((await readFile(path.join(root, __test.LOCK_NAME), "utf8")).endsWith("replaced-lock\n"));
});

faultTest("nested-permission-weakening", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.permission_policy.denied = value.permission_policy.denied.filter((item) => item !== "credentials");
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "PERMISSION_IDENTITY_MISMATCH");
});

faultTest("nested-containment-weakening", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.containment_plan.required_future_boundary.direct_network_denied = false;
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "CONTAINMENT_CONTRACT_MISMATCH");
});

faultTest("direct-route-authority-widening", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.direct_route_envelope.tools_browser_network_shell = true;
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "DIRECT_ROUTE_CONTRACT_MISMATCH");
});

faultTest("public-override-rejection", async () => {
  await expectCode(() => buildRc7QualificationPackage({ caseOverrides: {} }), "UNEXPECTED_API_OPTION");
  const { root } = await newRoot();
  await expectCode(() => prepareRc7Qualification(root, { provider: "denied" }), "UNEXPECTED_API_OPTION");
  assert.equal((await inspectRc7Qualification(root)).status, "empty");
});

faultTest("fault-authority-weakening", async () => {
  const value = structuredClone(await buildRc7QualificationPackage());
  value.provider_free_fault_contract.rejected_fault_authority.pop();
  resign(value);
  assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "FAULT_CONTRACT_MISMATCH");
});

const durableContractFaults = [
  ["interruption-before-dispatch", "before_dispatch_interruption"],
  ["interruption-after-dispatch-without-sealed-result", "unsealed_dispatch"],
  ["interruption-after-result-sealing", "after_result_sealing"],
  ["side-effecting-cell-replay", "side_effecting_cell_replay"],
];

for (const [name, field] of durableContractFaults) {
  faultTest(name, async () => {
    const value = structuredClone(await buildRc7QualificationPackage());
    value.operational_contracts.durable_child_request[field] = "unsafe-replay-or-inference";
    resign(value);
    assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "OPERATIONAL_CONTRACT_MISMATCH");
    assert.equal(value.accounting.provider_calls, 0);
    assert.equal(value.accounting.simulated_provider_requests, 0);
  });
}

const fallbackFaults = [
  ["fallback-rlm-unavailable", "rlm-unavailable"],
  ["fallback-rlm-disabled", "rlm-disabled"],
  ["fallback-rlm-over-budget", "rlm-over-budget-before-reachability"],
  ["fallback-rlm-malformed", "rlm-malformed-before-reachability"],
  ["fallback-rlm-interrupted", "rlm-interrupted-before-reachability"],
];

for (const [name, trigger] of fallbackFaults) {
  faultTest(name, async () => {
    const value = structuredClone(await buildRc7QualificationPackage());
    value.operational_contracts.safe_direct_fallback.eligible_triggers = value.operational_contracts.safe_direct_fallback.eligible_triggers.filter((item) => item !== trigger);
    resign(value);
    assert.throws(() => validateRc7QualificationPackage(value), (error) => error.code === "OPERATIONAL_CONTRACT_MISMATCH");
    assert.equal(value.operational_contracts.safe_direct_fallback.provider_reachability_in_gate_a, false);
  });
}

for (const point of RC7_INTERRUPTION_POINTS) {
  const faultName = `interruption-${point}`;
  faultTest(faultName, async () => {
    const { root } = await newRoot();
    await expectCode(() => prepareRc7Qualification(root, { interruptAt: point }), "INJECTED_INTERRUPTION");
    const recovery = await recoverRc7Qualification(root);
    assert.match(recovery.status, /^(?:complete|recovered)$/u);
    const inspection = await inspectRc7Qualification(root);
    assert.equal(inspection.status, "complete");
    assert.deepEqual(inspection.entries, [__test.PACKAGE_NAME]);
  });
}

faultTest("repeated-inspection", async () => {
  const { root } = await newRoot();
  await prepareRc7Qualification(root);
  assert.deepEqual(await inspectRc7Qualification(root), await inspectRc7Qualification(root));
});

faultTest("repeated-recovery", async () => {
  const { root } = await newRoot();
  await prepareRc7Qualification(root);
  const beforeBytes = await readFile(path.join(root, __test.PACKAGE_NAME));
  const first = await recoverRc7Qualification(root);
  const second = await recoverRc7Qualification(root);
  assert.deepEqual(first, second);
  assert.deepEqual(await readFile(path.join(root, __test.PACKAGE_NAME)), beforeBytes);
  assert.deepEqual((await inspectRc7Qualification(root)).entries, [__test.PACKAGE_NAME]);
});

faultTest("concurrent-recovery", async () => {
  const { root } = await newRoot();
  const outcomes = await Promise.allSettled([recoverRc7Qualification(root), recoverRc7Qualification(root)]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = outcomes.find((item) => item.status === "rejected");
  assert.ok(rejected.reason instanceof Rc7QualificationError);
  assert.equal(rejected.reason.code, "RECOVERY_LOCKED");
  assert.equal((await inspectRc7Qualification(root)).status, "complete");
});

faultTest("cleanup-residue", async () => {
  const { root } = await newRoot();
  await prepareRc7Qualification(root);
  assert.deepEqual((await inspectRc7Qualification(root)).entries, [__test.PACKAGE_NAME]);
  await writeFile(path.join(root, "unknown-residue.bin"), "do-not-delete");
  await expectCode(() => recoverRc7Qualification(root), "UNKNOWN_RESIDUE");
  assert.equal(await readFile(path.join(root, "unknown-residue.bin"), "utf8"), "do-not-delete");
});

test("every registered provider-free fault has an executed result", () => {
  assert.equal(RC7_REGISTERED_FAULTS.length, 54);
  assert.deepEqual([...EXECUTED_FAULTS].sort(), [...RC7_REGISTERED_FAULTS].sort());
});
