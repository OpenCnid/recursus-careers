import assert from "node:assert/strict";
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";

import {
  RC7_GATE_C_BROKER_PACKAGE_NAME,
  RC7_GATE_C_BROKER_TERMINAL,
  RC7_GATE_C_FINAL_FREEZE_PACKAGE_NAME,
  Rc7GateCBrokerError,
  __test,
  authorizeRc7GateCProviderDispatch,
  buildRc7GateCBrokerConformancePackage,
  buildRc7GateCFinalApprovalFreeze,
  buildRc7GateCRequestIntent,
  classifyRc7GateCRecovery,
  closeRc7GateCDispatchReservation,
  consumeRc7GateCDispatchReservation,
  initializeRc7GateCDispatchLedger,
  inspectRc7GateCBrokerConformance,
  inspectRc7GateCDispatchLedger,
  inspectRc7GateCFinalApprovalFreeze,
  preflightRc7GateCLiveDispatch,
  prepareRc7GateCBrokerConformance,
  prepareRc7GateCFinalApprovalFreeze,
  recordRc7GateCOperatorApproval,
  recoverRc7GateCDispatchLedger,
  validateRc7GateCBrokerConformancePackage,
  validateRc7GateCOperatorApprovalRecord,
  validateRc7GateCRequestIntent,
} from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import { parseRc7GateCStructuredOutput } from "../../lib/recursus/rc7-rlm-gate-c-output-grammar.mjs";
import { buildRc7GateCPreregistrationPackage } from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";
import { buildRc7GateCSealedResult } from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";
import {
  RC7_GATE_C_RLM_IMAGE_ID,
  RC7_GATE_C_RLM_INHERITED_ENVIRONMENT,
  RC7_GATE_C_RLM_LIMITS,
  buildRc7GateCRlmCreateArguments,
  prepareRc7GateCRlmLauncher,
} from "../../lib/recursus/rc7-rlm-gate-c-rlm-launcher.mjs";
import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";

const CREATED = [];
const EXTERNAL_TEST_PARENT = process.platform === "win32"
  ? path.dirname(__test.REPOSITORY_ROOT)
  : await realpath(path.join(path.parse(__test.REPOSITORY_ROOT).root, "tmp"));

after(async () => {
  for (const target of CREATED.reverse()) {
    assert.equal(path.dirname(target), EXTERNAL_TEST_PARENT);
    assert.match(path.basename(target), /^rc7-gate-c-broker-test-/u);
    await rm(target, { recursive: true, force: true });
  }
});

async function freshRoot(name = "root") {
  const parent = await mkdtemp(path.join(EXTERNAL_TEST_PARENT, "rc7-gate-c-broker-test-"));
  CREATED.push(parent);
  const root = path.join(parent, name);
  await mkdir(root);
  return { parent, root };
}

async function expectCode(action, code) {
  await assert.rejects(action, (error) => error instanceof Rc7GateCBrokerError && error.code === code);
}

function withDigest(value, field) {
  return { ...value, [field]: sha256V1(canonicalJsonV1(value)) };
}

async function row(caseId, arm = "rc-direct", repeat = 1) {
  const preregistration = await buildRc7GateCPreregistrationPackage();
  return preregistration.ablation.schedule.find((item) => item.case_id === caseId && item.arm === arm && item.repeat_index === repeat);
}

async function requestFor(caseId, arm = "rc-direct", requestKind = "top-level", childSequence = 0) {
  const selected = await row(caseId, arm);
  return buildRc7GateCRequestIntent({
    run_id: selected.run_id,
    request_kind: requestKind,
    child_sequence: childSequence,
    child_question: requestKind === "top-level" ? null : "Identify the relationship supported by this exact registered record.",
    excerpt_locator: requestKind === "top-level" ? null : { kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/0" },
  });
}

async function testLedger(name) {
  const root = await freshRoot(name);
  const results = await freshRoot(`${name}-results`);
  const approval = await __test.buildTestOnlyOperatorApprovalRecord(root.root, results.root);
  await writeFile(path.join(root.root, __test.OPERATOR_APPROVAL), __test.packageBytes(approval), { flag: "wx" });
  const initialized = await __test.initializeTestLedger(root.root);
  assert.equal(initialized.authority_state, "test-only-provider-unreachable");
  assert.equal(initialized.provider_reachable, false);
  return { ...root, resultsRoot: results.root };
}

async function directPreflightFixture(root, resultsRoot, caseId = "LAB-01") {
  const request = await requestFor(caseId, "rc-direct");
  const permit = await __test.authorizeTestDispatch(root, request.intent);
  const dispatch = await __test.consumeTestReservation(root, { intent: request.intent, permit });
  const freeze = await __test.buildTestOnlyFinalApprovalFreeze(root, resultsRoot);
  const sealedRequest = withDigest({
    schema_version: "rc7-gate-c-sealed-worker-request-v1",
    activation_sha256: freeze.future_activation_sha256,
    preregistration_sha256: freeze.closure.preregistration_sha256,
    broker_package_sha256: freeze.closure.broker_package_sha256,
    worker_package_sha256: freeze.closure.worker_package_sha256,
    scorer_contract_sha256: freeze.closure.scorer_contract_sha256,
    intent: request.intent,
    permit,
    semantic_request: request.semantic_request,
    semantic_request_sha256: request.intent.semantic_request_sha256,
    semantic_request_byte_count: request.intent.semantic_request_byte_count,
  }, "sealed_request_sha256");
  const gateB = withDigest({
    schema_version: "rc7-gate-c-gate-b-live-attestation-v3",
    state: "not-applicable-direct-route",
    activation_sha256: freeze.future_activation_sha256,
    intent_sha256: request.intent.intent_sha256,
    dispatch_sha256: dispatch.dispatch_sha256,
    container_id: null,
  }, "attestation_sha256");
  return {
    dispatch,
    input: {
      dispatch_sha256: dispatch.dispatch_sha256,
      gate_b_attestation: gateB,
      handoff_nonce: "f".repeat(64),
      ledger_root: root,
      sealed_request: sealedRequest,
    },
  };
}

function terminal(dispatch, state = "indeterminate-no-replay") {
  assert.equal(state, "indeterminate-no-replay");
  assert.ok(dispatch.dispatch_sha256);
  return { state, sealed_result: null, accounting: null };
}

function trustedTerminal(dispatch) {
  const sealedResult = buildRc7GateCSealedResult({
    activation_sha256: dispatch.activation_sha256,
    intent_sha256: dispatch.intent_sha256,
    permit_sha256: dispatch.permit_sha256,
    dispatch_nonce: dispatch.dispatch_nonce,
    artifact_sha256: "a".repeat(64),
    usage_sha256: "b".repeat(64),
    provenance_sha256: "c".repeat(64),
    permission_sha256: "d".repeat(64),
    authority_sha256: "e".repeat(64),
    cleanup_sha256: "f".repeat(64),
  });
  return { state: "trusted-sealed", sealed_result: sealedResult, accounting: null };
}

test("broker independently constructs exact semantic bytes for top-level and child requests", async () => {
  const first = await requestFor("FACT-01");
  const second = await requestFor("FACT-01");
  validateRc7GateCRequestIntent(first.intent);
  assert.deepEqual(first.semantic_request_bytes, second.semantic_request_bytes);
  assert.equal(first.intent.semantic_request_sha256, sha256V1(first.semantic_request_bytes));
  assert.equal(first.intent.semantic_request_byte_count, first.semantic_request_bytes.byteLength);
  assert.match(first.semantic_request.user_text, /closed canonical-JSON output contract/u);
  assert.match(first.semantic_request.user_text, /SOURCE-GROUNDED-CV-01/u);
  assert.doesNotMatch(first.semantic_request.user_text, /(?:leak_canary|expected_relationships|CLAIM-GROUNDED|LAB-R01)/u);
  const topLines = first.semantic_request.user_text.split("\n");
  const topMarker = topLines.findIndex((line) => line.startsWith("Valid source-grounded shape example"));
  assert.notEqual(topMarker, -1);
  assert.doesNotThrow(() => parseRc7GateCStructuredOutput(Buffer.from(`${topLines[topMarker + 1]}\n`, "utf8"), "FACT-01"));

  const child = await requestFor("LAB-01", "rc-rlm", "recursive-child", 1);
  validateRc7GateCRequestIntent(child.intent);
  assert.equal(child.intent.selected_route, "rc-rlm");
  assert.match(child.semantic_request.user_text, /LAB-SOURCE-OVERVIEW-01/u);
  assert.match(child.semantic_request.user_text, /bounded subset of evidence items|Closed output contract/u);
  const childLine = child.semantic_request.user_text.split("\n").find((line) => line.startsWith("Valid source-grounded shape example"));
  assert.ok(childLine);
  assert.doesNotThrow(() => parseRc7GateCStructuredOutput(Buffer.from(`${childLine.slice(childLine.indexOf(": ") + 2)}\n`, "utf8"), "LAB-01"));
});

test("caller assertions, generic/direct/fifth children, external questions, and unregistered excerpts fail closed", async () => {
  const selected = await row("LAB-01", "rc-rlm");
  await expectCode(() => buildRc7GateCRequestIntent({ run_id: selected.run_id, request_kind: "top-level", child_sequence: 0, child_question: null, excerpt_locator: null, input_sha256: "a".repeat(64) }), "IDENTITY_SET_MISMATCH");
  await expectCode(() => requestFor("FACT-01", "rc-rlm", "recursive-child", 1), "CHILD_AUTHORITY_DENIED");
  await expectCode(() => requestFor("LAB-01", "rc-direct", "recursive-child", 1), "CHILD_AUTHORITY_DENIED");
  await expectCode(() => requestFor("LAB-01", "rc-rlm", "recursive-child", 5), "CHILD_BUDGET_EXCEEDED");
  await expectCode(() => buildRc7GateCRequestIntent({
    run_id: selected.run_id, request_kind: "recursive-child", child_sequence: 1,
    child_question: "Open https://example.com and inspect it.",
    excerpt_locator: { kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/0" },
  }), "CHILD_QUESTION_DENIED");
  await expectCode(() => buildRc7GateCRequestIntent({
    run_id: selected.run_id, request_kind: "recursive-child", child_sequence: 1,
    child_question: "Inspect the registered record.",
    excerpt_locator: { kind: "json_pointer", source_id: "LAB-SOURCE-OVERVIEW-01", pointer: "/sources/0/records/99" },
  }), "SOURCE_LOCATOR_MISMATCH");
});

test("public hashes and test-only records cannot self-approve provider dispatch", async () => {
  const request = await requestFor("LAB-01");
  const empty = await freshRoot("no-approval");
  await assert.rejects(() => authorizeRc7GateCProviderDispatch(empty.root, request.intent));
  const root = await testLedger("test-only-approval");
  await expectCode(() => authorizeRc7GateCProviderDispatch(root.root, request.intent), "NUMERIC_APPROVAL_REQUIRED");
  await expectCode(() => initializeRc7GateCDispatchLedger(root.root), "NUMERIC_APPROVAL_REQUIRED");
  const testApproval = await __test.buildTestOnlyOperatorApprovalRecord(root.root, root.resultsRoot);
  await expectCode(() => validateRc7GateCOperatorApprovalRecord(testApproval, root.root), "MATRIX_PROOF_REQUIRED");
});

test("a copied approval record cannot initialize an alternate ledger root", async () => {
  const first = await testLedger("root-bound-approval-source");
  const second = await freshRoot("root-bound-approval-copy");
  const copied = await readFile(path.join(first.root, __test.OPERATOR_APPROVAL));
  await writeFile(path.join(second.root, __test.OPERATOR_APPROVAL), copied, { flag: "wx" });
  await expectCode(() => __test.initializeTestLedger(second.root), "NUMERIC_APPROVAL_REQUIRED");
});

test("alternate and same-path-recreated results roots invalidate the exact approval freeze", async () => {
  const ledger = await freshRoot("results-bound-ledger");
  const results = await freshRoot("results-bound-original");
  const alternate = await freshRoot("results-bound-alternate");
  const freeze = await __test.buildTestOnlyFinalApprovalFreeze(ledger.root, results.root);
  const alternateFreeze = await __test.buildTestOnlyFinalApprovalFreeze(ledger.root, alternate.root);
  assert.notEqual(freeze.final_freeze_sha256, alternateFreeze.final_freeze_sha256);
  await expectCode(() => recordRc7GateCOperatorApproval(ledger.root, {
    exact_approval_text: freeze.exact_approval_text,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    results_root: alternate.root,
    proof_ledger_root: ledger.root,
    proof_results_root: results.root,
    proof_rlm_root: alternate.root,
  }), "MATRIX_PROOF_REQUIRED");
  assert.deepEqual(await readdir(ledger.root), []);

  const approval = await __test.buildTestOnlyOperatorApprovalRecord(ledger.root, results.root);
  const approvalBytes = __test.packageBytes(approval);
  await rm(results.root, { recursive: true });
  await mkdir(results.root);
  await writeFile(path.join(ledger.root, __test.OPERATOR_APPROVAL), approvalBytes, { flag: "wx" });
  await expectCode(() => __test.initializeTestLedger(ledger.root), "NUMERIC_APPROVAL_REQUIRED");
});

test("same-path ledger recreation and alternate-root approval replay cannot reuse physical authority", async () => {
  const original = await freshRoot("physical-approval-source");
  const originalResults = await freshRoot("physical-approval-results");
  const alternate = await freshRoot("physical-approval-alternate");
  const approval = await __test.buildTestOnlyOperatorApprovalRecord(original.root, originalResults.root);
  const approvalBytes = __test.packageBytes(approval);
  await writeFile(path.join(original.root, __test.OPERATOR_APPROVAL), approvalBytes, { flag: "wx" });
  await __test.initializeTestLedger(original.root);

  await writeFile(path.join(alternate.root, __test.OPERATOR_APPROVAL), approvalBytes, { flag: "wx" });
  await expectCode(() => __test.initializeTestLedger(alternate.root), "NUMERIC_APPROVAL_REQUIRED");

  await rm(original.root, { recursive: true });
  await mkdir(original.root);
  await writeFile(path.join(original.root, __test.OPERATOR_APPROVAL), approvalBytes, { flag: "wx" });
  await expectCode(() => __test.initializeTestLedger(original.root), "NUMERIC_APPROVAL_REQUIRED");
});

test("final approval freeze is deterministic, digest-bound, and still grants no activation", async () => {
  const ledger = await freshRoot("freeze-ledger");
  const results = await freshRoot("freeze-results");
  const freeze = await __test.buildTestOnlyFinalApprovalFreeze(ledger.root, results.root);
  assert.equal(freeze.state, "provider-free-frozen-awaiting-explicit-user-approval");
  assert.equal(freeze.terminal_decision, "AWAITING_EXACT_DIGEST_BOUND_NUMERIC_APPROVAL");
  assert.match(freeze.exact_approval_text, new RegExp(freeze.closure_sha256, "u"));
  assert.equal(freeze.closure.approved_provider_request_ceiling, 72);
  assert.equal(freeze.closure.approved_generation_https_post_ceiling, 72);
  assert.equal(freeze.closure.approved_oauth_refresh_https_post_ceiling, 72);
  assert.equal(freeze.closure.approved_total_https_post_ceiling, 144);
  assert.equal(freeze.closure.approved_input_utf8_bytes_per_request, 32_768);
  assert.equal(freeze.closure.approved_provider_active_timeout_seconds_per_request, 300);
  assert.equal(freeze.closure.approved_maximum_sequential_provider_active_seconds, 15_120);
  assert.equal(freeze.closure.approved_output_plus_reasoning_acceptance_tokens_per_request, 128_000);
  assert.equal(freeze.closure.approved_output_plus_reasoning_acceptance_token_ceiling, 9_216_000);
  assert.equal(freeze.closure.approved_output_plus_reasoning_tokens_per_request, 128_000);
  assert.equal(freeze.closure.approved_output_plus_reasoning_token_ceiling, 9_216_000);
  assert.equal(freeze.closure.approved_credit_ceiling, 4_843.93);
  assert.equal(freeze.closure.approved_provider_equivalent_usd_ceiling, 193.76);
  assert.match(freeze.exact_approval_text, /36-attempt matrix.*36 top-level and 36 recursive-child reservations.*72 generation HTTPS POSTs.*72 OAuth-refresh HTTPS POSTs.*144 total HTTPS POSTs.*300 provider-active seconds per top-level request.*120 seconds per recursive child.*15,120 sequential provider-active seconds/u);
  assert.equal(freeze.closure.execution_closure.operational_timeouts_ms.host_ack, 30_000);
  assert.equal(freeze.closure.execution_closure.operational_timeouts_ms.host_process, 345_000);
  assert.equal(freeze.closure.supersession_lineage.schema_version, "rc7-gate-c-supersession-lineage-v12");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations.length, 3);
  assert.equal(freeze.closure.supersession_lineage.prior_smoke_attempts.length, 5);
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[0].activation.activation_sha256, "8ac19650d78b7be57e77b454e396d26344e1af7080b155457e077fca4d5f4633");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[1].activation.activation_sha256, "abd0c80b9a502b61506bc0bee8119b426dfdd7f773234963c6997e5ef825c48f");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[2].activation.activation_sha256, "a6306d45519a71d9f3fe8eb28ffda2c9e0883932bb2b5a4a27ab22cf836c3de2");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[1].failure.retained_failure_code, "MALFORMED_HOST_HANDOFF");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[2].failure.retained_failure_code, "MALFORMED_EXECUTION");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[1].attempt.disposition, "immutable-indeterminate-no-replay-excluded-from-second-repaired-36-attempt-matrix");
  assert.equal(freeze.closure.supersession_lineage.superseded_activations[2].attempt.disposition, "immutable-indeterminate-no-replay-excluded-from-third-repaired-36-attempt-matrix");
  for (const prior of freeze.closure.supersession_lineage.superseded_activations) {
    assert.equal(prior.conservative_accounting.generation_https_posts, 1);
    const { accounting_sha256: accountingSha256, ...accountingProjection } = prior.conservative_accounting;
    assert.equal(accountingSha256, sha256V1(canonicalJsonV1(accountingProjection)));
  }
  for (const prior of freeze.closure.supersession_lineage.prior_smoke_attempts) {
    assert.equal(prior.conservative_accounting.generation_https_posts, 1);
    assert.equal(prior.disposition, "immutable-indeterminate-no-replay-excluded-from-final-primary-matrix");
  }
  assert.equal(freeze.closure.supersession_lineage.prior_smoke_attempts[4].activation_sha256, "8849566f24bb9718265969aa8ca2b7e8b3369c37b71febcaf1c7adde3c314077");
  assert.equal(freeze.closure.supersession_lineage.provider_path_diagnostic.state, "passed-credential-transport-proof-excluded-from-matrix-score");
  assert.equal(freeze.closure.supersession_lineage.provider_path_diagnostic.retained_result.sha256, "8e589a2b37e4772c5414e9fe1653b180c594af176d2a8abbbe772c13a984910e");
  assert.equal(freeze.closure.supersession_lineage.provider_path_diagnostic.live_execution.generation_https_posts, 1);
  assert.equal(freeze.closure.supersession_lineage.provider_path_diagnostic.live_execution.oauth_refresh_https_posts, 0);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.activation_sha256, "735091b636f0a3668854d0d59bec50b660ca044df746023d81f8315eb4eab5ce");
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.retained_shape.attempts, 7);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.conservative_consumed_accounting.generation_https_posts, 7);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.retained_tree_evidence.ledger.tree_sha256, "d7bab1448423cd00d8195a2f47fe6769dcf978be57d829656462c27e11227eac");
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.retained_tree_evidence.results.tree_sha256, "97a8c917fbaa44c71496298e62a7e1bbc119414cce75e9f0d1b0a986d58ec282");
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v19.activation_sha256, "0924cac12dc57913fc7b12144dc7c693e3c02a80ac1d8b40fd748be6b9ff36fd");
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v19.retained_shape.attempts, 11);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v19.retained_shape.broker_terminals, 23);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v19.retained_rlm_roots.length, 4);
  assert.equal(freeze.closure.supersession_lineage.abandoned_partial_matrix_v19.retained_ledger_accounting_sha256, "4218f1863b6b78f21b21bf4ef7f72e1adccd5812a2e6475a3e88d5100b5020a1");
  assert.deepEqual(freeze.closure.supersession_lineage.cumulative_authority_ceiling, {
    generation_https_posts: 384,
    oauth_refresh_https_posts: 383,
    total_https_posts: 767,
    input_tokens: 12_550_217,
    hard_output_plus_reasoning_tokens: 39_200_000,
    provider_active_seconds: 69_300,
    planning_credits: 20_862.42,
    api_equivalent_planning_usd: 834.69,
    additional_credit_purchases: 0,
    incremental_cash_purchases: 0,
  });
  assert.match(freeze.exact_approval_text, /128,000 output-plus-reasoning post-response acceptance ceiling per request.*9,216,000 accepted total.*same 128,000 hard provider-authority ceiling per request.*9,216,000 hard-authority total/u);
  assert.match(freeze.exact_approval_text, /384 generation POSTs.*383 OAuth-refresh POSTs.*767 total POSTs.*12,550,217 input tokens.*39,200,000 hard output-plus-reasoning tokens.*69,300 provider-active seconds.*20,862\.42 planning credits.*USD 834\.69/u);
  assert.throws(() => __test.assertFreshRootsAgainstAbandonedPartialMatrix(
    freeze.closure.supersession_lineage.abandoned_partial_matrix_v18.ledger_root_identity,
    freeze.closure.results_root_identity,
    freeze.closure.supersession_lineage,
  ), (error) => error instanceof Rc7GateCBrokerError && error.code === "SUPERSEDED_ROOT_REUSE");
  assert.equal(freeze.operator_approval_record_contract.governance_nonclaim, "same-host durable approval is governance evidence, not cryptographic proof of human authorship or intent");
  assert.equal(freeze.accounting.provider_calls, 0);

  const duplicate = await __test.buildTestOnlyFinalApprovalFreeze(ledger.root, results.root);
  assert.equal(freeze.final_freeze_sha256, duplicate.final_freeze_sha256);
  assert.equal(freeze.future_activation_sha256, duplicate.future_activation_sha256);
  const tamperedProof = structuredClone(freeze.closure.successful_treatment_proof);
  tamperedProof.actual_accounting.generation_https_posts = 1;
  assert.throws(() => __test.validateSuccessfulTreatmentProofPrerequisite(tamperedProof, true), (error) => error.code === "MATRIX_PROOF_REQUIRED");
  const missingProof = await freshRoot("missing-proof");
  await expectCode(() => prepareRc7GateCFinalApprovalFreeze(
    missingProof.root, ledger.root, results.root, missingProof.parent, missingProof.parent, missingProof.parent,
  ), "OVERLAPPING_OUTPUT_ROOT");
});

test("historical physical-tree evidence fails closed on tamper, recreation, missing roots, and nested reuse", async () => {
  const retained = await freshRoot("historical-ledger");
  await mkdir(path.join(retained.root, "lane"));
  await writeFile(path.join(retained.root, "lane", "record.json"), "{\"state\":\"retained\"}\n");
  const identity = await __test.ledgerRootIdentity(retained.root, false);
  const tree = await __test.retainedPhysicalTreeEvidence(retained.root);
  await __test.assertRetainedHistoricalRoot(retained.root, identity, tree, "ledger");

  await writeFile(path.join(retained.root, "lane", "record.json"), "{\"state\":\"tampered\"}\n");
  await expectCode(() => __test.assertRetainedHistoricalRoot(retained.root, identity, tree, "ledger"), "SUPERSEDED_EVIDENCE_MISMATCH");

  const moved = `${retained.root}-preserved`;
  await rename(retained.root, moved);
  await mkdir(retained.root);
  await expectCode(() => __test.assertRetainedHistoricalRoot(retained.root, identity, tree, "ledger"), "SUPERSEDED_EVIDENCE_MISMATCH");
  await rm(retained.root, { recursive: true });
  await expectCode(() => __test.assertRetainedHistoricalRoot(retained.root, identity, tree, "ledger"), "MISSING_OUTPUT_ROOT");

  const lineage = __test.gateCRepairSupersessionLineage();
  const nested = structuredClone(lineage.abandoned_partial_matrix_v18.ledger_root_identity);
  nested.normalized_physical_root = path.join(nested.normalized_physical_root, "docker-cli-config");
  const freshResults = structuredClone(lineage.abandoned_partial_matrix_v18.results_root_identity);
  freshResults.normalized_physical_root = path.join(retained.parent, "fresh-results");
  freshResults.device_id = "1";
  freshResults.file_id = "2";
  freshResults.birthtime_ns = "3";
  assert.throws(() => __test.assertFreshRootsAgainstAbandonedPartialMatrix(
    nested,
    freshResults,
    lineage,
  ), (error) => error instanceof Rc7GateCBrokerError && error.code === "SUPERSEDED_ROOT_REUSE");
});

test("operator approval recording requires the exact successful proof and leaves no authority on mismatch", async () => {
  const target = await freshRoot("operator-approval-mismatch");
  const results = await freshRoot("operator-approval-results");
  const freeze = await __test.buildTestOnlyFinalApprovalFreeze(target.root, results.root);
  const proofLedger = await freshRoot("operator-proof-ledger");
  const proofResults = await freshRoot("operator-proof-results");
  const proofRlm = await freshRoot("operator-proof-rlm");
  await expectCode(() => recordRc7GateCOperatorApproval(target.root, {
    exact_approval_text: `${freeze.exact_approval_text} changed`,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    results_root: results.root,
    proof_ledger_root: proofLedger.root,
    proof_results_root: proofResults.root,
    proof_rlm_root: proofRlm.root,
  }), "MATRIX_PROOF_REQUIRED");
  assert.deepEqual(await readdir(target.root), []);
});

test("durable ledger consumes one immutable reservation, excludes concurrency, and denies replay", async () => {
  const root = await testLedger("ledger");
  const first = await requestFor("LAB-01", "rc-direct");
  const firstPermit = await __test.authorizeTestDispatch(root.root, first.intent);
  assert.equal(firstPermit.state, "reserved-test-only-provider-unreachable");
  const dispatch = await __test.consumeTestReservation(root.root, { intent: first.intent, permit: firstPermit });
  await expectCode(() => __test.consumeTestReservation(root.root, { intent: first.intent, permit: firstPermit }), "CONCURRENT_DISPATCH_EXCLUDED");
  await __test.closeTestReservation(root.root, dispatch, terminal(dispatch));
  await __test.closeTestReservation(root.root, dispatch, terminal(dispatch));
  await expectCode(() => __test.consumeTestReservation(root.root, { intent: first.intent, permit: firstPermit }), "DUPLICATE_RESERVATION");

  const left = await requestFor("PAPER-01", "rc-direct");
  const right = await requestFor("REPO-01", "rc-direct");
  const results = await Promise.allSettled([
    __test.consumeTestReservation(root.root, { intent: left.intent, permit: await __test.authorizeTestDispatch(root.root, left.intent) }),
    __test.consumeTestReservation(root.root, { intent: right.intent, permit: await __test.authorizeTestDispatch(root.root, right.intent) }),
  ]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected" && item.reason.code === "CONCURRENT_DISPATCH_EXCLUDED").length, 1);
  const winner = results.find((item) => item.status === "fulfilled").value;
  await __test.closeTestReservation(root.root, winner, terminal(winner));
});

test("provider preflight durably consumes one handoff before reachability and denies exact replay", async () => {
  const root = await testLedger("durable-handoff");
  const fixture = await directPreflightFixture(root.root, root.resultsRoot);
  const first = await __test.preflightTestLiveDispatch(fixture.input);
  assert.equal(first.durable_handoff.state, "preflight-consumed-provider-reachability-committed");
  assert.equal(first.durable_handoff.handoff_nonce, fixture.input.handoff_nonce);
  assert.deepEqual(await readdir(path.join(root.root, __test.HANDOFFS_DIR)), [`${fixture.dispatch.reservation_key}.json`]);
  await expectCode(() => __test.preflightTestLiveDispatch(fixture.input), "DURABLE_HANDOFF_REPLAY");
  await __test.recoverTestLedger(root.root);
  const accounting = await __test.extractTestLedgerAccounting(root.root);
  assert.equal(accounting.schema_version, "rc7-gate-c-ledger-accounting-v6");
  assert.equal(accounting.entries.length, 1);
  assert.equal(accounting.entries[0].accounting_basis, "conservative-upper-bound-after-indeterminate-handoff");
  assert.equal(accounting.entries[0].accepted_output_plus_reasoning_tokens, 0);
  assert.equal(accounting.entries[0].hard_output_plus_reasoning_token_accounting, 128_000);
});

test("host-launch lock recovery rejects live, malformed, and multiply-linked owners then removes one exact dead owner without replay", async () => {
  const root = await testLedger("host-lock-recovery");
  const fixture = await directPreflightFixture(root.root, root.resultsRoot);
  const first = await __test.preflightTestLiveDispatch(fixture.input);
  const target = path.join(root.root, __test.HOST_LAUNCH_LOCK);
  const base = {
    schema_version: "rc7-gate-c-host-launch-lock-v2",
    state: "handoff-written-awaiting-ack",
    normalized_ledger_root: root.root.toLowerCase(),
    activation_sha256: first.expected_closure.activation_sha256,
    run_id: fixture.input.sealed_request.intent.run_id,
    dispatch_sha256: fixture.dispatch.dispatch_sha256,
    durable_handoff_sha256: first.durable_handoff.durable_handoff_sha256,
    handoff_sha256: "e".repeat(64),
    nonce: first.durable_handoff.handoff_nonce,
    parent_pid: process.pid,
    child_pid: 99_999_999,
  };
  const writeLock = async (value) => writeFile(target, Buffer.from(`${canonicalJsonV1(withDigest(value, "host_lock_sha256"))}\n`, "utf8"));
  await writeLock(base);
  await expectCode(() => __test.recoverTestHostLaunchLock(root.root, base.run_id), "HOST_LAUNCH_CONCURRENT");

  await writeFile(target, Buffer.from(`${canonicalJsonV1({ ...withDigest({ ...base, parent_pid: 99_999_999 }, "host_lock_sha256"), host_lock_sha256: "0".repeat(64) })}\n`, "utf8"));
  await expectCode(() => __test.recoverTestHostLaunchLock(root.root, base.run_id), "HOST_LOCK_IDENTITY_MISMATCH");

  await writeLock({ ...base, parent_pid: 99_999_999 });
  const alias = path.join(root.parent, "host-lock-hardlink");
  await link(target, alias);
  await expectCode(() => __test.recoverTestHostLaunchLock(root.root, base.run_id), "HOST_LOCK_IDENTITY_MISMATCH");
  await rm(alias);

  const beforeWrongRunLock = await readFile(target);
  const beforeWrongRunActive = await readFile(path.join(root.root, __test.ACTIVE_DISPATCH));
  const otherRun = (await row("FACT-01", "rc-direct", 1)).run_id;
  await expectCode(() => __test.recoverTestHostLaunchLock(root.root, otherRun), "RUN_IDENTITY_MISMATCH");
  assert.deepEqual(await readFile(target), beforeWrongRunLock);
  assert.deepEqual(await readFile(path.join(root.root, __test.ACTIVE_DISPATCH)), beforeWrongRunActive);

  const recovered = await __test.recoverTestHostLaunchLock(root.root, base.run_id);
  assert.equal(recovered.classification, "dead-host-launch-lock-removed-before-no-replay-settlement");
  assert.equal(recovered.lifecycle_state, "handoff-written-awaiting-ack");
  assert.equal(recovered.request_kind, "top-level");
  assert.equal(recovered.child_sequence, 0);
  assert.equal(recovered.provider_authority_permitted, false);
  assert.deepEqual(await __test.recoverTestHostLaunchLock(root.root, base.run_id), {
    root: root.root, classification: "no-host-launch-lock", changed: false, provider_authority_permitted: false,
  });
  await __test.recoverTestLedger(root.root);
  assert.deepEqual((await __test.inspectTestLedger(root.root)).counts, { reservations: 1, terminals: 1, active_dispatches: 0, unterminated: 0 });
});

test("RLM-root qualification rejects exact historical reuse, nesting, aliasing, recreation, and physical identity reuse", async () => {
  const root = await testLedger("rlm-root-lineage");
  const treatment = await row("LAB-01", "rc-rlm", 1);
  const lineage = __test.gateCRepairSupersessionLineage();
  const historical = lineage.abandoned_partial_matrix_v19.retained_rlm_roots.find((item) => item.ordinal === 11).root_identity;
  await expectCode(
    () => __test.identifyTestRlmRootForAttempt(root.root, root.resultsRoot, treatment.run_id, historical.normalized_physical_root, true),
    process.platform === "win32" ? "SUPERSEDED_ROOT_REUSE" : "UNSAFE_OUTPUT_ROOT",
  );

  const native = await freshRoot("fresh-rlm-native");
  const accepted = await __test.identifyTestRlmRootForAttempt(root.root, root.resultsRoot, treatment.run_id, native.root, true);
  assert.equal(accepted.normalized_physical_root, native.root.toLowerCase());
  assert.deepEqual(await readdir(native.root), []);

  const alias = path.join(native.parent, "fresh-rlm-alias");
  await symlink(native.root, alias, "junction");
  await expectCode(
    () => __test.identifyTestRlmRootForAttempt(root.root, root.resultsRoot, treatment.run_id, alias, true),
    "ALIASED_OUTPUT_ROOT",
  );

  const nested = path.join(native.root, "nested");
  await mkdir(nested);
  const nestedIdentity = await __test.rlmHistoricalRootIdentity(nested, true);
  const parentPrior = { ...structuredClone(nestedIdentity), normalized_physical_root: native.root.toLowerCase(), file_id: "1", birthtime_ns: "1" };
  assert.throws(
    () => __test.assertFreshRlmRootIdentity(nestedIdentity, { ledger_root_identity: parentPrior, results_root_identity: null, successful_treatment_proof: null, supersession_lineage: null }),
    (error) => error instanceof Rc7GateCBrokerError && error.code === "SUPERSEDED_ROOT_REUSE",
  );

  const recreatedPrior = { ...structuredClone(accepted), file_id: "2", birthtime_ns: "2" };
  assert.throws(
    () => __test.assertFreshRlmRootIdentity(accepted, { ledger_root_identity: recreatedPrior, results_root_identity: null, successful_treatment_proof: null, supersession_lineage: null }),
    (error) => error instanceof Rc7GateCBrokerError && error.code === "SUPERSEDED_ROOT_REUSE",
  );
  const physicalAliasPrior = { ...structuredClone(accepted), normalized_physical_root: path.join(native.parent, "different-name").toLowerCase() };
  assert.throws(
    () => __test.assertFreshRlmRootIdentity(accepted, { ledger_root_identity: physicalAliasPrior, results_root_identity: null, successful_treatment_proof: null, supersession_lineage: null }),
    (error) => error instanceof Rc7GateCBrokerError && error.code === "SUPERSEDED_ROOT_REUSE",
  );
});

test("all 72 registered reservations fit exactly and a seventy-third is denied before reachability", async () => {
  const root = await testLedger("full-ledger");
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const requests = [];
  for (const scheduled of preregistration.ablation.schedule) {
    requests.push(await buildRc7GateCRequestIntent({ run_id: scheduled.run_id, request_kind: "top-level", child_sequence: 0, child_question: null, excerpt_locator: null }));
    if (scheduled.selected_route === "rc-rlm") {
      for (let sequence = 1; sequence <= 4; sequence += 1) requests.push(await buildRc7GateCRequestIntent({
        run_id: scheduled.run_id, request_kind: "recursive-child", child_sequence: sequence,
        child_question: "Identify the relationship supported by this exact registered record.",
        excerpt_locator: { kind: "json_pointer", source_id: `${scheduled.case_id.split("-")[0]}-SOURCE-${scheduled.case_id === "LAB-01" ? "OVERVIEW" : scheduled.case_id === "PAPER-01" ? "BODY" : "TREE"}-01`, pointer: "/sources/0/records/0" },
      }));
    }
  }
  assert.equal(requests.length, 72);
  for (const request of requests) {
    const permit = await __test.authorizeTestDispatch(root.root, request.intent);
    const dispatch = await __test.consumeTestReservation(root.root, { intent: request.intent, permit });
    await __test.closeTestReservation(root.root, dispatch, terminal(dispatch));
  }
  const repeated = requests[0];
  await expectCode(async () => __test.consumeTestReservation(root.root, { intent: repeated.intent, permit: await __test.authorizeTestDispatch(root.root, repeated.intent) }), "GLOBAL_REQUEST_BUDGET_EXCEEDED");
});

test("recovery never replays an unsealed provider-reachable dispatch", async () => {
  const request = await requestFor("PAPER-01");
  assert.deepEqual(classifyRc7GateCRecovery({ intent: request.intent, dispatch: null, sealed_result: null, publication: null }), {
    classification: "pre-dispatch-resumable", provider_reachable_dispatches: 0, replay_permitted: false, next_action: "await-exact-activation-or-abandon",
  });
  const dispatchValue = {
    schema_version: "rc7-gate-c-dispatch-checkpoint-v2", activation_sha256: "1".repeat(64), intent_sha256: request.intent.intent_sha256,
    permit_sha256: "2".repeat(64), dispatch_nonce: "3".repeat(64), run_id: request.intent.run_id, case_id: request.intent.case_id,
    arm: request.intent.arm, selected_route: request.intent.selected_route, request_kind: request.intent.request_kind,
    child_sequence: request.intent.child_sequence, semantic_request_sha256: request.intent.semantic_request_sha256,
    reservation_key: "4".repeat(64), reservation_ordinal: 1,
    state: "consumed-provider-reachable-handoff-started", dispatch_sha256: "5".repeat(64),
  };
  const dispatchProjection = { ...dispatchValue };
  delete dispatchProjection.dispatch_sha256;
  const dispatch = { ...dispatchValue, dispatch_sha256: sha256V1(canonicalJsonV1(dispatchProjection)) };
  assert.equal(classifyRc7GateCRecovery({ intent: request.intent, dispatch, sealed_result: null, publication: null }).classification, "indeterminate-unsealed-stop");
});

test("trusted close derives route identity and raw artifact observation from durable state", async () => {
  const root = await testLedger("trusted-terminal");
  const request = await requestFor("PAPER-01", "rc-rlm");
  const permit = await __test.authorizeTestDispatch(root.root, request.intent);
  const tampered = { ...permit, semantic_request_byte_count: permit.semantic_request_byte_count + 1 };
  const permitProjection = { ...tampered };
  delete permitProjection.permit_sha256;
  tampered.permit_sha256 = sha256V1(canonicalJsonV1(permitProjection));
  await expectCode(() => __test.consumeTestReservation(root.root, { intent: request.intent, permit: tampered }), "PERMIT_IDENTITY_MISMATCH");
  const dispatch = await __test.consumeTestReservation(root.root, { intent: request.intent, permit });
  await __test.closeTestReservation(root.root, dispatch, trustedTerminal(dispatch));
  const extracted = await __test.extractTestTrustedObservations(root.root);
  assert.equal(extracted.observations.length, 1);
  assert.deepEqual(extracted.observations[0], {
    schema_version: "rc7-gate-c-trusted-route-observation-v1",
    route_identity_valid: true,
    run_id: request.intent.run_id,
    case_id: request.intent.case_id,
    arm: request.intent.arm,
    selected_route: request.intent.selected_route,
    request_kind: "top-level",
    child_sequence: 0,
    semantic_request_sha256: request.intent.semantic_request_sha256,
    raw_artifact_sha256: "a".repeat(64),
    observation_sha256: extracted.observations[0].observation_sha256,
  });
  const observationProjection = { ...extracted.observations[0] };
  delete observationProjection.observation_sha256;
  assert.equal(extracted.observations[0].observation_sha256, sha256V1(canonicalJsonV1(observationProjection)));
});

test("durable recovery is idempotent, concurrent recovery is excluded, and a failed contender preserves the owner lock", async () => {
  const root = await testLedger("recovery-ledger");
  const request = await requestFor("REPO-01", "rc-direct");
  const permit = await __test.authorizeTestDispatch(root.root, request.intent);
  await __test.consumeTestReservation(root.root, { intent: request.intent, permit });
  assert.equal((await __test.inspectTestLedger(root.root)).state, "recovery-required-no-replay");

  const owner = await __test.acquireDispatchLock(root.root);
  await expectCode(() => __test.recoverTestLedger(root.root), "CONCURRENT_DISPATCH_EXCLUDED");
  assert.ok((await lstat(path.join(root.root, __test.DISPATCH_LOCK))).isFile());
  await __test.releaseDispatchLock(root.root, owner);

  const first = await __test.recoverTestLedger(root.root);
  const second = await __test.recoverTestLedger(root.root);
  assert.equal(first.classification, "indeterminate-recorded-no-replay");
  assert.equal(first.changed, true);
  assert.deepEqual(second, { root: root.root, classification: "settled-idempotent", changed: false, replay_permitted: false });
  assert.deepEqual((await __test.inspectTestLedger(root.root)).counts, { reservations: 1, terminals: 1, active_dispatches: 0, unterminated: 0 });
});

test("each operation rejects a reservations-directory junction replacement", async () => {
  const root = await testLedger("physical-ledger");
  const moved = path.join(root.parent, "moved-reservations");
  await rename(path.join(root.root, __test.RESERVATIONS_DIR), moved);
  await symlink(moved, path.join(root.root, __test.RESERVATIONS_DIR), "junction");
  await expectCode(() => __test.inspectTestLedger(root.root), "ALIASED_LEDGER_PATH");
});

test("each operation rejects a durable-handoffs-directory junction replacement", async () => {
  const root = await testLedger("physical-handoffs");
  const moved = path.join(root.parent, "moved-handoffs");
  await rename(path.join(root.root, __test.HANDOFFS_DIR), moved);
  await symlink(moved, path.join(root.root, __test.HANDOFFS_DIR), "junction");
  await expectCode(() => __test.inspectTestLedger(root.root), "ALIASED_LEDGER_PATH");
});

test("public inspect and recovery remain denied for the explicitly non-authorizing test ledger", async () => {
  const root = await testLedger("public-denial");
  const request = await requestFor("FACT-01");
  await expectCode(() => inspectRc7GateCDispatchLedger(root.root), "NUMERIC_APPROVAL_REQUIRED");
  await expectCode(() => recoverRc7GateCDispatchLedger(root.root), "NUMERIC_APPROVAL_REQUIRED");
  await expectCode(() => consumeRc7GateCDispatchReservation(root.root, { intent: request.intent, permit: {} }), "NUMERIC_APPROVAL_REQUIRED");
  await expectCode(() => closeRc7GateCDispatchReservation(root.root, {}, {}), "NUMERIC_APPROVAL_REQUIRED");
});

test("Gate B direct references require exact no-container non-applicability", () => {
  const expected = {
    activation_sha256: "2".repeat(64), intent_sha256: "3".repeat(64), dispatch_sha256: "1".repeat(64),
    selected_route: "rc-direct", request_kind: "top-level", semantic_request_sha256: "4".repeat(64), ledger_root: "F:\\rc7-test\\ledger",
  };
  const value = {
    schema_version: "rc7-gate-c-gate-b-live-attestation-v3",
    state: "not-applicable-direct-route",
    activation_sha256: expected.activation_sha256,
    intent_sha256: expected.intent_sha256,
    dispatch_sha256: expected.dispatch_sha256,
    container_id: null,
  };
  const attestation = { ...value, attestation_sha256: sha256V1(canonicalJsonV1(value)) };
  assert.equal(__test.validateGateBReference(attestation, expected), attestation);
  assert.throws(() => __test.validateGateBReference({ ...attestation, container_id: "a".repeat(64) }, expected), (error) => error.code === "GATE_B_ATTESTATION_MISMATCH");
});

test("Gate B RLM evidence is derived from an exact synthetic Docker inspection without invoking Docker", async () => {
  const seccompBytes = await readFile(path.join(__test.REPOSITORY_ROOT, "tests/recursus/fixtures/rc7-rlm-containment/outer-seccomp-default-errno.json"));
  const seccomp = `seccomp=${JSON.stringify(JSON.parse(seccompBytes.toString("utf8")))}`;
  const semanticRequest = { schema_version: "rc7-test-semantic-request-v1", visible_source: "synthetic-only" };
  const expected = {
    activation_sha256: "2".repeat(64), intent_sha256: "3".repeat(64), dispatch_sha256: "1".repeat(64),
    selected_route: "rc-rlm", run_id: "5".repeat(64), case_id: "LAB-01", arm: "rc-rlm",
    semantic_request: semanticRequest, semantic_request_sha256: sha256V1(Buffer.from(`${canonicalJsonV1(semanticRequest)}\n`, "utf8")),
    ledger_root: "F:\\rc7-test\\ledger", container_id: "a".repeat(64),
  };
  const holder = await freshRoot("gate-c-launcher");
  const context = await prepareRc7GateCRlmLauncher(holder.root, {
    activation_sha256: expected.activation_sha256, arm: expected.arm, case_id: expected.case_id,
    dispatch_sha256: expected.dispatch_sha256, image_id: RC7_GATE_C_RLM_IMAGE_ID,
    intent_sha256: expected.intent_sha256, run_identity: expected.run_id, selected_route: expected.selected_route,
    semantic_request: semanticRequest, semantic_request_sha256: expected.semantic_request_sha256,
  });
  expected.launcher_parent = {
    activation_sha256: expected.activation_sha256, run_id: expected.run_id, case_id: expected.case_id, arm: expected.arm,
    selected_route: "rc-rlm", intent_sha256: expected.intent_sha256, dispatch_sha256: expected.dispatch_sha256,
    semantic_request_sha256: expected.semantic_request_sha256, semantic_request: expected.semantic_request,
  };
  const create = buildRc7GateCRlmCreateArguments(context);
  const environment = Object.entries(RC7_GATE_C_RLM_INHERITED_ENVIRONMENT).map(([name, value]) => `${name}=${value}`);
  for (let index = 0; index < create.args.length; index += 1) if (create.args[index] === "--env") environment.push(create.args[index + 1]);
  const inspection = [{
    Id: expected.container_id,
    Image: RC7_GATE_C_RLM_IMAGE_ID,
    State: { Running: true, Paused: false, Restarting: false, Dead: false, Status: "running" },
    Config: { User: "65532:65532", Labels: create.labels, StopTimeout: 1, Env: environment, ExposedPorts: null },
    HostConfig: {
      NetworkMode: "none", ReadonlyRootfs: true, Privileged: false, IpcMode: "none", PidMode: "", CgroupnsMode: "private",
      CapAdd: [], CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true", seccomp], PidsLimit: 64,
      Memory: 805_306_368, MemorySwap: 805_306_368, NanoCpus: 1_000_000_000,
      Ulimits: [{ Name: "fsize", Soft: 1_048_576, Hard: 1_048_576 }, { Name: "nofile", Soft: 128, Hard: 128 }],
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
  const evidence = await __test.validateGateBDockerInspection(inspection, expected);
  assert.equal(evidence.state, "broker-verified-live-rlm-container");
  assert.equal(evidence.direct_container_provider_access, "denied-network-none");
  assert.equal(evidence.phase_two_tsync_proven, false);
  const widened = structuredClone(inspection);
  widened[0].HostConfig.NetworkMode = "bridge";
  await assert.rejects(() => __test.validateGateBDockerInspection(widened, expected), (error) => error.code === "GATE_B_CONTAINMENT_WEAKENED");
});

test("two fresh broker preparations are byte-identical and roots fail closed", async () => {
  const first = await freshRoot("first");
  const second = await freshRoot("second");
  const left = await prepareRc7GateCBrokerConformance(first.root);
  const right = await prepareRc7GateCBrokerConformance(second.root);
  assert.equal(left.broker_package_sha256, right.broker_package_sha256);
  assert.deepEqual(await readFile(left.package_path), await readFile(right.package_path));
  assert.deepEqual((await inspectRc7GateCBrokerConformance(first.root)).entries, [RC7_GATE_C_BROKER_PACKAGE_NAME]);

  const missing = await freshRoot("holder");
  await expectCode(() => prepareRc7GateCBrokerConformance(path.join(missing.parent, "missing")), "MISSING_OUTPUT_ROOT");
  const occupied = await freshRoot("occupied");
  await writeFile(path.join(occupied.root, "existing.txt"), "occupied");
  await expectCode(() => prepareRc7GateCBrokerConformance(occupied.root), "NONEMPTY_OUTPUT_ROOT");
  await expectCode(() => prepareRc7GateCBrokerConformance(__test.REPOSITORY_ROOT), "REPOSITORY_OUTPUT_ROOT");
  const protectedRoot = await freshRoot("holder-two");
  const secretRoot = path.join(protectedRoot.parent, "credentials", "root");
  await mkdir(secretRoot, { recursive: true });
  await expectCode(() => prepareRc7GateCBrokerConformance(secretRoot), "PROTECTED_OUTPUT_ROOT");
  const aliased = await freshRoot("native");
  const junction = path.join(aliased.parent, "junction");
  await symlink(aliased.root, junction, "junction");
  await expectCode(() => prepareRc7GateCBrokerConformance(junction), "ALIASED_OUTPUT_ROOT");
});

test("broker package and import surface remain provider-free and activation-denied", async () => {
  const value = await buildRc7GateCBrokerConformancePackage();
  validateRc7GateCBrokerConformancePackage(value);
  assert.equal(value.terminal_decision, RC7_GATE_C_BROKER_TERMINAL);
  assert.equal(value.activation.provider_reachable_now, false);
  assert.equal(value.accounting.provider_calls, 0);
  assert.equal(value.accounting.simulated_provider_requests, 0);
  assert.equal(value.accounting.credential_accesses, 0);
  const source = await readFile(path.join(__test.REPOSITORY_ROOT, "lib/recursus/rc7-rlm-gate-c-broker.mjs"), "utf8");
  assert.equal(source.includes('import { spawn } from "node:child_process"'), true);
  for (const denied of ["node:http", "node:https", "node:net", "node:tls", "node:dns", "globalThis.fetch", "WebSocket", "process.env", ".credentials.yaml", "jupyter", "zeromq"]) assert.equal(source.includes(denied), false, denied);
  assert.equal(source.includes("OPENAI_CODEX_OAUTH"), true);
  assert.match(source, /spawn\(executable, \["inspect", "--type", "container", containerId\]/u);
});
