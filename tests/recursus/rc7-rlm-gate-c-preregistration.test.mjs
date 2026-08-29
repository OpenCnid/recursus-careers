import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  RC7_GATE_C_PACKAGE_NAME,
  RC7_GATE_C_PERMISSION_POLICY_ID,
  RC7_GATE_C_TERMINAL,
  Rc7GateCPreregistrationError,
  __test,
  buildRc7GateCPreregistrationPackage,
  exactCaseClusterBootstrapLowerBound,
  inspectRc7GateCPreregistration,
  prepareRc7GateCPreregistration,
  validateRc7GateCPreregistrationPackage,
} from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const TEMP_PARENTS = [];

after(async () => {
  for (const target of TEMP_PARENTS) {
    assert.ok(path.resolve(target).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    await rm(target, { recursive: true, force: true });
  }
});

async function freshRoot(name = "root") {
  const parent = await mkdtemp(path.join(tmpdir(), "rc7-gate-c-prereg-test-"));
  TEMP_PARENTS.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error instanceof Rc7GateCPreregistrationError && error.code === code);
}

function resign(value) {
  value.preregistration_sha256 = sha256V1(canonicalJsonV1(__test.packageProjection(value)));
}

test("Gate C provider-free draft freezes the 36-attempt schedule and remains fail closed", async () => {
  const value = await buildRc7GateCPreregistrationPackage();
  assert.equal(value.ablation.schedule.length, 36);
  assert.equal(value.ablation.schedule.filter((row) => row.selected_route === "rc-rlm").length, 9);
  assert.equal(value.ablation.schedule.reduce((total, row) => total + row.child_request_ceiling, 0), 36);
  assert.equal(value.budget.maximum_provider_reachable_request_reservations, 72);
  assert.equal(value.budget.maximum_generation_https_post_requests, 72);
  assert.equal(value.budget.maximum_oauth_refresh_https_post_requests, 72);
  assert.equal(value.budget.maximum_total_https_post_requests, 144);
  assert.equal(value.permissions.identity, RC7_GATE_C_PERMISSION_POLICY_ID);
  assert.equal(value.permissions.state, "inactive-pending-digest-bound-numeric-approval");
  assert.equal(value.approval_request.state, "not-yet-approved");
  assert.equal(value.terminal_decision, RC7_GATE_C_TERMINAL);
  assert.equal(value.execution_blockers.length, 1);
  assert.equal(value.scoring.deterministic_validator.execution_ready, true);
  assert.equal(value.scoring.deterministic_validator.exact_aggregation.attempt_count, 36);
  assert.equal(value.scoring.human_review.registered_operator_reviewer.participant_identity, "cnid");
  assert.equal(value.scoring.human_review.second_human_reviewer, "not_applicable-objective-synthetic-evaluator");
  assert.equal(value.scoring.advancement.strict_per_case_factuality_non_regression_required, true);
  assert.equal(value.scoring.advancement.strict_per_case_safety_non_regression_required, true);
  assert.match(value.scoring.advancement.no_rlm_mapping, /gain is absent.*generic.*regress.*latency.*cost.*authority/iu);
  assert.match(value.scoring.exact_aggregate, /exactly 36 raw outputs plus trusted observations.*internally derives.*independently re-scores.*accepts no caller schedule or score object/iu);
  assert.deepEqual(value.accounting, {
    rlm_executions: 0,
    provider_calls: 0,
    simulated_provider_requests: 0,
    credential_accesses: 0,
    network_or_live_browsing_actions: 0,
    external_mutations: 0,
    docker_invocations: 0,
    wsl_invocations: 0,
    retained_artifacts: 1,
    terminal_decisions: 1,
    required_operator_steps: 1,
    cleanup_residue_entries: 0,
  });
});

test("generic controls remain direct in both labeled arms and eligible treatment is forced", async () => {
  const value = await buildRc7GateCPreregistrationPackage();
  for (const row of value.ablation.schedule) {
    if (["FACT-01", "FACT-03", "SAFE-01"].includes(row.case_id)) assert.equal(row.selected_route, "rc-direct");
    if (["LAB-01", "PAPER-01", "REPO-01"].includes(row.case_id) && row.arm === "rc-rlm") assert.equal(row.selected_route, "rc-rlm");
  }
});

test("prompt and output bytes are exact while evaluator bytes remain outside the route-visible projection", async () => {
  const value = await buildRc7GateCPreregistrationPackage();
  for (const prompt of Object.values(value.exact_comparison_identity.prompts)) {
    assert.equal(Buffer.byteLength(prompt.text, "utf8"), prompt.byte_count);
    assert.equal(sha256V1(Buffer.from(prompt.text, "utf8")), prompt.sha256);
  }
  const output = value.exact_comparison_identity.output_contract;
  assert.equal(sha256V1(Buffer.from(output.text, "utf8")), output.sha256);
  const visible = canonicalJsonV1({ prompts: value.exact_comparison_identity.prompts, schedule: value.ablation.schedule.map(({ evaluator_contract_id, evaluator_contract_sha256, ...row }) => row) });
  assert.doesNotMatch(visible, /(?:eligibility|expected_relationship|leak_canary|preferred_route|evaluator_contract|oracle)/iu);
});

test("request, token, time, credit, and provider-equivalent arithmetic is exact and not promoted to billing authority", async () => {
  const value = await buildRc7GateCPreregistrationPackage();
  assert.equal(value.budget.cumulative.conservative_input_token_accounting_ceiling, 72 * 32_768);
  assert.equal(value.budget.cumulative.requested_output_plus_reasoning_token_target, 72 * 8_192);
  assert.equal(value.budget.cumulative.hard_output_plus_reasoning_token_accounting_ceiling, 72 * 8_192);
  assert.equal(value.budget.cumulative.maximum_sequential_provider_active_seconds, 72 * 120);
  assert.equal(value.approval_request.proposed_numeric_ceilings.maximum_generation_https_post_requests, 72);
  assert.equal(value.approval_request.proposed_numeric_ceilings.maximum_oauth_refresh_https_post_requests, 72);
  assert.equal(value.approval_request.proposed_numeric_ceilings.maximum_total_https_post_requests, 144);
  assert.equal(value.pricing.published_codex_credit_reference.calculated_worst_case_credits, 530.8416);
  assert.equal(value.pricing.published_codex_credit_reference.proposed_approval_ceiling_credits, 530.85);
  assert.equal(value.pricing.published_api_equivalent_reference.calculated_provider_equivalent_usd, 21.233664);
  assert.equal(value.pricing.published_api_equivalent_reference.proposed_provider_equivalent_ceiling_usd, 21.24);
  assert.equal(value.pricing.additional_credit_purchase_authority, 0);
  assert.equal(value.pricing.incremental_cash_purchase_authority_usd, 0);
  assert.equal(value.pricing.comparable_cost_result_until_applicability_is_proven, null);
});

test("all 27 ordered case-cluster resamples use the frozen nearest-rank lower bound", () => {
  assert.deepEqual(exactCaseClusterBootstrapLowerBound([3, 6, 9]), {
    resample_count: 27,
    nearest_rank_index_zero_based: 2,
    lower_bound: 4,
  });
  assert.throws(() => exactCaseClusterBootstrapLowerBound([1, 2]), /exactly three finite/u);
});

test("two fresh preparations retain one byte-identical provider-free package", async () => {
  const first = await freshRoot("first");
  const second = await freshRoot("second");
  const left = await prepareRc7GateCPreregistration(first.root);
  const right = await prepareRc7GateCPreregistration(second.root);
  assert.equal(left.preregistration_sha256, right.preregistration_sha256);
  assert.deepEqual(await readFile(left.package_path), await readFile(right.package_path));
  assert.deepEqual((await inspectRc7GateCPreregistration(first.root)).entries, [RC7_GATE_C_PACKAGE_NAME]);
  assert.deepEqual((await inspectRc7GateCPreregistration(second.root)).entries, [RC7_GATE_C_PACKAGE_NAME]);
});

test("preparation rejects missing, non-empty, repository, protected, and aliased roots", async () => {
  const missing = await freshRoot("holder");
  await expectCode(() => prepareRc7GateCPreregistration(path.join(missing.parent, "missing")), "MISSING_OUTPUT_ROOT");

  const occupied = await freshRoot("occupied");
  await writeFile(path.join(occupied.root, "existing.txt"), "occupied");
  await expectCode(() => prepareRc7GateCPreregistration(occupied.root), "NONEMPTY_OUTPUT_ROOT");

  await expectCode(() => prepareRc7GateCPreregistration(__test.REPOSITORY_ROOT), "REPOSITORY_OUTPUT_ROOT");

  const protectedRoot = await freshRoot("holder-two");
  const tokenRoot = path.join(protectedRoot.parent, "credentials", "root");
  await mkdir(tokenRoot, { recursive: true });
  await expectCode(() => prepareRc7GateCPreregistration(tokenRoot), "PROTECTED_OUTPUT_ROOT");

  const aliased = await freshRoot("native");
  const junction = path.join(aliased.parent, "junction");
  await symlink(aliased.root, junction, "junction");
  await expectCode(() => prepareRc7GateCPreregistration(junction), "ALIASED_OUTPUT_ROOT");
});

test("tampering with request authority, approval state, or schedule fails independent validation", async () => {
  const budget = structuredClone(await buildRc7GateCPreregistrationPackage());
  budget.budget.maximum_provider_reachable_request_reservations = 73;
  resign(budget);
  assert.throws(() => validateRc7GateCPreregistrationPackage(budget), /request budget mismatched/u);

  const approval = structuredClone(await buildRc7GateCPreregistrationPackage());
  approval.approval_request.state = "approved";
  resign(approval);
  assert.throws(() => validateRc7GateCPreregistrationPackage(approval), /numeric approval state mismatched/u);

  const route = structuredClone(await buildRc7GateCPreregistrationPackage());
  const generic = route.ablation.schedule.find((row) => row.case_id === "FACT-01" && row.arm === "rc-rlm");
  generic.selected_route = "rc-rlm";
  resign(route);
  assert.throws(() => validateRc7GateCPreregistrationPackage(route), /schedule mismatched/u);
});

test("the Gate C preregistration import surface excludes execution, network, credentials, Docker, and RLM loading", async () => {
  const source = await readFile(path.join(__test.REPOSITORY_ROOT, "lib/recursus/rc7-rlm-gate-c-preregistration.mjs"), "utf8");
  for (const denied of ["node:child_process", "node:http", "node:https", "node:net", "node:tls", "node:dns", "fetch(", "WebSocket", "process.env", "dockerode", "zeromq", "jupyter", "OPENAI_CODEX_OAUTH"]) {
    assert.equal(source.includes(denied), false, denied);
  }
});
