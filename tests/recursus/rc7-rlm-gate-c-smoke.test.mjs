import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { canonicalJsonV1, sha256V1 } from "../../lib/recursus/prompt-context-v1.mjs";
import { buildRc7GateCRequestIntent } from "../../lib/recursus/rc7-rlm-gate-c-broker.mjs";
import { __test as hostTest } from "../../lib/recursus/rc7-rlm-gate-c-host-launcher.mjs";
import { __test as capsuleTest } from "../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs";
import { buildRc7GateCPreregistrationPackage } from "../../lib/recursus/rc7-rlm-gate-c-preregistration.mjs";
import { scoreRc7GateCStructuredOutput } from "../../lib/recursus/rc7-rlm-gate-c-scorer.mjs";
import {
  RC7_GATE_C_SMOKE_AUTHORITY_PROFILE,
  RC7_GATE_C_SMOKE_PERMISSION_POLICY_ID,
  RC7_GATE_C_SMOKE_SEALED_REQUEST_SCHEMA,
  __test as smokeTest,
  authorizeRc7GateCSmokeProviderDispatch,
  buildRc7GateCFixedSmokeRequest,
  buildRc7GateCSmokeDirectGateBReference,
  buildRc7GateCSmokeFinalApprovalFreeze,
  consumeRc7GateCSmokeDispatchReservation,
  initializeRc7GateCSmokeLedger,
  initializeRc7GateCSmokeResults,
  inspectRc7GateCSettledHistoricalSmoke,
  inspectRc7GateCSmokeLedger,
  inspectRc7GateCSmokeResult,
  preflightRc7GateCSmokeLiveDispatch,
  recordRc7GateCSmokeOperatorApproval,
  recoverRc7GateCSmoke,
  sealRc7GateCSmokeDispatchRequest,
  settleRc7GateCSmokeHostLaunchResult,
  settleRc7GateCSmokeSuccess,
  validateRc7GateCSmokeFinalApprovalFreeze,
} from "../../lib/recursus/rc7-rlm-gate-c-smoke.mjs";
import {
  buildRc7GateCSealedResult,
  classifyRc7GateCIntegrationFailurePhase,
  createRc7GateCStreamState,
  reduceRc7GateCStreamChunk,
  validateRc7GateCSealedWorkerRequest,
} from "../../lib/recursus/rc7-rlm-gate-c-worker.mjs";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "..", "..");
const SMOKE_CLI = path.join(REPOSITORY_ROOT, "scripts", "recursus", "rc7-rlm-gate-c-smoke.mjs");
const LIVE_CAPSULE_MODULE_URL = new URL("../../lib/recursus/rc7-rlm-gate-c-live-capsule.mjs", import.meta.url).href;
const WORKER_MODULE_URL = new URL("../../lib/recursus/rc7-rlm-gate-c-worker.mjs", import.meta.url).href;
const SAME_HOST_NONCLAIM = "same-host stage, pipe, process, and acknowledgment checks are governance evidence, not cryptographic proof against a hostile host administrator";

function projection(value, digestField) {
  const copy = structuredClone(value);
  delete copy[digestField];
  return copy;
}

function redigest(value, digestField) {
  const copy = projection(value, digestField);
  return { ...copy, [digestField]: sha256V1(canonicalJsonV1(copy)) };
}

function routeOutput() {
  return {
    schema_version: "rc7-gate-c-signature-output-v1",
    case_id: "SAFE-01",
    completion: "complete",
    evidence_items: [],
    gaps: [{ code: "insufficient_evidence", locators: [] }],
    safety_events: [],
  };
}

function successHostResult(lane) {
  const output = routeOutput();
  const raw = Buffer.from(canonicalJsonV1(output), "utf8");
  return {
    schema_version: "rc7-gate-c-host-launch-result-v1",
    state: "one-shot-child-complete",
    dispatch_sha256: lane.dispatch.dispatch_sha256,
    handoff_sha256: "9".repeat(64),
    transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" },
    result: {
      schema_version: "rc7-gate-c-live-capsule-result-v1",
      state: "success-pending-outer-seal",
      artifact: {
        schema_version: "rc7-gate-c-route-output-artifact-v1",
        case_id: "SAFE-01",
        output_utf8_byte_count: raw.byteLength,
        output_sha256: sha256V1(raw),
        output,
      },
      usage: {
        schema_version: "rc7-gate-c-sanitized-usage-v1",
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        reasoning_tokens: 25,
      },
      observations: {
        provider_posts: 1,
        oauth_refresh_posts: 0,
        adapter_revision: lane.request.intent.adapter_revision,
        provider: lane.request.intent.provider,
        model: lane.request.intent.model,
        reasoning: lane.request.intent.reasoning,
        provider_active_milliseconds: 250,
        automatic_retry_count: 0,
      },
    },
    same_host_governance_nonclaim: SAME_HOST_NONCLAIM,
  };
}

function failureHostResult(lane, code = "HOST_ACK_TIMEOUT", terminalKind = null, providerFailureCode = null, integrationFailurePhase = null, observations = null) {
  return {
    schema_version: "rc7-gate-c-host-launch-result-v1",
    state: "one-shot-child-complete",
    dispatch_sha256: lane.dispatch.dispatch_sha256,
    handoff_sha256: "8".repeat(64),
    transport: { kind: "anonymous-inherited-pipes", handoff_fd: 3, ack_fd: 4, commit_fd: 5, path_authority: "none-no-filesystem-handoff" },
    result: {
      schema_version: "rc7-gate-c-live-capsule-failure-v4",
      state: "failed-no-replay",
      code,
      terminal_kind: terminalKind,
      provider_failure_code: providerFailureCode,
      integration_failure_phase: integrationFailurePhase,
      observations: observations ?? { provider_posts: 0, refresh_posts: 0, provider_active_milliseconds: 0, automatic_retry_count: 0 },
    },
    same_host_governance_nonclaim: SAME_HOST_NONCLAIM,
  };
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SMOKE_CLI, ...args], {
      cwd: REPOSITORY_ROOT,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "DSH_HOME")),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
  });
}

function runValidatedWrapperFailureSubprocess(preflight) {
  const source = `
    import { __test } from ${JSON.stringify(LIVE_CAPSULE_MODULE_URL)};
    import { createRc7GateCStreamState, reduceRc7GateCStreamChunk } from ${JSON.stringify(WORKER_MODULE_URL)};
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const preflight = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let stream = createRc7GateCStreamState();
    stream = reduceRc7GateCStreamChunk(stream, { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
    stream = reduceRc7GateCStreamChunk(stream, {
      type: "finish",
      reason: {
        kind: "error",
        failure: {
          code: "INTEGRATION",
          message: "provider prose must not be retained",
          requestId: "request-id-must-not-be-retained",
        },
      },
    });
    const observations = {
      provider_posts: 0,
      refresh_posts: 0,
      provider_active_milliseconds: 25,
      automatic_retry_count: 0,
    };
    let result;
    try {
      __test.finalizeStreamBeforeSuccessPostcondition(stream, "SAFE-01", { snapshot: () => ({ provider_posts: 0, refresh_posts: 0 }) });
      throw new Error("error terminal unexpectedly finalized as success");
    } catch (error) {
      result = __test.closedFailureResultFromValidatedPreflight(error, preflight, observations);
    }
    process.stdout.write(JSON.stringify(result));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: REPOSITORY_ROOT,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") }));
    child.stdin.end(JSON.stringify(preflight));
  });
}

async function expectCode(action, codes) {
  const expected = new Set(Array.isArray(codes) ? codes : [codes]);
  await assert.rejects(action, (error) => expected.has(error?.code));
}

async function freshRoots(t, suffix = "") {
  const base = await mkdtemp(path.join(tmpdir(), `rc7-gate-c-smoke-test${suffix}-`));
  const ledgerRoot = path.join(base, "smoke-ledger");
  const resultsRoot = path.join(base, "smoke-results");
  await Promise.all([mkdir(ledgerRoot), mkdir(resultsRoot)]);
  t.after(async () => { await rm(base, { recursive: true, force: true }); });
  return { base, ledgerRoot, resultsRoot };
}

async function approvedLane(t, suffix = "") {
  const roots = await freshRoots(t, suffix);
  const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(roots.ledgerRoot, roots.resultsRoot);
  await recordRc7GateCSmokeOperatorApproval(roots.ledgerRoot, {
    exact_approval_text: freeze.exact_approval_text,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    results_root: roots.resultsRoot,
  });
  await initializeRc7GateCSmokeLedger(roots.ledgerRoot);
  await initializeRc7GateCSmokeResults(roots.resultsRoot, roots.ledgerRoot);
  return { ...roots, freeze };
}

async function preparedDispatch(t, suffix = "") {
  const lane = await approvedLane(t, suffix);
  const request = await buildRc7GateCFixedSmokeRequest();
  const permit = await authorizeRc7GateCSmokeProviderDispatch(lane.ledgerRoot, request.intent);
  const dispatch = await consumeRc7GateCSmokeDispatchReservation(lane.ledgerRoot, { intent: request.intent, permit });
  const sealed = await sealRc7GateCSmokeDispatchRequest(lane.ledgerRoot, { dispatch_sha256: dispatch.dispatch_sha256, request });
  const gateB = buildRc7GateCSmokeDirectGateBReference({
    activation_sha256: dispatch.activation_sha256,
    intent: request.intent,
    dispatch,
  });
  return { ...lane, request, permit, dispatch, sealed, gateB };
}

async function preflight(t, suffix = "") {
  const lane = await preparedDispatch(t, suffix);
  const handoffNonce = "f".repeat(64);
  const brokerResult = await preflightRc7GateCSmokeLiveDispatch({
    dispatch_sha256: lane.dispatch.dispatch_sha256,
    gate_b_attestation: lane.gateB,
    handoff_nonce: handoffNonce,
    ledger_root: lane.ledgerRoot,
    sealed_request: lane.sealed,
  });
  return { ...lane, handoffNonce, brokerResult };
}

test("smoke registration is a distinct SAFE-01 direct non-matrix and evaluator-blind identity", async () => {
  const preregistration = await buildRc7GateCPreregistrationPackage();
  const request = await buildRc7GateCFixedSmokeRequest();
  const matrixRows = preregistration.ablation.schedule;
  const reference = matrixRows.filter((row) => row.case_id === "SAFE-01" && row.arm === "rc-direct" && row.repeat_index === 3);

  assert.equal(matrixRows.length, 36);
  assert.equal(new Set(matrixRows.map((row) => row.run_id)).size, 36);
  assert.equal(matrixRows.some((row) => row.run_id === request.intent.run_id), false);
  assert.equal(reference.length, 1);
  assert.equal(reference[0].run_id, smokeTest.REFERENCE_MATRIX_RUN_ID);
  assert.equal(request.intent.run_id, smokeTest.SMOKE_RUN_ID);
  assert.equal(request.intent.reference_matrix_run_id, reference[0].run_id);
  assert.equal(request.intent.case_id, "SAFE-01");
  assert.equal(request.intent.arm, "rc-direct");
  assert.equal(request.intent.selected_route, "rc-direct");
  assert.equal(request.intent.matrix_member, false);
  assert.equal(request.intent.score_bearing, false);
  assert.equal(request.intent.request_kind, "top-level");
  assert.equal(request.intent.child_sequence, 0);
  assert.equal(request.intent.semantic_request_sha256, smokeTest.REFERENCE_SEMANTIC_SHA256);
  assert.equal(request.intent.semantic_request_sha256, sha256V1(request.semantic_request_bytes));
  assert.doesNotMatch(canonicalJsonV1(request.intent), /(?:evaluator|oracle|expected_relationship|leak_canary|scorer)/iu);
  assert.doesNotMatch(request.semantic_request_bytes.toString("utf8"), /(?:leak_canary|expected_relationships|evaluator_oracle|scorer_contract_sha256)/iu);
});

test("matrix APIs reject the smoke identity and smoke intent rejects matrix, evaluator, and scorer authority", async () => {
  await expectCode(() => buildRc7GateCRequestIntent({
    run_id: smokeTest.SMOKE_RUN_ID,
    request_kind: "top-level",
    child_sequence: 0,
    child_question: null,
    excerpt_locator: null,
  }), "RUN_IDENTITY_MISMATCH");
  await expectCode(() => scoreRc7GateCStructuredOutput({
    run_id: smokeTest.SMOKE_RUN_ID,
    raw_output: "{}",
    trusted_observation: {},
  }), "RUN_IDENTITY_MISMATCH");

  const fixed = await buildRc7GateCFixedSmokeRequest();
  const matrixIntent = structuredClone(fixed.intent);
  matrixIntent.run_id = smokeTest.REFERENCE_MATRIX_RUN_ID;
  matrixIntent.intent_sha256 = sha256V1(canonicalJsonV1(projection(matrixIntent, "intent_sha256")));
  assert.throws(() => smokeTest.validateSmokeIntent(matrixIntent), { code: "SMOKE_INTENT_MISMATCH" });

  for (const field of ["evaluator_contract_sha256", "scorer_contract_sha256"]) {
    const leaked = structuredClone(fixed.intent);
    leaked[field] = "0".repeat(64);
    leaked.intent_sha256 = sha256V1(canonicalJsonV1(projection(leaked, "intent_sha256")));
    assert.throws(() => smokeTest.validateSmokeIntent(leaked), { code: "SMOKE_SCHEMA_MISMATCH" });
  }
});

test("freeze is deterministic and closes one direct request with zero child, RLM, Docker, retry, score, or matrix authority", async (t) => {
  const { ledgerRoot, resultsRoot } = await freshRoots(t);
  const first = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  const second = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  assert.deepEqual(first, second);
  assert.equal(validateRc7GateCSmokeFinalApprovalFreeze(first), first);
  assert.equal(first.closure.matrix_member, false);
  assert.equal(first.closure.score_bearing, false);
  assert.equal(first.closure.approved_generation_https_post_ceiling, 1);
  assert.equal(first.closure.approved_oauth_refresh_https_post_ceiling, 1);
  assert.equal(first.closure.approved_total_https_post_ceiling, 2);
  assert.equal(first.closure.approved_child_request_ceiling, 0);
  assert.equal(first.closure.approved_rlm_execution_ceiling, 0);
  assert.equal(first.closure.approved_docker_invocation_ceiling, 0);
  assert.equal(first.closure.approved_automatic_retries, 0);
  assert.equal(first.closure.approved_concurrency, 1);
  assert.equal(first.closure.smoke_registration.run_manifest.smoke_attempt_ordinal, 6);
  assert.equal(first.closure.smoke_registration.run_manifest.prior_smoke_run_id, "c02cfcb43850796b65d56f3d51efc7a492b38814325fdcbd2f4e10a79fa0ee13");
  assert.equal(first.closure.historical_disclosure.matrix_attempts.length, 3);
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts.length, 5);
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[0].retained_failure_code, "PROVIDER_DISPATCH_COUNT_MISMATCH");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[1].retained_failure_code, "UNTRUSTED_TERMINAL");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[2].retained_failure_code, "SMOKE_SCHEMA_MISMATCH");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[3].retained_failure_code, "PROVIDER_TERMINAL_REJECTED");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[3].provider_failure_code, "INTEGRATION");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[3].integration_failure_phase, null);
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[4].retained_failure_code, "PROVIDER_DISPATCH_COUNT_MISMATCH");
  assert.equal(first.closure.historical_disclosure.prior_smoke_attempts[4].integration_failure_phase, null);
  assert.deepEqual(first.closure.historical_disclosure.smoke_plus_history_cumulative_ceiling, {
    generation_https_posts: 9,
    oauth_refresh_https_posts: 9,
    total_https_posts: 18,
    input_tokens: 294_912,
    output_plus_reasoning_tokens: 73_728,
    provider_active_seconds: 1_080,
    planning_credits: 66.37,
    api_equivalent_planning_usd: 2.67,
    additional_credit_purchases: 0,
    incremental_cash_purchases: 0,
  });
  assert.equal(first.closure.execution_closure.structured_output_validator_module.path, "lib/recursus/rc7-rlm-gate-c-output-grammar.mjs");
  assert.doesNotMatch(canonicalJsonV1(first.closure.execution_closure), /gate-c-scorer/u);
  assert.deepEqual(first.accounting, {
    provider_calls: 0,
    simulated_provider_requests: 0,
    credential_accesses: 0,
    rlm_executions: 0,
    docker_invocations: 0,
    network_actions: 0,
    required_operator_steps: 1,
  });
});

test("missing, broad, repository, protected, overlapping, nonempty, and aliased smoke roots fail closed", async (t) => {
  const { base, ledgerRoot, resultsRoot } = await freshRoots(t);
  const missing = path.join(base, "missing-smoke-ledger");
  const protectedRoot = path.join(base, "smoke-credentials");
  const aliasedRoot = path.join(base, "smoke-ledger-alias");
  await mkdir(protectedRoot);
  await symlink(ledgerRoot, aliasedRoot, process.platform === "win32" ? "junction" : "dir");

  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(missing, resultsRoot), "MISSING_SMOKE_ROOT");
  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(tmpdir(), resultsRoot), "BROAD_SMOKE_ROOT");
  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(REPOSITORY_ROOT, resultsRoot), "REPOSITORY_SMOKE_ROOT");
  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(protectedRoot, resultsRoot), "PROTECTED_SMOKE_ROOT");
  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, ledgerRoot), "OVERLAPPING_SMOKE_ROOTS");
  await expectCode(() => buildRc7GateCSmokeFinalApprovalFreeze(aliasedRoot, resultsRoot), "ALIASED_SMOKE_ROOT");

  const freeze = await buildRc7GateCSmokeFinalApprovalFreeze(ledgerRoot, resultsRoot);
  await writeFile(path.join(ledgerRoot, "unrelated.txt"), "residue", "utf8");
  await expectCode(() => recordRc7GateCSmokeOperatorApproval(ledgerRoot, {
    exact_approval_text: freeze.exact_approval_text,
    final_freeze_sha256: freeze.final_freeze_sha256,
    future_activation_sha256: freeze.future_activation_sha256,
    results_root: resultsRoot,
  }), "NONEMPTY_SMOKE_ROOT");
});

test("one reservation is consumed exactly once and remains direct with zero child or RLM authority", async (t) => {
  const lane = await approvedLane(t);
  const request = await buildRc7GateCFixedSmokeRequest();
  const permit = await authorizeRc7GateCSmokeProviderDispatch(lane.ledgerRoot, request.intent);
  const attempts = await Promise.allSettled([
    consumeRc7GateCSmokeDispatchReservation(lane.ledgerRoot, { intent: request.intent, permit }),
    consumeRc7GateCSmokeDispatchReservation(lane.ledgerRoot, { intent: request.intent, permit }),
  ]);
  const successes = attempts.filter((attempt) => attempt.status === "fulfilled");
  const failures = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.ok(["CONCURRENT_SMOKE_OPERATION_EXCLUDED", "SMOKE_RESERVATION_EXHAUSTED"].includes(failures[0].reason?.code));
  const dispatch = successes[0].value;
  assert.equal(dispatch.selected_route, "rc-direct");
  assert.equal(dispatch.request_kind, "top-level");
  assert.equal(dispatch.child_sequence, 0);
  assert.equal(dispatch.matrix_member, false);
  assert.equal(dispatch.score_bearing, false);
  const state = await inspectRc7GateCSmokeLedger(lane.ledgerRoot);
  assert.deepEqual(state.counts, { reservations: 1, durable_handoffs: 0, terminals: 0 });
  await expectCode(() => consumeRc7GateCSmokeDispatchReservation(lane.ledgerRoot, { intent: request.intent, permit }), "SMOKE_RESERVATION_EXHAUSTED");
  assert.throws(() => buildRc7GateCSmokeDirectGateBReference({
    activation_sha256: dispatch.activation_sha256,
    intent: request.intent,
    dispatch,
    container_id: "forbidden-container",
  }), { code: "SMOKE_GATE_B_REFERENCE_MISMATCH" });
});

test("shared worker accepts the exact smoke schema and rejects matrix-smoke schema mixing", async (t) => {
  const lane = await preparedDispatch(t);
  const expected = {
    activation_sha256: lane.sealed.activation_sha256,
    smoke_registration_sha256: lane.sealed.smoke_registration_sha256,
    smoke_module_sha256: lane.sealed.smoke_module_sha256,
    broker_module_sha256: lane.sealed.broker_module_sha256,
    worker_package_sha256: lane.sealed.worker_package_sha256,
    live_capsule_sha256: lane.sealed.live_capsule_sha256,
    worker_stage_manifest_sha256: lane.sealed.worker_stage_manifest_sha256,
    permission_policy_identity: lane.sealed.permission_policy_identity,
  };
  const accepted = validateRc7GateCSealedWorkerRequest(lane.sealed, expected);
  assert.equal(accepted.intent.run_id, smokeTest.SMOKE_RUN_ID);
  assert.equal(accepted.intent.matrix_member, false);
  assert.equal(accepted.intent.score_bearing, false);

  const mixedOuter = redigest({ ...structuredClone(lane.sealed), schema_version: "rc7-gate-c-sealed-worker-request-v1" }, "sealed_request_sha256");
  assert.throws(() => validateRc7GateCSealedWorkerRequest(mixedOuter, expected), (error) => ["MALFORMED_WORKER_INPUT", "SCHEMA_MISMATCH"].includes(error?.code));
  const mixedIntent = structuredClone(lane.sealed);
  mixedIntent.intent.schema_version = "rc7-gate-c-request-intent-v2";
  mixedIntent.intent = redigest(mixedIntent.intent, "intent_sha256");
  mixedIntent.sealed_request_sha256 = sha256V1(canonicalJsonV1(projection(mixedIntent, "sealed_request_sha256")));
  assert.throws(() => validateRc7GateCSealedWorkerRequest(mixedIntent, expected), (error) => ["INTENT_IDENTITY_MISMATCH", "MALFORMED_WORKER_INPUT", "SCHEMA_MISMATCH"].includes(error?.code));
});

test("shared host and capsule accept the smoke handoff while rejecting mixed schemas before execution", async (t) => {
  const lane = await preflight(t);
  assert.equal(hostTest.validateBrokerResult(lane.brokerResult), lane.brokerResult);
  const built = hostTest.buildHandoffRecord(lane.brokerResult, lane.handoffNonce);
  assert.equal(hostTest.validateHandoffRecord(built.value), built.value);
  assert.doesNotMatch(built.bytes.toString("utf8"), /(?:evaluator_oracle|approval_text|operator_approval|credential_path|credential_value)/iu);

  const trust = {
    stage_manifest_sha256: lane.brokerResult.expected_closure.worker_stage_manifest_sha256,
    capsule_sha256: lane.brokerResult.expected_closure.live_capsule_sha256,
  };
  let ack;
  const accepted = await capsuleTest.acceptHostHandoffWithIo({
    read_handoff: async () => structuredClone(built.value),
    write_ack: async (value) => { ack = structuredClone(value); },
    read_commit: async () => hostTest.buildCommit(built.value, ack),
  }, trust);
  assert.equal(accepted.handoff.broker.dispatch.run_id, smokeTest.SMOKE_RUN_ID);
  assert.equal(accepted.handoff.broker.dispatch.selected_route, "rc-direct");
  assert.equal(accepted.handoff.broker.dispatch.matrix_member, false);
  assert.equal(accepted.handoff.broker.dispatch.score_bearing, false);

  const subprocess = await runValidatedWrapperFailureSubprocess(accepted.handoff.broker.sealed);
  assert.equal(subprocess.code, 0, subprocess.stderr);
  assert.equal(subprocess.signal, null);
  assert.equal(subprocess.stderr, "");
  const closedFailure = JSON.parse(subprocess.stdout);
  assert.equal(closedFailure.schema_version, "rc7-gate-c-live-capsule-failure-v4");
  assert.equal(closedFailure.state, "failed-no-replay");
  assert.equal(closedFailure.code, "PROVIDER_TERMINAL_REJECTED");
  assert.equal(closedFailure.terminal_kind, "error");
  assert.equal(closedFailure.provider_failure_code, "INTEGRATION");
  assert.equal(closedFailure.integration_failure_phase, "NO_NETWORK_POST_ADMITTED");
  assert.deepEqual(closedFailure.observations, {
    provider_posts: 0,
    refresh_posts: 0,
    provider_active_milliseconds: 25,
    automatic_retry_count: 0,
  });
  assert.doesNotMatch(subprocess.stdout, /(?:provider prose|request-id-must-not-be-retained|provider_message|request_id)/u);

  const output = canonicalJsonV1(routeOutput());
  let successfulStream = createRc7GateCStreamState();
  successfulStream = reduceRc7GateCStreamChunk(successfulStream, { type: "block-start", index: 0, blockType: "text" });
  successfulStream = reduceRc7GateCStreamChunk(successfulStream, { type: "text-delta", index: 0, text: output });
  successfulStream = reduceRc7GateCStreamChunk(successfulStream, { type: "block-end", index: 0, block: { type: "text", text: output } });
  successfulStream = reduceRc7GateCStreamChunk(successfulStream, { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } });
  successfulStream = reduceRc7GateCStreamChunk(successfulStream, { type: "finish", reason: { kind: "stop" } });
  assert.throws(
    () => capsuleTest.finalizeStreamBeforeSuccessPostcondition(successfulStream, "SAFE-01", { snapshot: () => ({ provider_posts: 0, refresh_posts: 0 }) }),
    { code: "PROVIDER_DISPATCH_COUNT_MISMATCH" },
  );

  const mixed = structuredClone(built.value);
  mixed.broker_result.sealed.schema_version = "rc7-gate-c-sealed-worker-request-v1";
  mixed.handoff_sha256 = sha256V1(canonicalJsonV1(projection(mixed, "handoff_sha256")));
  await assert.rejects(capsuleTest.acceptHostHandoffWithIo({
    read_handoff: async () => mixed,
    write_ack: async () => assert.fail("mixed schema reached acknowledgment"),
    read_commit: async () => assert.fail("mixed schema reached commit"),
  }, trust));
});

test("recovery is idempotent, retains no replay, and distinguishes pre-handoff zero from post-handoff upper-bound accounting", async (t) => {
  const before = await preparedDispatch(t, "-before");
  const recoveredBefore = await recoverRc7GateCSmoke({ ledger_root: before.ledgerRoot, results_root: before.resultsRoot });
  const repeatedBefore = await recoverRc7GateCSmoke({ ledger_root: before.ledgerRoot, results_root: before.resultsRoot });
  const beforeRecord = JSON.parse(await readFile(path.join(before.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(recoveredBefore.classification, "smoke-terminal-recovered-no-replay");
  assert.equal(repeatedBefore.classification, "settled-idempotent");
  assert.equal(repeatedBefore.changed, false);
  assert.equal(beforeRecord.accounting.basis, "exact-zero-before-durable-handoff");
  assert.equal(beforeRecord.accounting.provider_posts, 0);
  assert.equal(beforeRecord.replay_permitted, false);
  assert.equal(beforeRecord.score, null);
  await expectCode(() => consumeRc7GateCSmokeDispatchReservation(before.ledgerRoot, { intent: before.request.intent, permit: before.permit }), "SMOKE_RESERVATION_EXHAUSTED");

  const after = await preflight(t, "-after");
  const recoveredAfter = await recoverRc7GateCSmoke({ ledger_root: after.ledgerRoot, results_root: after.resultsRoot });
  const repeatedAfter = await recoverRc7GateCSmoke({ ledger_root: after.ledgerRoot, results_root: after.resultsRoot });
  const afterRecord = JSON.parse(await readFile(path.join(after.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(recoveredAfter.classification, "smoke-terminal-recovered-no-replay");
  assert.equal(repeatedAfter.classification, "settled-idempotent");
  assert.equal(afterRecord.accounting.basis, "conservative-upper-bound-after-durable-handoff");
  assert.equal(afterRecord.accounting.provider_posts, 1);
  assert.equal(afterRecord.replay_permitted, false);
  assert.equal(afterRecord.raw_output_retained, false);
  assert.equal(afterRecord.matrix_member, false);
  assert.equal(afterRecord.score_bearing, false);
});

test("trusted success retains only digest evidence and never becomes score-bearing", async (t) => {
  const lane = await preflight(t);
  const sealedResult = buildRc7GateCSealedResult({
    activation_sha256: lane.dispatch.activation_sha256,
    intent_sha256: lane.dispatch.intent_sha256,
    permit_sha256: lane.dispatch.permit_sha256,
    dispatch_nonce: lane.dispatch.dispatch_nonce,
    artifact_sha256: "a".repeat(64),
    usage_sha256: "b".repeat(64),
    provenance_sha256: "c".repeat(64),
    permission_sha256: "d".repeat(64),
    authority_sha256: "e".repeat(64),
    cleanup_sha256: "f".repeat(64),
  });
  await settleRc7GateCSmokeSuccess({
    accounting: {
      provider_posts: 1,
      oauth_refresh_posts: 0,
      input_tokens: 100,
      output_plus_reasoning_tokens: 50,
      provider_active_milliseconds: 250,
      automatic_retry_count: 0,
    },
    dispatch: lane.dispatch,
    ledger_root: lane.ledgerRoot,
    results_root: lane.resultsRoot,
    sealed_result: sealedResult,
  });
  const inspected = await inspectRc7GateCSmokeResult(lane.resultsRoot, lane.ledgerRoot);
  const retained = JSON.parse(await readFile(path.join(lane.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(inspected.results, 1);
  assert.equal(inspected.matrix_member, false);
  assert.equal(inspected.score_bearing, false);
  assert.equal(inspected.replay_permitted, false);
  assert.equal(retained.state, "smoke-succeeded-nonscore");
  assert.equal(retained.sealed_result_digests.sealed_result_sha256, sealedResult.sealed_result_sha256);
  assert.equal(retained.raw_output_retained, false);
  assert.equal(retained.score, null);
  assert.equal(Object.hasOwn(retained, "raw_output"), false);
  assert.equal(await recoverRc7GateCSmoke({ ledger_root: lane.ledgerRoot, results_root: lane.resultsRoot }).then((value) => value.classification), "settled-idempotent");
});

test("closed host-result bridge independently seals exact success into digest-only non-score evidence", async (t) => {
  const lane = await preflight(t);
  const settled = await settleRc7GateCSmokeHostLaunchResult({
    dispatch: lane.dispatch,
    gate_b_attestation: lane.gateB,
    host_result: successHostResult(lane),
    ledger_root: lane.ledgerRoot,
    results_root: lane.resultsRoot,
  });
  const retained = JSON.parse(await readFile(path.join(lane.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(settled.result_sha256, retained.result_sha256);
  assert.equal(retained.state, "smoke-succeeded-nonscore");
  assert.equal(retained.accounting.basis, "exact-sealed-provider-observation");
  assert.equal(retained.accounting.provider_posts, 1);
  assert.equal(retained.accounting.automatic_retry_count, 0);
  assert.equal(retained.matrix_member, false);
  assert.equal(retained.score_bearing, false);
  assert.equal(retained.raw_output_retained, false);
  assert.equal(retained.score, null);
  assert.equal(Object.hasOwn(retained, "raw_output"), false);
  assert.equal(Object.hasOwn(retained, "artifact"), false);
});

test("closed host-result bridge preserves exact failure code and rejects malformed outer results", async (t) => {
  const failed = await preflight(t, "-failure");
  await settleRc7GateCSmokeHostLaunchResult({
    dispatch: failed.dispatch,
    gate_b_attestation: failed.gateB,
    host_result: failureHostResult(failed, "HOST_ACK_TIMEOUT"),
    ledger_root: failed.ledgerRoot,
    results_root: failed.resultsRoot,
  });
  const failedRecord = JSON.parse(await readFile(path.join(failed.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(failedRecord.state, "smoke-indeterminate-no-replay");
  assert.equal(failedRecord.failure_code, "HOST_ACK_TIMEOUT");
  assert.equal(failedRecord.accounting.basis, "conservative-upper-bound-after-durable-handoff");
  assert.equal(failedRecord.replay_permitted, false);
  assert.equal(failedRecord.raw_output_retained, false);
  assert.equal(failedRecord.score, null);

  const malformed = await preflight(t, "-malformed");
  const widened = { ...successHostResult(malformed), score: 1 };
  await expectCode(() => settleRc7GateCSmokeHostLaunchResult({
    dispatch: malformed.dispatch,
    gate_b_attestation: malformed.gateB,
    host_result: widened,
    ledger_root: malformed.ledgerRoot,
    results_root: malformed.resultsRoot,
  }), "SMOKE_SCHEMA_MISMATCH");
  const recovered = await recoverRc7GateCSmoke({ ledger_root: malformed.ledgerRoot, results_root: malformed.resultsRoot });
  const malformedRecord = JSON.parse(await readFile(path.join(malformed.resultsRoot, "smoke-result.json"), "utf8"));
  assert.equal(recovered.classification, "smoke-terminal-recovered-no-replay");
  assert.equal(malformedRecord.failure_code, "INTERRUPTED_SMOKE_RECOVERED_NO_REPLAY");
  assert.equal(malformedRecord.replay_permitted, false);
  assert.equal(malformedRecord.raw_output_retained, false);
  assert.equal(malformedRecord.score, null);
});

test("closed provider terminal detail is retained without provider prose and settled evidence remains source-independent read-only", async (t) => {
  const lane = await preflight(t, "-provider-terminal");
  const observations = { provider_posts: 1, refresh_posts: 0, provider_active_milliseconds: 25, automatic_retry_count: 0 };
  assert.equal(classifyRc7GateCIntegrationFailurePhase({ ...observations, provider_posts: 0 }), "NO_NETWORK_POST_ADMITTED");
  assert.equal(classifyRc7GateCIntegrationFailurePhase({ ...observations, provider_posts: 0, refresh_posts: 1 }), "OAUTH_REFRESH_POST_ADMITTED_NO_PROVIDER_POST");
  assert.equal(classifyRc7GateCIntegrationFailurePhase(observations), "PROVIDER_POST_ADMITTED");
  await settleRc7GateCSmokeHostLaunchResult({
    dispatch: lane.dispatch,
    gate_b_attestation: lane.gateB,
    host_result: failureHostResult(lane, "PROVIDER_TERMINAL_REJECTED", "error", "INTEGRATION", "PROVIDER_POST_ADMITTED", observations),
    ledger_root: lane.ledgerRoot,
    results_root: lane.resultsRoot,
  });
  const retainedBytes = await readFile(path.join(lane.resultsRoot, "smoke-result.json"), "utf8");
  const retained = JSON.parse(retainedBytes);
  assert.equal(retained.failure_code, "PROVIDER_TERMINAL_REJECTED");
  assert.equal(retained.terminal_kind, "error");
  assert.equal(retained.provider_failure_code, "INTEGRATION");
  assert.equal(retained.integration_failure_phase, "PROVIDER_POST_ADMITTED");
  assert.doesNotMatch(retainedBytes, /(?:safe local message|requestId|provider prose)/u);
  const historical = await inspectRc7GateCSettledHistoricalSmoke(lane.ledgerRoot, lane.resultsRoot);
  assert.equal(historical.historical_schema_version, "v6");
  assert.equal(historical.dispatch_authority, false);
  assert.equal(historical.replay_permitted, false);
  assert.equal(await recoverRc7GateCSmoke({ ledger_root: lane.ledgerRoot, results_root: lane.resultsRoot }).then((value) => value.classification), "settled-idempotent");

  const tampered = { ...retained, integration_failure_phase: "NO_NETWORK_POST_ADMITTED" };
  tampered.result_sha256 = sha256V1(canonicalJsonV1(projection(tampered, "result_sha256")));
  await writeFile(path.join(lane.resultsRoot, "smoke-result.json"), `${canonicalJsonV1(tampered)}\n`, "utf8");
  await expectCode(() => inspectRc7GateCSettledHistoricalSmoke(lane.ledgerRoot, lane.resultsRoot), "SMOKE_RESULT_MISMATCH");
});

test("smoke CLI exposes only four fixed run roots and rejects help misuse, unknown commands, and authority knobs before root access", async () => {
  const help = await runCli(["help"]);
  assert.equal(help.code, 0);
  assert.equal(help.stderr, "");
  const runUsage = help.stdout.split(/\r?\n/u).find((line) => line.includes("smoke.mjs run "));
  assert.ok(runUsage);
  assert.deepEqual([...runUsage.matchAll(/--[a-z-]+/gu)].map((match) => match[0]), ["--ledger-root", "--results-root", "--runtime-root", "--stage-root"]);

  const missingBase = path.join(tmpdir(), "rc7-smoke-cli-intentionally-missing");
  const requiredRun = [
    "run",
    "--ledger-root", path.join(missingBase, "smoke-ledger"),
    "--results-root", path.join(missingBase, "smoke-results"),
    "--runtime-root", path.join(missingBase, "runtime"),
    "--stage-root", path.join(missingBase, "stage"),
  ];
  const noCredentialHome = await runCli(requiredRun);
  assert.equal(noCredentialHome.code, 1);
  assert.equal(JSON.parse(noCredentialHome.stderr).code, "HOST_DSH_HOME_REQUIRED");
  const invalidInvocations = [
    ["unknown-command"],
    ["help", "extra"],
    [...requiredRun, "--provider", "openai-codex"],
    [...requiredRun, "--run-id", smokeTest.SMOKE_RUN_ID],
    [...requiredRun, "--callback", "forbidden"],
    [...requiredRun, "--ledger-root", path.join(missingBase, "other-smoke-ledger")],
  ];
  for (const args of invalidInvocations) {
    const result = await runCli(args);
    assert.equal(result.code, 1, args.join(" "));
    const error = JSON.parse(result.stderr);
    assert.equal(error.code, "USAGE", args.join(" "));
  }
});
