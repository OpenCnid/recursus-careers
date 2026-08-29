import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";

import { __test as brokerTest, buildRc7GateCFinalApprovalFreeze } from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import { RC7_GATE_C_EXECUTOR_ID } from "../../lib/recursus/rc7-rlm-gate-c-executor.mjs";
import { buildRc7GateCPreregistrationPackage } from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";
import {
  RC7_GATE_C_ATTEMPTS_DIR,
  RC7_GATE_C_RESULTS_META,
  RC7_GATE_C_STARTS_DIR,
  Rc7GateCResultsError,
  __test,
  beginRc7GateCAttempt,
  initializeRc7GateCResults,
  inspectRc7GateCResults,
  recoverRc7GateCResults,
  validateRc7GateCAttemptRecord,
} from "../../lib/recursus/rc7-rlm-gate-c-results.mjs";
import { aggregateRc7GateCScores, scoreRc7GateCStructuredOutput } from "../../lib/recursus/rc7-rlm-gate-c-scorer.mjs";
import { buildRc7GateCSealedResult } from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const CREATED = [];

after(async () => {
  for (const target of CREATED.reverse()) {
    assert.equal(path.dirname(target), path.dirname(brokerTest.REPOSITORY_ROOT));
    assert.match(path.basename(target), /^rc7-gate-c-results-test-/u);
    await rm(target, { recursive: true, force: true });
  }
});

async function freshRoot(name = "results") {
  const parent = await mkdtemp(path.join(path.dirname(brokerTest.REPOSITORY_ROOT), "rc7-gate-c-results-test-"));
  CREATED.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error instanceof Rc7GateCResultsError && error.code === code);
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

async function emptyAccounting(ledgerRoot, resultsRoot, entries = [], identities = {}) {
  const [freeze, preregistration] = await Promise.all([buildRc7GateCFinalApprovalFreeze(ledgerRoot, resultsRoot), buildRc7GateCPreregistrationPackage()]);
  const value = {
    schema_version: "rc7-gate-c-ledger-accounting-v4",
    state: "settled-broker-derived",
    activation_sha256: freeze.future_activation_sha256,
    preregistration_sha256: preregistration.preregistration_sha256,
    ledger_root_identity: structuredClone(freeze.closure.ledger_root_identity),
    results_root_identity: structuredClone(freeze.closure.results_root_identity),
    ledger_instance_sha256: identities.ledger_instance_sha256 ?? "a".repeat(64),
    operator_approval_record_sha256: identities.operator_approval_record_sha256 ?? "b".repeat(64),
    entries,
  };
  return { ...value, accounting_sha256: sha256V1(canonicalJsonV1(value)) };
}

function output(caseId) {
  return {
    schema_version: "rc7-gate-c-signature-output-v1",
    case_id: caseId,
    completion: "complete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  };
}

function trustedLedgerEntry(row, values = {}) {
  return {
    reservation_ordinal: values.reservation_ordinal ?? 1,
    reservation_key: values.reservation_key ?? "1".repeat(64),
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
    request_kind: values.request_kind ?? "top-level",
    child_sequence: values.child_sequence ?? 0,
    semantic_request_sha256: values.semantic_request_sha256 ?? "2".repeat(64),
    dispatch_sha256: values.dispatch_sha256 ?? "3".repeat(64),
    terminal_state: "trusted-sealed",
    terminal_sha256: values.terminal_sha256 ?? "4".repeat(64),
    sealed_result_sha256: values.sealed_result_sha256 ?? "5".repeat(64),
    artifact_sha256: values.artifact_sha256 ?? "6".repeat(64),
    usage_sha256: values.usage_sha256 ?? "7".repeat(64),
    provenance_sha256: values.provenance_sha256 ?? "8".repeat(64),
    permission_sha256: values.permission_sha256 ?? "9".repeat(64),
    authority_sha256: values.authority_sha256 ?? "a".repeat(64),
    cleanup_sha256: values.cleanup_sha256 ?? "b".repeat(64),
    trusted_route_observation_sha256: values.trusted_route_observation_sha256 ?? "c".repeat(64),
    durable_handoff_sha256: values.durable_handoff_sha256 ?? "d".repeat(64),
    gate_b_attestation_sha256: values.gate_b_attestation_sha256 ?? "e".repeat(64),
    provider_reachability_committed: true,
    accounting_basis: "exact-sealed-provider-observation",
    provider_posts: values.provider_posts ?? 1,
    oauth_refresh_posts: values.oauth_refresh_posts ?? 0,
    automatic_retry_count: 0,
    provider_active_milliseconds: values.provider_active_milliseconds ?? 25,
    input_tokens: values.input_tokens ?? 10,
    output_plus_reasoning_tokens: values.output_plus_reasoning_tokens ?? 50,
  };
}

test("fresh provider-free results preparations are deterministic per root, physically root-bound, and empty", async () => {
  const left = await freshRoot("left");
  const right = await freshRoot("right");
  const ledger = await freshRoot("ledger");
  const leftAccounting = await emptyAccounting(ledger.root, left.root);
  const repeatedLeftAccounting = await emptyAccounting(ledger.root, left.root);
  const rightAccounting = await emptyAccounting(ledger.root, right.root);
  assert.deepEqual(leftAccounting, repeatedLeftAccounting);
  const first = await __test.initializeResultsWithAccounting(left.root, leftAccounting);
  const second = await __test.initializeResultsWithAccounting(right.root, rightAccounting);
  assert.notEqual(first.meta.results_root_identity.results_root_sha256, second.meta.results_root_identity.results_root_sha256);
  assert.deepEqual(first.meta.results_root_identity, leftAccounting.results_root_identity);
  assert.deepEqual(second.meta.results_root_identity, rightAccounting.results_root_identity);
  assert.deepEqual(await readdir(path.join(left.root, RC7_GATE_C_STARTS_DIR)), []);
  assert.deepEqual(await readdir(path.join(left.root, RC7_GATE_C_ATTEMPTS_DIR)), []);
});

test("attempt starts are immutable, schedule-bound, and permit a zero-score failure before provider reservation", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule[0];
  const start = await beginRc7GateCAttempt(prepared.root, row.run_id);
  assert.equal(start.run_id, row.run_id);
  await expectCode(() => beginRc7GateCAttempt(prepared.root, row.run_id), "DUPLICATE_ATTEMPT_START");
  const alternateLedger = await emptyAccounting(ledger.root, prepared.root, [], { ledger_instance_sha256: "c".repeat(64), operator_approval_record_sha256: "d".repeat(64) });
  await expectCode(() => __test.publishAttemptWithAccounting(prepared.root, alternateLedger, {
    execution: null,
    rlm_root: null,
    failure: { cleanup_residue_entries: 0, error_code: "PRE_DISPATCH_CONFIGURATION_FAILURE", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 0 },
  }), "ATTEMPT_PROVENANCE_MISMATCH");
  const record = await __test.publishAttemptWithAccounting(prepared.root, accounting, {
    execution: null,
    rlm_root: null,
    failure: { cleanup_residue_entries: 0, error_code: "PRE_DISPATCH_CONFIGURATION_FAILURE", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 0 },
  });
  assert.equal(record.state, "sealed-zero-score-failure");
  assert.equal(record.start_sha256, start.start_sha256);
  assert.equal(record.raw_output, "");
  assert.equal(record.requests.length, 0);
  assert.equal(record.trusted_observation.verified_completion, false);
  await expectCode(() => __test.publishAttemptWithAccounting(prepared.root, accounting, {
    execution: null,
    rlm_root: null,
    failure: { cleanup_residue_entries: 0, error_code: "REPLACEMENT_DENIED", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 0 },
  }), "DUPLICATE_ATTEMPT_TERMINAL");
});

test("trusted success bridge binds the structured artifact to one settled broker request", async () => {
  const ledger = await freshRoot("ledger");
  const results = await freshRoot("results");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "FACT-01" && item.arm === "rc-direct");
  const start = __test.attemptStart(preregistration, row);
  const raw = Buffer.from(`${canonicalJsonV1(output(row.case_id))}\n`, "utf8");
  const dispatch = withDigest({
    schema_version: "rc7-gate-c-dispatch-checkpoint-v2",
    activation_sha256: "0".repeat(64),
    intent_sha256: "1".repeat(64),
    permit_sha256: "2".repeat(64),
    dispatch_nonce: "3".repeat(64),
    run_id: row.run_id,
    case_id: row.case_id,
    arm: row.arm,
    selected_route: row.selected_route,
    request_kind: "top-level",
    child_sequence: 0,
    semantic_request_sha256: "4".repeat(64),
    reservation_key: "5".repeat(64),
    reservation_ordinal: 1,
    state: "consumed-provider-reachable-handoff-started",
  }, "dispatch_sha256");
  const usage = {
    schema_version: "rc7-gate-c-sanitized-usage-v1",
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 30,
  };
  const observations = {
    adapter_revision: "2fc02090af1632b86ee1175a6720904dfd71081c",
    automatic_retry_count: 0,
    model: "gpt-5.6-sol",
    oauth_refresh_posts: 0,
    provider: "openai-codex",
    provider_active_milliseconds: 25,
    provider_posts: 1,
    reasoning: "xhigh",
  };
  const artifact = {
    schema_version: "rc7-gate-c-route-output-artifact-v1",
    case_id: row.case_id,
    output_utf8_byte_count: raw.byteLength,
    output_sha256: sha256V1(raw),
    output: output(row.case_id),
  };
  const gateB = withDigest({
    schema_version: "rc7-gate-c-gate-b-live-attestation-v3",
    state: "not-applicable-direct-route",
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    container_id: null,
  }, "attestation_sha256");
  const transport = { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" };
  const hostResult = {
    schema_version: "rc7-gate-c-host-launch-result-v1",
    state: "one-shot-child-complete",
    dispatch_sha256: dispatch.dispatch_sha256,
    handoff_sha256: "6".repeat(64),
    transport,
    result: { schema_version: "rc7-gate-c-live-capsule-result-v1", state: "success-pending-outer-seal", artifact, usage, observations },
    same_host_governance_nonclaim: "same-host evidence only",
  };
  const sealedResult = buildRc7GateCSealedResult({
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    permit_sha256: dispatch.permit_sha256,
    dispatch_nonce: dispatch.dispatch_nonce,
    artifact_sha256: sha256V1(`${canonicalJsonV1(artifact)}\n`),
    usage_sha256: sha256V1(`${canonicalJsonV1(usage)}\n`),
    provenance_sha256: sha256V1(canonicalJsonV1({ dispatch_sha256: dispatch.dispatch_sha256, handoff_sha256: hostResult.handoff_sha256, artifact_sha256: artifact.output_sha256 })),
    permission_sha256: sha256V1(canonicalJsonV1({ policy_identity: "rc7-rlm-gate-c-docker-contained-brokered-ablation-v2", request_kind: dispatch.request_kind, selected_route: dispatch.selected_route })),
    authority_sha256: sha256V1(canonicalJsonV1({ gate_b: gateB, observations })),
    cleanup_sha256: sha256V1(canonicalJsonV1({ state: hostResult.state, transport, process_reuse: "denied" })),
  });
  const trustedRoute = withDigest({
    schema_version: "rc7-gate-c-trusted-route-observation-v1", route_identity_valid: true,
    run_id: dispatch.run_id, case_id: dispatch.case_id, arm: dispatch.arm, selected_route: dispatch.selected_route,
    request_kind: dispatch.request_kind, child_sequence: dispatch.child_sequence,
    semantic_request_sha256: dispatch.semantic_request_sha256, raw_artifact_sha256: sealedResult.artifact_sha256,
  }, "observation_sha256");
  const accountingObservation = withDigest({
    schema_version: "rc7-gate-c-trusted-accounting-observation-v1",
    gate_b: gateB,
    observations,
    usage,
    provider_posts: 1,
    oauth_refresh_posts: 0,
    automatic_retry_count: 0,
    provider_active_milliseconds: 25,
    input_tokens: 10,
    output_plus_reasoning_tokens: 50,
  }, "accounting_observation_sha256");
  const terminal = withDigest({
    schema_version: "rc7-gate-c-dispatch-terminal-v3", state: "trusted-sealed",
    activation_sha256: dispatch.activation_sha256, intent_sha256: dispatch.intent_sha256, permit_sha256: dispatch.permit_sha256,
    dispatch_sha256: dispatch.dispatch_sha256, reservation_key: dispatch.reservation_key,
    sealed_result: sealedResult, trusted_observation: trustedRoute, accounting_observation: accountingObservation, reason: null,
  }, "terminal_sha256");
  const request = {
    dispatch,
    terminal,
    sealed_result: sealedResult,
    gate_b: gateB,
    host_result: hostResult,
    artifact,
    observations,
    usage,
  };
  const accounting = await emptyAccounting(ledger.root, results.root, [{
    reservation_ordinal: 1,
    reservation_key: "4".repeat(64),
    run_id: dispatch.run_id,
    case_id: dispatch.case_id,
    arm: dispatch.arm,
    selected_route: dispatch.selected_route,
    request_kind: dispatch.request_kind,
    child_sequence: dispatch.child_sequence,
    semantic_request_sha256: dispatch.semantic_request_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    terminal_state: "trusted-sealed",
    terminal_sha256: terminal.terminal_sha256,
    sealed_result_sha256: sealedResult.sealed_result_sha256,
    artifact_sha256: sealedResult.artifact_sha256,
    usage_sha256: sealedResult.usage_sha256,
    provenance_sha256: sealedResult.provenance_sha256,
    permission_sha256: sealedResult.permission_sha256,
    authority_sha256: sealedResult.authority_sha256,
    cleanup_sha256: sealedResult.cleanup_sha256,
    trusted_route_observation_sha256: trustedRoute.observation_sha256,
    durable_handoff_sha256: "d".repeat(64),
    gate_b_attestation_sha256: gateB.attestation_sha256,
    provider_reachability_committed: true,
    accounting_basis: "exact-sealed-provider-observation",
    provider_posts: 1,
    oauth_refresh_posts: 0,
    automatic_retry_count: 0,
    provider_active_milliseconds: 25,
    input_tokens: 10,
    output_plus_reasoning_tokens: 50,
  }]);
  const record = await __test.successRecord({
    schema_version: "rc7-gate-c-attempt-execution-v1",
    executor_identity: RC7_GATE_C_EXECUTOR_ID,
    state: "trusted-direct-attempt-complete",
    row,
    top_level: request,
    children: [],
    rlm: null,
    raw_output: raw,
    wall_ms: 25,
    rlm_invocation_count: 0,
  }, row, accounting, start, null);
  validateRc7GateCAttemptRecord(record);
  assert.equal(record.raw_output_sha256, sha256V1(raw));
  assert.equal(record.requests[0].provider_posts, 1);
  assert.equal(record.trusted_observation.rlm_invocation_count, 0);

  const fakeProvider = structuredClone(request);
  fakeProvider.observations.provider = "fake-provider";
  await expectCode(() => __test.successRecord({
    schema_version: "rc7-gate-c-attempt-execution-v1", executor_identity: RC7_GATE_C_EXECUTOR_ID,
    state: "trusted-direct-attempt-complete", row, top_level: fakeProvider, children: [], rlm: null,
    raw_output: raw, wall_ms: 25, rlm_invocation_count: 0,
  }, row, accounting, start, null), "ATTEMPT_AUTHORITY_MISMATCH");

  const mismatchedEntry = structuredClone(accounting.entries[0]);
  mismatchedEntry.terminal_sha256 = "e".repeat(64);
  const mismatchedAccounting = await emptyAccounting(ledger.root, results.root, [mismatchedEntry]);
  await expectCode(() => __test.successRecord({
    schema_version: "rc7-gate-c-attempt-execution-v1", executor_identity: RC7_GATE_C_EXECUTOR_ID,
    state: "trusted-direct-attempt-complete", row, top_level: request, children: [], rlm: null,
    raw_output: raw, wall_ms: 25, rlm_invocation_count: 0,
  }, row, mismatchedAccounting, start, null), "ATTEMPT_PROVENANCE_MISMATCH");

  const substitutedOutput = output(row.case_id);
  substitutedOutput.completion = "incomplete";
  await expectCode(() => __test.successRecord({
    schema_version: "rc7-gate-c-attempt-execution-v1", executor_identity: RC7_GATE_C_EXECUTOR_ID,
    state: "trusted-direct-attempt-complete", row, top_level: request, children: [], rlm: null,
    raw_output: Buffer.from(`${canonicalJsonV1(substitutedOutput)}\n`, "utf8"), wall_ms: 25, rlm_invocation_count: 0,
  }, row, accounting, start, null), "ATTEMPT_PROVENANCE_MISMATCH");

  const replaced = structuredClone(record);
  replaced.requests[0].terminal_sha256 = "e".repeat(64);
  replaced.attempt_sha256 = sha256V1(canonicalJsonV1(Object.fromEntries(Object.entries(replaced).filter(([key]) => key !== "attempt_sha256"))));
  validateRc7GateCAttemptRecord(replaced);
  assert.throws(() => __test.authorityAndBudget([replaced], accounting, preregistration), (error) => error instanceof Rc7GateCResultsError && error.code === "ATTEMPT_PROVENANCE_MISMATCH");

  const attacker = { ...structuredClone(record), requests: [], rlm: { attacker_controlled: true } };
  attacker.attempt_sha256 = sha256V1(canonicalJsonV1(Object.fromEntries(Object.entries(attacker).filter(([key]) => key !== "attempt_sha256"))));
  assert.throws(() => validateRc7GateCAttemptRecord(attacker), (error) => error instanceof Rc7GateCResultsError && error.code === "MALFORMED_RESULTS");
});

test("all 36 ordinary frozen failures remain retained and produce one exact noncritical NO_RLM aggregate", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  for (const row of preregistration.ablation.schedule) {
    await beginRc7GateCAttempt(prepared.root, row.run_id);
    await __test.publishAttemptWithAccounting(prepared.root, accounting, {
      execution: null,
      rlm_root: null,
      failure: { cleanup_residue_entries: 0, error_code: "PROVIDER_FREE_SYNTHETIC_FAILURE", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 0 },
    });
  }
  const input = await __test.buildAggregationInputWithAccounting(prepared.root, accounting);
  assert.equal(input.attempts.length, 36);
  assert.equal(input.attempts.every((item) => item.raw_output === ""), true);
  assert.equal(input.authority_and_budget.recovery_failures, 0);
  assert.equal(input.authority_and_budget.top_level_generation_reservations_consumed, 0);
  const aggregate = await aggregateRc7GateCScores(input);
  assert.equal(aggregate.terminal_decision, "NO_RLM");
  assert.equal(aggregate.attempt_count, 36);
  assert.equal(aggregate.critical_failure_count, 0);
  await writeFile(path.join(prepared.root, "aggregate.json.stage"), "{\"partial\":", { flag: "wx" });
  const retained = await __test.publishAggregateWithAccounting(prepared.root, accounting);
  assert.equal(retained.terminal_decision, "NO_RLM");
  assert.equal(retained.ledger_accounting_sha256, accounting.accounting_sha256);
  assert.equal((await readdir(prepared.root)).includes("aggregate.json.stage"), false);
  const inspected = await inspectRc7GateCResults(prepared.root);
  assert.equal(inspected.state, "sealed-36-attempt-terminal");
  assert.equal(inspected.aggregate_sha256, retained.results_aggregate_sha256);
});

test("critical failure taxonomy survives the bridge and forces a critical zero score", async () => {
  const ledger = await freshRoot("ledger");
  const results = await freshRoot("results");
  const accounting = await emptyAccounting(ledger.root, results.root);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "SAFE-01" && item.arm === "rc-direct");
  const record = __test.failureRecord({ cleanup_residue_entries: 0, error_code: "PROHIBITED_ACTION", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 1 }, row, accounting, __test.attemptStart(preregistration, row));
  assert.equal(record.trusted_observation.prohibited_action_count, 1);
  const score = await scoreRc7GateCStructuredOutput({ run_id: row.run_id, raw_output: record.raw_output, trusted_observation: record.trusted_observation });
  assert.deepEqual(score.critical_failures, ["prohibited-action"]);
  const leak = __test.failureRecord({ cleanup_residue_entries: 0, error_code: "ROUTE_VISIBILITY_LEAK", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 1 }, row, accounting, __test.attemptStart(preregistration, row));
  assert.equal(leak.trusted_observation.prohibited_action_count, 1);
  const uncontained = __test.failureRecord({ cleanup_residue_entries: 0, error_code: "PHASE_TWO_NOT_PROVEN", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 1 }, row, accounting, __test.attemptStart(preregistration, row));
  assert.equal(uncontained.trusted_observation.uncontained_os_authority_count, 1);
  const weakened = __test.failureRecord({ cleanup_residue_entries: 0, error_code: "GATE_B_CONTAINMENT_WEAKENED", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 1 }, row, accounting, __test.attemptStart(preregistration, row));
  assert.equal(weakened.trusted_observation.uncontained_os_authority_count, 1);
  const weakenedScore = await scoreRc7GateCStructuredOutput({ run_id: row.run_id, raw_output: weakened.raw_output, trusted_observation: weakened.trusted_observation });
  assert.deepEqual(weakenedScore.critical_failures, ["uncontained-os-authority"]);
});

test("failed-attempt observations cannot be self-digest substituted", async () => {
  const ledger = await freshRoot("ledger");
  const results = await freshRoot("results");
  const accounting = await emptyAccounting(ledger.root, results.root);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "SAFE-01" && item.arm === "rc-direct");
  const record = __test.failureRecord({
    cleanup_residue_entries: 0,
    error_code: "PROVIDER_FAILURE",
    rlm_invocation_count: 0,
    run_id: row.run_id,
    wall_ms: 1,
  }, row, accounting, __test.attemptStart(preregistration, row));
  const substituted = structuredClone(record);
  substituted.trusted_observation.prohibited_action_count = 1;
  substituted.attempt_sha256 = sha256V1(canonicalJsonV1(Object.fromEntries(Object.entries(substituted).filter(([key]) => key !== "attempt_sha256"))));
  assert.throws(() => validateRc7GateCAttemptRecord(substituted), (error) => error instanceof Rc7GateCResultsError && error.code === "MALFORMED_RESULTS");
});

test("failed-attempt request accounting rejects exact numeric substitution at aggregation", async () => {
  const ledger = await freshRoot("ledger");
  const results = await freshRoot("results");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "FACT-01" && item.arm === "rc-direct");
  const accounting = await emptyAccounting(ledger.root, results.root, [trustedLedgerEntry(row)]);
  const record = __test.failureRecord({
    cleanup_residue_entries: 0,
    error_code: "MALFORMED_PROVIDER_OUTPUT",
    rlm_invocation_count: 0,
    run_id: row.run_id,
    wall_ms: 25,
  }, row, accounting, __test.attemptStart(preregistration, row));
  const substituted = structuredClone(record);
  substituted.requests[0].provider_active_milliseconds += 1;
  substituted.attempt_sha256 = sha256V1(canonicalJsonV1(Object.fromEntries(Object.entries(substituted).filter(([key]) => key !== "attempt_sha256"))));
  validateRc7GateCAttemptRecord(substituted);
  assert.throws(() => __test.authorityAndBudget([substituted], accounting, preregistration), (error) => error instanceof Rc7GateCResultsError && error.code === "ATTEMPT_PROVENANCE_MISMATCH");
});

test("a trusted-sealed request in a failed RLM attempt retains exact ledger-derived accounting", async () => {
  const ledger = await freshRoot("ledger");
  const results = await freshRoot("results");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "LAB-01" && item.arm === "rc-rlm");
  const entry = trustedLedgerEntry(row, {
    provider_active_milliseconds: 117,
    input_tokens: 321,
    output_plus_reasoning_tokens: 654,
  });
  const accounting = await emptyAccounting(ledger.root, results.root, [entry]);
  const record = __test.failureRecord({
    cleanup_residue_entries: 0,
    error_code: "MALFORMED_PROVIDER_OUTPUT",
    rlm_invocation_count: 1,
    run_id: row.run_id,
    wall_ms: 118,
  }, row, accounting, __test.attemptStart(preregistration, row));
  validateRc7GateCAttemptRecord(record);
  assert.equal(record.state, "sealed-zero-score-failure");
  assert.equal(record.requests[0].accounting_basis, "exact-sealed-provider-observation");
  const authority = __test.authorityAndBudget([record], accounting, preregistration);
  assert.equal(authority.generation_https_post_requests_consumed, 1);
  assert.equal(authority.oauth_refresh_https_post_requests_consumed, 0);
  assert.equal(authority.provider_active_milliseconds_consumed, 117);
  assert.equal(authority.input_token_accounting_consumed, 321);
  assert.equal(authority.output_plus_reasoning_token_accounting_consumed, 654);
});

test("aliased retained-attempt directories fail closed", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  await __test.initializeResultsWithAccounting(prepared.root, await emptyAccounting(ledger.root, prepared.root));
  const attempts = path.join(prepared.root, RC7_GATE_C_ATTEMPTS_DIR);
  const replacement = path.join(prepared.parent, "replacement-attempts");
  await rename(attempts, replacement);
  await symlink(replacement, attempts, "junction");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  await expectCode(() => beginRc7GateCAttempt(prepared.root, preregistration.ablation.schedule[0].run_id), "ALIASED_RESULTS_PATH");
});

test("complete and malformed partial results-metadata stages recover to the exact root-bound bytes", async () => {
  const ledger = await freshRoot("ledger");
  const complete = await freshRoot("complete-meta-stage");
  const completeAccounting = await emptyAccounting(ledger.root, complete.root);
  const initialized = await __test.initializeResultsWithAccounting(complete.root, completeAccounting);
  const metaTarget = path.join(complete.root, RC7_GATE_C_RESULTS_META);
  await rename(metaTarget, `${metaTarget}.stage`);
  const completed = await __test.recoverResultsWithAccounting(complete.root, completeAccounting);
  assert.equal(completed.changed, true);
  assert.deepEqual(JSON.parse((await readFile(metaTarget)).toString("utf8")), initialized.meta);
  assert.equal((await readdir(complete.root)).includes(`${RC7_GATE_C_RESULTS_META}.stage`), false);

  const partial = await freshRoot("partial-meta-stage");
  const partialAccounting = await emptyAccounting(ledger.root, partial.root);
  await writeFile(path.join(partial.root, `${RC7_GATE_C_RESULTS_META}.stage`), "{\"partial\":", { flag: "wx" });
  const repaired = await __test.recoverResultsWithAccounting(partial.root, partialAccounting);
  assert.equal(repaired.changed, true);
  const repairedMeta = JSON.parse((await readFile(path.join(partial.root, RC7_GATE_C_RESULTS_META))).toString("utf8"));
  assert.deepEqual(repairedMeta.results_root_identity, partialAccounting.results_root_identity);
  assert.notEqual(repairedMeta.results_root_identity.results_root_sha256, initialized.meta.results_root_identity.results_root_sha256);
  assert.deepEqual((await readdir(partial.root)).sort(), [RC7_GATE_C_ATTEMPTS_DIR, RC7_GATE_C_RESULTS_META, RC7_GATE_C_STARTS_DIR].sort());
});

test("a malformed start stage is replaced by the exact registered immutable start", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule[0];
  const stage = path.join(prepared.root, RC7_GATE_C_STARTS_DIR, `${row.run_id}.json.stage`);
  await writeFile(stage, "{\"partial\":", { flag: "wx" });
  const recovered = await __test.recoverResultsWithAccounting(prepared.root, accounting);
  assert.equal(recovered.changed, true);
  assert.equal(recovered.starts, 1);
  const retained = JSON.parse((await readFile(path.join(prepared.root, RC7_GATE_C_STARTS_DIR, `${row.run_id}.json`))).toString("utf8"));
  assert.deepEqual(retained, __test.attemptStart(preregistration, row));
  assert.equal((await readdir(path.join(prepared.root, RC7_GATE_C_STARTS_DIR))).includes(`${row.run_id}.json.stage`), false);
});

test("stale dead-owner results recovery lock is reconciled without replay or residue", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const deadPid = 999_999_999;
  const ownerName = `.gate-c-results-recovery.owner.${deadPid}.1`;
  const owner = path.join(prepared.root, ownerName);
  await writeFile(owner, `${canonicalJsonV1({ schema_version: "rc7-gate-c-results-recovery-owner-v1", pid: deadPid, owner_name: ownerName })}\n`, { flag: "wx" });
  await link(owner, path.join(prepared.root, ".gate-c-results-recovery.lock"));
  const recovered = await __test.recoverResultsWithAccounting(prepared.root, accounting);
  assert.equal(recovered.state, "settled");
  assert.equal(recovered.changed, false);
  assert.equal((await readdir(prepared.root)).some((item) => item.startsWith(".gate-c-results-recovery")), false);
});

test("same-path ledger deletion and recreation invalidates retained results metadata", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  await rm(ledger.root, { recursive: true });
  await mkdir(ledger.root);
  await expectCode(() => __test.resultsContext(prepared.root), "STALE_RESULTS_ROOT");
});

test("same-path results-root recreation cannot replay retained metadata into a replacement directory", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const displaced = path.join(prepared.parent, "displaced-results-root");
  await rename(prepared.root, displaced);
  await mkdir(prepared.root);
  for (const entry of [RC7_GATE_C_RESULTS_META, RC7_GATE_C_STARTS_DIR, RC7_GATE_C_ATTEMPTS_DIR]) {
    await rename(path.join(displaced, entry), path.join(prepared.root, entry));
  }
  await expectCode(() => __test.resultsContext(prepared.root), "STALE_RESULTS_ROOT");
});

test("interrupted atomic start publication recovers once and repeated recovery is idempotent", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const runId = preregistration.ablation.schedule[0].run_id;
  await beginRc7GateCAttempt(prepared.root, runId);
  const retained = path.join(prepared.root, RC7_GATE_C_STARTS_DIR, `${runId}.json`);
  await rename(retained, `${retained}.stage`);
  const first = await __test.recoverResultsWithAccounting(prepared.root, accounting);
  assert.equal(first.changed, true);
  assert.equal(first.starts, 1);
  assert.equal(first.attempts, 0);
  const second = await __test.recoverResultsWithAccounting(prepared.root, accounting);
  assert.equal(second.changed, false);
  assert.equal(second.state, "attempt-recovery-required-no-replay");
});

test("partial attempt publication becomes one no-replay terminal and concurrent recovery is excluded", async () => {
  const prepared = await freshRoot();
  const ledger = await freshRoot("ledger");
  const accounting = await emptyAccounting(ledger.root, prepared.root);
  await __test.initializeResultsWithAccounting(prepared.root, accounting);
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const row = preregistration.ablation.schedule.find((item) => item.case_id === "FACT-01" && item.arm === "rc-direct");
  await beginRc7GateCAttempt(prepared.root, row.run_id);
  const owner = await __test.acquireResultsRecoveryLock(prepared.root);
  await expectCode(() => __test.recoverAttemptTerminalWithAccounting(prepared.root, accounting, {
    cleanup_residue_entries: 0, error_code: "INTERRUPTED_EXECUTION_RECOVERED_NO_REPLAY", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 600_000,
  }), "CONCURRENT_RESULTS_RECOVERY");
  await __test.releaseResultsRecoveryLock(prepared.root, owner);
  const stage = path.join(prepared.root, RC7_GATE_C_ATTEMPTS_DIR, `${row.run_id}.json.stage`);
  await writeFile(stage, "{\"partial\":", { flag: "wx" });
  const retained = await __test.recoverAttemptTerminalWithAccounting(prepared.root, accounting, {
    cleanup_residue_entries: 0, error_code: "INTERRUPTED_EXECUTION_RECOVERED_NO_REPLAY", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 600_000,
  });
  assert.equal(retained.state, "sealed-zero-score-failure");
  assert.equal(retained.failure_code, "INTERRUPTED_EXECUTION_RECOVERED_NO_REPLAY");
  assert.equal((await readdir(path.join(prepared.root, RC7_GATE_C_ATTEMPTS_DIR))).includes(`${row.run_id}.json.stage`), false);
  const repeated = await __test.recoverAttemptTerminalWithAccounting(prepared.root, accounting, {
    cleanup_residue_entries: 0, error_code: "DIFFERENT_FAILURE", rlm_invocation_count: 0, run_id: row.run_id, wall_ms: 600_000,
  });
  assert.equal(repeated.attempt_sha256, retained.attempt_sha256);
});
