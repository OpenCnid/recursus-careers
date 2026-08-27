import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  RC5_CASE_ORDER,
  RC5_INTERNALS_FOR_TESTS,
  RC5_PROVIDER_AUTHORITY,
  RC5SliceError,
  assertDisposableRoot,
  runSliceCase,
  summarizeSlice,
} from '../../lib/recursus/rc5-slice.mjs';
import { canonicalJsonV1, sha256V1 } from '../../lib/recursus/prompt-context-v1.mjs';
import { RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS } from '../../lib/recursus/rc5-provider-executor.mjs';
import { validateOrderedWorkerRequest } from '../../lib/recursus/rc5-provider-worker.mjs';
import { runRC5SliceCli } from '../../scripts/recursus/rc5-slice.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function tempRoot(prefix = 'rc5-slice-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function cleanup(root) {
  rmSync(root, { force: true, maxRetries: 10, recursive: true, retryDelay: 50 });
}

function prepareProviderFree(outputRoot) {
  return RC5_INTERNALS_FOR_TESTS.prepareSliceForTests({ outputRoot });
}

function writeCanonicalTestJson(filePath, value) {
  writeFileSync(filePath, canonicalJsonV1(value));
}

function operatorObservation(scenarioId, overrides = {}) {
  return {
    baseline_usefulness: 1,
    correction_summary: 'No factual or safety correction required.',
    critical_failure: false,
    factual_or_safety_correction_count: 0,
    friction_acceptable_or_justified: true,
    latency_acceptable: true,
    operator_friction: 'No material operator friction observed.',
    relative_result: 'win',
    scenario_id: scenarioId,
    stop_slice: false,
    treatment_usefulness: 2,
    ...overrides,
  };
}

function allFileText(root) {
  const values = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) values.push(...allFileText(target));
    else if (entry.isFile() && !statSync(target).isSymbolicLink()) values.push(readFileSync(target, 'utf8'));
  }
  return values;
}

function captureStream() {
  let output = '';
  return {
    stream: { write(value) { output += String(value); return true; } },
    text() { return output; },
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error instanceof RC5SliceError && error.code === code);
}

test('test-only prepare is explicitly ineligible for provider execution', async () => {
  const root = tempRoot();
  try {
    const result = await prepareProviderFree(root);
    assert.equal(result.compatibility, 'provider_free_test_only');
    assert.equal(result.interface_status, 'injected_test_only');
    assert.equal(result.provider_call_permitted, false);
    assert.equal(result.recommendation, 'not_decided');
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    assert.deepEqual(plan.case_order, RC5_CASE_ORDER);
    assert.equal(plan.execution_eligibility, 'test_only');
    assert.equal(plan.probe_mode, 'injected_test_only');
    assert.equal(plan.accepted_inputs.integrity, 'pass');
    assert.equal(plan.policy.model_facing_tools.length, 0);
    assert.equal(plan.compatibility.provider_call_permitted, false);
    assert.equal(plan.compatibility.status, 'provider_free_test_only');
    assert.equal(plan.compatibility.interface.status, 'injected_test_only');
    assert.deepEqual(plan.compatibility.reasons, ['PROBE_INJECTION_TEST_ONLY']);
    assert.equal(plan.compatibility.transport.status, 'injected_test_only');
    assert.equal(plan.transport_probe.provider_calls, 0);
    assert.deepEqual(plan.transport_probe.diagnostic_probes, RC5_INTERNALS_FOR_TESTS.expectedAdapterDiagnosticProbes());
    assert.equal(plan.transport_probe.payload_captures.length, 3);
    assert.equal(plan.compatibility.executor.status, 'injected_test_only');
    assert.equal(plan.executor_probe.status, 'injected_test_only');
    assert.equal(plan.executor_probe.provider_calls, 0);
    assert.equal(plan.executor_probe.credential_mounted, 'synthetic_only');
    assert.equal(plan.executor_probe.network, 'docker_internal_simulator');
    assert.equal(plan.executor_probe.exact_container_run, true);
    assert.equal(plan.executor_probe.tls_validation_exercised, false);
    assert.equal(plan.executor_probe.production_fetch_tls_leg_exercised, false);
    assert.deepEqual(plan.executor_probe.authority_manifest, {
      id: 'rc5-container-run-authority-v1',
      sha256: 'e284b3117d56e4961f16c58f218d5bc004563b963060070dbc3818df29eb0063',
    });
    assert.deepEqual(plan.executor_probe.worker_source, {
      byte_count: 75_569,
      path: '/opt/rc5/rc5-provider-worker.mjs',
      sha256: '065fe2f438bbb9845a1cfec6060045b3d5e726a4a627470d198f22c9156d4296',
    });
    assert.deepEqual(plan.executor_probe.proxy_source, {
      byte_count: 9_399,
      path: '/opt/rc5/rc5-route-proxy.mjs',
      sha256: 'd954e9a2c4149dff01c5bb65b3bfece4bfbd3724db9b68ab21deb7f2da3d470d',
    });
    assert.deepEqual(plan.executor_probe.simulator_source, {
      byte_count: 28_540,
      path: '/opt/rc5/rc5-provider-free-payload-probe.cjs',
      sha256: '98337ae5d08ca2f68a4ac94e80a1492930e92c3a33b685b0c5d20d1eaccde6af',
    });
    assert.deepEqual(plan.executor_probe.image, {
      id: 'sha256:8fd2be8c533c812abda166305d0399b72515258ec8f0039569ba2ff1d5176179',
      reference: 'recursus-rc5-bounded-executor:2fc0209',
      worker_source: plan.executor_probe.worker_source,
    });
    assert.equal(plan.executor_probe.captures.length, 6);
    for (const [index, capture] of plan.executor_probe.captures.entries()) {
      const successful = index % 2 === 0;
      const caseIndex = Math.floor(index / 2);
      assert.equal(capture.scenario_id, RC5_CASE_ORDER[caseIndex]);
      assert.equal(capture.transport_mode, successful ? 'provider_free_success' : 'provider_free_failure');
      assert.equal(capture.simulator_response_status, successful ? 200 : 503);
      assert.equal(capture.completion, successful ? 'completed' : 'failed');
      assert.equal(capture.error_category, successful ? null : 'UNAVAILABLE');
      assert.equal(capture.delay_ms, 0);
      assert.equal(capture.failure_stage, successful ? null : 'adapter_terminal');
      assert.equal(capture.finish_reason, successful ? 'stop' : 'error');
      assert.equal(capture.heartbeat_count, 0);
      assert.equal(capture.direct_adapter_invocations, 1);
      assert.equal(capture.provider_request_count, 1);
      assert.equal(capture.response_http_status, successful ? 200 : 503);
      assert.equal(capture.response_http_status, capture.simulator_response_status);
      assert.equal(capture.oauth_refresh_count, 0);
      assert.equal(capture.output_token_target_exceeded, false);
      assert.equal(capture.provider_error_code, successful ? null : 'service_unavailable');
      assert.equal(capture.provider_error_detail_class, null);
      assert.equal(capture.provider_error_param, successful ? null : 'input');
      assert.equal(capture.payload_sha256, plan.transport_probe.payload_captures[caseIndex].payload_sha256);
    }
    assert.deepEqual(plan.executor_probe.delayed_capture, {
      completion: 'completed',
      delay_ms: 125_000,
      direct_adapter_invocations: 1,
      error_category: null,
      failure_stage: null,
      finish_reason: 'stop',
      heartbeat_count: 12,
      oauth_refresh_count: 0,
      output_token_target_exceeded: false,
      payload_sha256: plan.transport_probe.payload_captures[0].payload_sha256,
      provider_error_code: null,
      provider_error_detail_class: null,
      provider_error_param: null,
      provider_request_count: 1,
      response_http_status: 200,
      scenario_id: 'FACT-01',
      simulator_response_status: 200,
      transport_mode: 'provider_free_delayed_success',
    });
    for (const item of plan.cases) {
      assert.equal(item.treatment.compile_count, 1);
      assert.equal(item.treatment.target_id, 'recursus-direct-v1');
      assert.equal(item.treatment.model_facing_tools.length, 0);
      assert.equal(item.treatment.message_count, 5);
      assert.equal(item.treatment.source_part_count, 9);
      assert.ok(readFileSync(path.join(root, ...item.treatment.bundle_path.split('/'))).length > 0);
      const request = JSON.parse(readFileSync(path.join(root, ...item.treatment.request_path.split('/')), 'utf8'));
      assert.equal(request.dsh_generate_options.messages.length, 5);
      assert.equal(request.source_parts.length, 9);
      assert.equal(request.dsh_generate_options.maxTokens, 4000);
      assert.equal(typeof request.dsh_generate_options.system, 'string');
      assert.ok(request.dsh_generate_options.system.length > 0);
      assert.equal(request.execution.output_token_enforcement, 'best_effort_target_observed_v1');
      assert.deepEqual(request.dsh_generate_options.tools, []);
      assert.equal(request.baseline_task.attempt_id, item.baseline.attempt_id);
      assert.equal(request.baseline_task.prompt_sha256, item.baseline.task_contract.prompt_sha256);
      assert.equal(request.baseline_task.output_contract.evidence_bullet_count, 3);
      assert.equal(request.interface.id, 'RC5-DSH-CODEX-ANOMALY-DISCLOSURE-V1');
      assert.equal(request.interface.wire_contract, 'recursus-dsh-codex-anomaly-disclosure-v1');
      assert.match(request.dsh_generate_options.system, /distinct primary-source fact/u);
      assert.match(request.dsh_generate_options.system, /explicitly disclose the evidence shortage/u);
      assert.match(request.dsh_generate_options.system, /include exactly one concise anomaly notice/u);
      assert.match(request.dsh_generate_options.system, /Do not invent an anomaly notice when none is detected/u);
      assert.equal(request.dsh_generate_options.messages.at(-1).content[0].text, item.baseline.task_contract.prompt);
      assert.match(item.baseline.task_contract.prompt, /short tailored professional summary and three grounded evidence bullets/u);
    }
  } finally {
    cleanup(root);
  }
});

test('summarize records a provider-free not-decided state without inventing attempts', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    assert.deepEqual(await summarizeSlice({ outputRoot: root }), {
      case_slots_consumed: 0,
      pending_reservation_count: 0,
      provider_call_count: 0,
      recommendation: 'not_decided',
    });
    const summary = JSON.parse(readFileSync(path.join(root, 'summary-partial-0-0.json'), 'utf8'));
    assert.equal(summary.observation_rows.length, 0);
    assert.ok(summary.cases.every((item) => item.completion === 'not_run'));
    assert.equal(existsSync(path.join(root, 'summary.json')), false);
    assert.equal(existsSync(path.join(root, 'decision.md')), false);
  } finally {
    cleanup(root);
  }
});

test('operator observations enforce strict stop and friction decisions without provider execution', async () => {
  const roots = [];
  try {
    const observations = RC5_CASE_ORDER.map((scenarioId) => operatorObservation(scenarioId));

    const root = tempRoot();
    roots.push(root);
    const { root: physicalRoot } = await completePureCases(root);
    const observationsPath = path.join(root, 'operator-observations.json');
    writeCanonicalTestJson(observationsPath, { observations, schema_version: '1.0.0' });
    assert.deepEqual(await RC5_INTERNALS_FOR_TESTS.readOperatorObservations(physicalRoot), observations);
    assert.deepEqual(await summarizeSlice({ outputRoot: root }), {
      case_slots_consumed: 3,
      pending_reservation_count: 0,
      provider_call_count: 3,
      recommendation: 'KEEP',
    });
    const decision = readFileSync(path.join(root, 'decision.md'), 'utf8');
    assert.match(decision, /keeps source part 8 audit-only/u);
    assert.match(decision, /appends the exact accepted baseline invocation as a fifth user input/u);
    assert.match(decision, /best-effort 4,000-token target/u);
    assert.doesNotMatch(decision, /promotes the five system parts/u);
    assert.doesNotMatch(decision, /accepts completion only with reported output usage at or below 4,000 tokens/u);

    const frictionRoot = tempRoot('rc5-friction-');
    roots.push(frictionRoot);
    await completePureCases(frictionRoot);
    const unacceptableFriction = structuredClone(observations);
    unacceptableFriction[1].friction_acceptable_or_justified = false;
    unacceptableFriction[1].operator_friction = 'Observed friction was unacceptable and not justified.';
    writeCanonicalTestJson(path.join(frictionRoot, 'operator-observations.json'), {
      observations: unacceptableFriction,
      schema_version: '1.0.0',
    });
    assert.equal((await summarizeSlice({ outputRoot: frictionRoot })).recommendation, 'REBUILD');

    const stopRoot = tempRoot('rc5-stop-');
    roots.push(stopRoot);
    await completePureCases(stopRoot, 1);
    const stopObservation = [{ ...observations[0], stop_slice: true }];
    writeCanonicalTestJson(path.join(stopRoot, 'operator-observations.json'), {
      observations: stopObservation,
      schema_version: '1.0.0',
    });
    assert.equal((await summarizeSlice({ outputRoot: stopRoot })).recommendation, 'REBUILD');
    const stopLatchPath = path.join(stopRoot, 'slice-stop.json');
    const stopLatch = JSON.parse(readFileSync(stopLatchPath, 'utf8'));
    assert.equal(stopLatch.state, 'stopped');
    assert.equal(stopLatch.reason, 'operator_explicit_stop');
    assert.equal(stopLatch.recommendation, 'REBUILD');
    await expectCode(runSliceCase({
      caseId: 'FACT-03',
      outputRoot: stopRoot,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_SLICE_STOPPED');
    writeCanonicalTestJson(path.join(stopRoot, 'operator-observations.json'), {
      observations: [observations[0]],
      schema_version: '1.0.0',
    });
    await expectCode(runSliceCase({
      caseId: 'FACT-03',
      outputRoot: stopRoot,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_SLICE_STOPPED');
    rmSync(path.join(stopRoot, 'operator-observations.json'));
    await expectCode(runSliceCase({
      caseId: 'FACT-03',
      outputRoot: stopRoot,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_SLICE_STOPPED');
    assert.equal(existsSync(stopLatchPath), true);

    const criticalRoot = tempRoot('rc5-critical-');
    roots.push(criticalRoot);
    await completePureCases(criticalRoot, 1);
    const criticalObservation = [{ ...observations[0], critical_failure: true }];
    writeCanonicalTestJson(path.join(criticalRoot, 'operator-observations.json'), {
      observations: criticalObservation,
      schema_version: '1.0.0',
    });
    assert.equal((await summarizeSlice({ outputRoot: criticalRoot })).recommendation, 'DELETE');

    const zeroUsefulnessRoot = tempRoot('rc5-zero-usefulness-');
    roots.push(zeroUsefulnessRoot);
    await completePureCases(zeroUsefulnessRoot, 1);
    const zeroUsefulnessObservation = [operatorObservation('FACT-01', {
      stop_slice: true,
      treatment_usefulness: 0,
    })];
    writeCanonicalTestJson(path.join(zeroUsefulnessRoot, 'operator-observations.json'), {
      observations: zeroUsefulnessObservation,
      schema_version: '1.0.0',
    });
    assert.equal((await summarizeSlice({ outputRoot: zeroUsefulnessRoot })).recommendation, 'DELETE');
    const zeroUsefulnessLatch = JSON.parse(readFileSync(path.join(zeroUsefulnessRoot, 'slice-stop.json'), 'utf8'));
    assert.equal(zeroUsefulnessLatch.reason, 'operator_zero_usefulness');
    assert.equal(zeroUsefulnessLatch.recommendation, 'DELETE');
    await expectCode(runSliceCase({
      caseId: 'FACT-03',
      outputRoot: zeroUsefulnessRoot,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_SLICE_STOPPED');

    const malformed = structuredClone(observations);
    malformed[0].unknown_field = true;
    writeCanonicalTestJson(observationsPath, { observations: malformed, schema_version: '1.0.0' });
    await expectCode(RC5_INTERNALS_FOR_TESTS.readOperatorObservations(physicalRoot), 'RC5_OPERATOR_OBSERVATION');

    const credentialShaped = structuredClone(observations);
    credentialShaped[0].correction_summary = 'API_KEY=synthetic-secret-value-123456';
    writeCanonicalTestJson(observationsPath, { observations: credentialShaped, schema_version: '1.0.0' });
    await expectCode(RC5_INTERNALS_FOR_TESTS.readOperatorObservations(physicalRoot), 'RC5_OPERATOR_OBSERVATION');

    const zeroWithoutStop = structuredClone(observations);
    zeroWithoutStop[0].treatment_usefulness = 0;
    writeCanonicalTestJson(observationsPath, { observations: zeroWithoutStop, schema_version: '1.0.0' });
    await expectCode(RC5_INTERNALS_FOR_TESTS.readOperatorObservations(physicalRoot), 'RC5_OPERATOR_OBSERVATION');
  } finally {
    for (const root of roots) cleanup(root);
  }
});

test('each completed predecessor requires an operator observation before the next case', async () => {
  const roots = [];
  try {
    const fact03Root = tempRoot('rc5-fact03-observation-');
    roots.push(fact03Root);
    await completePureCases(fact03Root, 1);
    await expectCode(runSliceCase({
      caseId: 'FACT-03',
      outputRoot: fact03Root,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_OPERATOR_OBSERVATION_REQUIRED');
    assert.deepEqual(readdirSync(path.join(fact03Root, 'runtime')), []);

    const safe01Root = tempRoot('rc5-safe01-observation-');
    roots.push(safe01Root);
    await completePureCases(safe01Root, 2);
    writeCanonicalTestJson(path.join(safe01Root, 'operator-observations.json'), {
      observations: [operatorObservation('FACT-01')],
      schema_version: '1.0.0',
    });
    await expectCode(runSliceCase({
      caseId: 'SAFE-01',
      outputRoot: safe01Root,
      providerAuthority: RC5_PROVIDER_AUTHORITY,
    }), 'RC5_OPERATOR_OBSERVATION_REQUIRED');
    assert.deepEqual(readdirSync(path.join(safe01Root, 'runtime')), []);
  } finally {
    for (const root of roots) cleanup(root);
  }
});

test('public run path permanently fails closed on partial reservation, dispatch, or attempt remnants', async () => {
  const roots = [];
  const partialJson = '{"schema_version":"1.0.0"';
  try {
    const reservationRoot = tempRoot('rc5-partial-reservation-');
    roots.push(reservationRoot);
    await preparedExecution(reservationRoot);
    writeFileSync(path.join(reservationRoot, 'reservations', 'FACT-01.json'), partialJson);
    for (const caseId of ['FACT-01', 'FACT-03']) {
      await expectCode(runSliceCase({
        caseId,
        outputRoot: reservationRoot,
        providerAuthority: RC5_PROVIDER_AUTHORITY,
      }), 'RC5_RESERVATION_PENDING');
    }
    assert.deepEqual(readdirSync(path.join(reservationRoot, 'reservations')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(reservationRoot, 'runtime')), []);

    const dispatchRoot = tempRoot('rc5-partial-dispatch-');
    roots.push(dispatchRoot);
    const dispatchState = await preparedExecution(dispatchRoot);
    await RC5_INTERNALS_FOR_TESTS.reserveCase({
      caseId: 'FACT-01',
      clock: () => new Date('2026-08-26T12:00:00.000Z'),
      plan: dispatchState.plan,
      request: dispatchState.requests[0],
      root: dispatchState.root,
      runtimeId: 'RC5-EXEC-PARTIAL-DISPATCH',
    });
    writeFileSync(path.join(dispatchRoot, 'dispatches', 'FACT-01.json'), partialJson);
    for (const caseId of ['FACT-01', 'FACT-03']) {
      await expectCode(runSliceCase({
        caseId,
        outputRoot: dispatchRoot,
        providerAuthority: RC5_PROVIDER_AUTHORITY,
      }), 'RC5_RESERVATION_PENDING');
    }
    assert.deepEqual(readdirSync(path.join(dispatchRoot, 'reservations')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(dispatchRoot, 'dispatches')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(dispatchRoot, 'runtime')), []);

    const attemptRoot = tempRoot('rc5-partial-attempt-');
    roots.push(attemptRoot);
    const attemptState = await preparedExecution(attemptRoot);
    const reservation = await RC5_INTERNALS_FOR_TESTS.reserveCase({
      caseId: 'FACT-01',
      clock: () => new Date('2026-08-26T12:00:00.000Z'),
      plan: attemptState.plan,
      request: attemptState.requests[0],
      root: attemptState.root,
      runtimeId: 'RC5-EXEC-PARTIAL-ATTEMPT',
    });
    await RC5_INTERNALS_FOR_TESTS.dispatchCase({
      clock: () => new Date('2026-08-26T12:00:01.000Z'),
      reservation,
      root: attemptState.root,
    });
    writeFileSync(path.join(attemptRoot, 'attempts', 'FACT-01.json'), partialJson);
    for (const caseId of ['FACT-01', 'FACT-03']) {
      await expectCode(runSliceCase({
        caseId,
        outputRoot: attemptRoot,
        providerAuthority: RC5_PROVIDER_AUTHORITY,
      }), 'RC5_JSON_READ');
    }
    assert.deepEqual(readdirSync(path.join(attemptRoot, 'reservations')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(attemptRoot, 'dispatches')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(attemptRoot, 'attempts')), ['FACT-01.json']);
    assert.deepEqual(readdirSync(path.join(attemptRoot, 'runtime')), []);
  } finally {
    for (const root of roots) cleanup(root);
  }
});

test('output roots fail closed when missing, non-empty, repository-contained, or overly broad', async () => {
  const parent = tempRoot('rc5-root-denial-');
  try {
    const missing = path.join(parent, 'missing', 'rc5');
    await expectCode(assertDisposableRoot(missing), 'RC5_OUTPUT_ROOT_MISSING');
    const nonempty = path.join(parent, 'nonempty');
    mkdirSync(nonempty);
    writeFileSync(path.join(nonempty, 'owned.txt'), 'preserve');
    await expectCode(assertDisposableRoot(nonempty), 'RC5_OUTPUT_ROOT_NOT_EMPTY');
    await expectCode(assertDisposableRoot(ROOT), 'RC5_OUTPUT_ROOT_OVERLAP');
    await expectCode(assertDisposableRoot(tmpdir()), 'RC5_OUTPUT_ROOT_BROAD');
  } finally {
    cleanup(parent);
  }
});

test('plan validation rejects case or baseline drift and hidden output escape', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    RC5_INTERNALS_FOR_TESTS.validatePlanDocument(plan);
    const wrongCase = structuredClone(plan);
    wrongCase.cases[0].scenario_id = 'FACT-03';
    wrongCase.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(wrongCase);
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(wrongCase), { code: 'RC5_CASE_IDENTITY' });
    const wrongBaseline = structuredClone(plan);
    wrongBaseline.cases[0].baseline.attempt_id = 'wrong';
    wrongBaseline.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(wrongBaseline);
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(wrongBaseline), { code: 'RC5_CASE_IDENTITY' });
    const wrongBaselineTask = structuredClone(plan);
    wrongBaselineTask.cases[0].baseline.task_contract.prompt = wrongBaselineTask.cases[0].baseline.task_contract.prompt.replace('three grounded', 'two grounded');
    wrongBaselineTask.cases[0].baseline.task_contract.prompt_sha256 = sha256V1(
      wrongBaselineTask.cases[0].baseline.task_contract.prompt);
    wrongBaselineTask.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(wrongBaselineTask);
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(wrongBaselineTask), { code: 'RC5_BASELINE_TASK_PARITY' });
    const escape = structuredClone(plan);
    escape.cases[0].treatment.request_path = '../hidden-prompt.json';
    escape.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(escape);
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(escape), { code: 'RC5_OUTPUT_ESCAPE' });
  } finally {
    cleanup(root);
  }
});

test('Codex-native requests preserve all nine source parts and reject projection or policy drift', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    const item = plan.cases[0];
    const bundle = JSON.parse(readFileSync(path.join(root, ...item.treatment.bundle_path.split('/')), 'utf8'));
    const request = JSON.parse(readFileSync(path.join(root, ...item.treatment.request_path.split('/')), 'utf8'));
    const projected = RC5_INTERNALS_FOR_TESTS.projectOrderedPartsRequest(bundle, item.scenario_id, item.fixture_id, item.baseline);
    assert.deepEqual(projected, request);
    assert.equal(RC5_INTERNALS_FOR_TESTS.assertOrderedPartsRequest(request, bundle, item.scenario_id, item.fixture_id, item.baseline), true);
    assert.equal(RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateRequest(request), request);
    assert.equal(validateOrderedWorkerRequest(request), request);
    assert.deepEqual(request.source_parts.map((message) => message.role), [
      'system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system',
    ]);
    assert.deepEqual(request.dsh_generate_options.messages.map((message) => message.role), ['user', 'user', 'user', 'user', 'user']);
    assert.equal(request.dsh_generate_options.messages.at(-1).content[0].text, item.baseline.task_contract.prompt);
    assert.equal(request.projection.baseline_task_message_ordinal, 9);
    assert.deepEqual(request.projection.audit_only_system_part_ordinals, [8]);
    assert.equal(request.dsh_generate_options.system.includes(request.source_parts[8].content[0].text), false);
    assert.match(request.dsh_generate_options.system, /up to three independently grounded evidence bullets/u);
    assert.match(request.dsh_generate_options.system, /never split, repeat, or rephrase one fact/u);
    assert.match(request.dsh_generate_options.system, /return only the independently supported bullets and explicitly disclose the evidence shortage/u);
    assert.match(request.dsh_generate_options.system, /ignore it and include exactly one concise anomaly notice/u);
    assert.match(request.dsh_generate_options.system, /Do not invent an anomaly notice when none is detected/u);
    const workerParityMutation = structuredClone(request);
    workerParityMutation.baseline_task.output_contract.evidence_bullet_count = 2;
    assert.throws(() => validateOrderedWorkerRequest(workerParityMutation), { code: 'WORKER_BASELINE_TASK_PARITY' });
    assert.throws(() => RC5_PROVIDER_EXECUTOR_INTERNALS_FOR_TESTS.validateRequest(workerParityMutation), { code: 'RC5_EXECUTOR_REQUEST' });

    const mutations = [
      ['reordered parts', (value) => { [value.dsh_generate_options.messages[0], value.dsh_generate_options.messages[1]] = [value.dsh_generate_options.messages[1], value.dsh_generate_options.messages[0]]; }, 'RC5_REQUEST_PART_DRIFT'],
      ['omitted part', (value) => { value.dsh_generate_options.messages.pop(); }, 'RC5_REQUEST_POLICY'],
      ['source-part reorder', (value) => { [value.source_parts[0], value.source_parts[1]] = [value.source_parts[1], value.source_parts[0]]; }, 'RC5_REQUEST_PART_DRIFT'],
      ['role change', (value) => { value.dsh_generate_options.messages[0].role = 'assistant'; }, 'RC5_REQUEST_PART_DRIFT'],
      ['changed content', (value) => { value.dsh_generate_options.messages[0].content[0].text += ' '; }, 'RC5_REQUEST_PART_DRIFT'],
      ['system-field change', (value) => { value.dsh_generate_options.system = value.source_parts[8].content[0].text; }, 'RC5_REQUEST_PART_DRIFT'],
      ['projection change', (value) => { value.projection.system_part_ordinals = [0, 1, 2, 8]; }, 'RC5_REQUEST_PART_DRIFT'],
      ['audit-only output reinsertion', (value) => { value.dsh_generate_options.system += value.source_parts[8].content[0].text; }, 'RC5_REQUEST_PART_DRIFT'],
      ['independent grounding removed', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.system.replace('distinct primary-source fact', 'grounded fact'); }, 'RC5_REQUEST_PART_DRIFT'],
      ['shortage disclosure removed', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.system.replace('explicitly disclose the evidence shortage', 'remain concise'); }, 'RC5_REQUEST_PART_DRIFT'],
      ['instruction anomaly disclosure removed', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.system.replace('ignore it and include exactly one concise anomaly notice', 'ignore it'); }, 'RC5_REQUEST_PART_DRIFT'],
      ['unsupported-fact anomaly disclosure removed', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.system.replace('or unsupported-fact request', ''); }, 'RC5_REQUEST_PART_DRIFT'],
      ['false-warning guard removed', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.system.replace('Do not invent an anomaly notice when none is detected.', ''); }, 'RC5_REQUEST_PART_DRIFT'],
      ['baseline prompt change', (value) => { value.dsh_generate_options.messages.at(-1).content[0].text = value.dsh_generate_options.messages.at(-1).content[0].text.replace('three grounded', 'two grounded'); }, 'RC5_REQUEST_PART_DRIFT'],
      ['baseline prompt role', (value) => { value.dsh_generate_options.messages.at(-1).role = 'system'; }, 'RC5_REQUEST_PART_DRIFT'],
      ['baseline binding change', (value) => { value.baseline_task.output_contract.evidence_bullet_count = 2; }, 'RC5_BASELINE_TASK_PARITY'],
      ['baseline projection change', (value) => { value.projection.audit_only_system_part_ordinals = []; }, 'RC5_REQUEST_PART_DRIFT'],
      ['alternate prompt input', (value) => { value.dsh_generate_options.prompt = 'HIDDEN'; }, 'RC5_REQUEST_POLICY'],
      ['model-facing tools', (value) => { value.dsh_generate_options.tools.push({ name: 'Read' }); }, 'RC5_REQUEST_POLICY'],
      ['4,001 output tokens', (value) => { value.dsh_generate_options.maxTokens = 4001; }, 'RC5_REQUEST_POLICY'],
      ['second provider call', (value) => { value.execution.max_provider_calls = 2; }, 'RC5_REQUEST_POLICY'],
      ['automatic retry', (value) => { value.execution.automatic_retries = 1; }, 'RC5_REQUEST_POLICY'],
      ['output-token enforcement', (value) => { value.execution.output_token_enforcement = 'wire_field'; }, 'RC5_REQUEST_POLICY'],
    ];
    for (const [label, mutate, expectedCode] of mutations) {
      const changed = structuredClone(request);
      mutate(changed);
      changed.request_digest.value = RC5_INTERNALS_FOR_TESTS.requestDigest(changed);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.assertOrderedPartsRequest(changed, bundle, item.scenario_id, item.fixture_id, item.baseline),
        (error) => error?.code === expectedCode,
        label,
      );
    }
  } finally {
    cleanup(root);
  }
});

test('provider-free final-wire validation rejects payload, fetch, identity, and no-retry drift', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    const requests = plan.cases.map((item) => JSON.parse(readFileSync(path.join(root, ...item.treatment.request_path.split('/')), 'utf8')));
    const expectedCaptures = RC5_INTERNALS_FOR_TESTS.expectedProviderFreePayloadCaptures(requests);
    const endpoint = expectedCaptures[0].endpoint;
    const makeObservation = () => {
      const payloads = requests.map((request) => RC5_INTERNALS_FOR_TESTS.expectedWirePayload(request));
      return {
        capabilities: { ordered_system_user_messages_v1: true, pi_native_openai_codex_payload_v1: true },
        diagnostic_probes: RC5_INTERNALS_FOR_TESTS.expectedAdapterDiagnosticProbes(),
        http_request_count: requests.length,
        payloads,
        provider_calls: 0,
        retry_probe: {
          completed: false,
          http_request_count: 1,
          payload: structuredClone(payloads[0]),
          provider_calls: 0,
          url: endpoint,
        },
        urls: requests.map(() => endpoint),
      };
    };
    const observation = makeObservation();
    assert.deepEqual(RC5_INTERNALS_FOR_TESTS.validateProviderFreePayloadProbe(observation, requests), expectedCaptures);
    const probe = RC5_INTERNALS_FOR_TESTS.expectedPinnedTransportProbe(expectedCaptures);
    const assessment = RC5_INTERNALS_FOR_TESTS.assessOrderedPartsTransport(probe, requests);
    assert.equal(assessment.status, 'compatible');
    assert.equal(assessment.provider_call_permitted, true);
    const boundedProbe = RC5_INTERNALS_FOR_TESTS.expectedBoundedExecutorProbe(requests);
    assert.equal(RC5_INTERNALS_FOR_TESTS.validateBoundedExecutorProbe(boundedProbe, plan.cases, probe), true);
    for (const [label, mutate] of [
      ['diagnostic status', (value) => { value.captures[1].response_http_status = 500; }],
      ['diagnostic category', (value) => { value.captures[1].error_category = 'INTEGRATION'; }],
      ['diagnostic stage', (value) => { value.captures[1].failure_stage = 'adapter_throw'; }],
      ['diagnostic code', (value) => { value.captures[1].provider_error_code = 'bad code'; }],
      ['diagnostic detail', (value) => { value.captures[1].provider_error_detail_class = 'RAW_DETAIL'; }],
      ['diagnostic param', (value) => { value.captures[1].provider_error_param = 'bad param'; }],
      ['diagnostic omission', (value) => { delete value.captures[1].response_http_status; }],
      ['diagnostic hidden body', (value) => { value.captures[1].response_body = 'RC5_PRIVATE_SENTINEL'; }],
    ]) {
      const changed = structuredClone(boundedProbe);
      mutate(changed);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.validateBoundedExecutorProbe(changed, plan.cases, probe),
        { code: 'RC5_EXECUTOR_PROBE' },
        label,
      );
    }

    const wireMutations = [
      ['endpoint', (value) => { value.urls[0] = 'https://example.test/responses'; }],
      ['instructions', (value) => { value.payloads[0].instructions = 'hidden'; }],
      ['missing instructions', (value) => { delete value.payloads[0].instructions; }],
      ['tools', (value) => { value.payloads[0].tools = []; }],
      ['message order', (value) => { [value.payloads[0].input[0], value.payloads[0].input[1]] = [value.payloads[0].input[1], value.payloads[0].input[0]]; }],
      ['message content', (value) => { value.payloads[0].input[0].content[0].text += ' '; }],
      ['message role', (value) => { value.payloads[0].input[0].role = 'assistant'; }],
      ['baseline task omission', (value) => { value.payloads[0].input.pop(); }],
      ['baseline task downgrade', (value) => { value.payloads[0].input.at(-1).content[0].text = value.payloads[0].input.at(-1).content[0].text.replace('three grounded', 'two grounded'); }],
      ['independent grounding removed', (value) => { value.payloads[0].instructions = value.payloads[0].instructions.replace('distinct primary-source fact', 'grounded fact'); }],
      ['shortage disclosure removed', (value) => { value.payloads[0].instructions = value.payloads[0].instructions.replace('explicitly disclose the evidence shortage', 'remain concise'); }],
      ['instruction anomaly disclosure removed', (value) => { value.payloads[0].instructions = value.payloads[0].instructions.replace('ignore it and include exactly one concise anomaly notice', 'ignore it'); }],
      ['unsupported-fact anomaly disclosure removed', (value) => { value.payloads[0].instructions = value.payloads[0].instructions.replace('or unsupported-fact request', ''); }],
      ['false-warning guard removed', (value) => { value.payloads[0].instructions = value.payloads[0].instructions.replace('Do not invent an anomaly notice when none is detected.', ''); }],
      ['audit-only output frame promoted', (value) => { value.payloads[0].instructions += requests[0].source_parts[8].content[0].text; }],
      ['system aggregation', (value) => { value.payloads[0].instructions = value.payloads[0].input.pop().content[0].text; }],
      ['prohibited wire token cap', (value) => { value.payloads[0].max_output_tokens = 4000; }],
      ['tool choice', (value) => { value.payloads[0].tool_choice = 'none'; }],
      ['parallel tools', (value) => { value.payloads[0].parallel_tool_calls = false; }],
      ['capability', (value) => { value.capabilities.pi_native_openai_codex_payload_v1 = false; }],
      ['payload count', (value) => { value.payloads.pop(); }],
      ['fetch count', (value) => { value.http_request_count += 1; }],
      ['provider call count', (value) => { value.provider_calls = 1; }],
      ['diagnostic status', (value) => { value.diagnostic_probes[2].response_http_status = 422; }],
      ['diagnostic category', (value) => { value.diagnostic_probes[2].error_category = 'INTEGRATION'; }],
      ['diagnostic stage', (value) => { value.diagnostic_probes[1].failure_stage = 'adapter_throw'; }],
      ['diagnostic request count', (value) => { value.diagnostic_probes[3].http_request_count = 2; }],
      ['diagnostic provider count', (value) => { value.diagnostic_probes[4].provider_calls = 1; }],
      ['diagnostic hidden error', (value) => { value.diagnostic_probes[5].error_message = 'RC5_PRIVATE_SENTINEL'; }],
      ['diagnostic omission', (value) => { value.diagnostic_probes.pop(); }],
      ['retry completion', (value) => { value.retry_probe.completed = true; }],
      ['retry fetch count', (value) => { value.retry_probe.http_request_count = 2; }],
      ['retry provider calls', (value) => { value.retry_probe.provider_calls = 1; }],
      ['retry endpoint', (value) => { value.retry_probe.url = 'https://example.test/responses'; }],
      ['retry payload', (value) => { value.retry_probe.payload.input[0].role = 'assistant'; }],
    ];
    for (const [label, mutate] of wireMutations) {
      const changed = makeObservation();
      mutate(changed);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.validateProviderFreePayloadProbe(changed, requests),
        (error) => error?.code === 'RC5_RUNTIME_PROBE',
        label,
      );
    }

    const probeMutations = [
      ['capability drift', (value) => { value.capabilities.pi_native_openai_codex_payload_v1 = false; }],
      ['adapter source drift', (value) => { value.adapter.source.sha256 = 'b'.repeat(64); }],
      ['image identity drift', (value) => { value.image.id = 'sha256:' + 'b'.repeat(64); }],
      ['payload capture count', (value) => { value.payload_captures.pop(); }],
      ['payload fetch count', (value) => { value.payload_captures[0].provider_free_http_requests = 2; }],
      ['retry no-retry count', (value) => { value.retry_probe.provider_free_http_requests = 2; }],
      ['retry provider count', (value) => { value.retry_probe.provider_calls = 1; }],
      ['retry completion drift', (value) => { value.retry_probe.completed = true; }],
    ];
    for (const [label, mutate] of probeMutations) {
      const changed = structuredClone(probe);
      mutate(changed);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.assessOrderedPartsTransport(changed, requests),
        (error) => error?.code === 'RC5_RUNTIME_PROBE',
        label,
      );
    }
  } finally {
    cleanup(root);
  }
});

test('accepted input mutation and execution-policy denials are explicit', () => {
  const before = [{ byte_count: 1, path: 'accepted', sha256: 'a'.repeat(64) }];
  const after = [{ byte_count: 1, path: 'accepted', sha256: 'b'.repeat(64) }];
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertAcceptedSnapshotsEqual(before, after), { code: 'RC5_ACCEPTED_INPUT_MUTATION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: false, max_concurrency: 1, max_output_tokens: 4000, model_facing_tools: ['Read'], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_MODEL_TOOLS' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: true, max_concurrency: 1, max_output_tokens: 4000, model_facing_tools: [], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_EXECUTION_POLICY' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: false, max_concurrency: 2, max_output_tokens: 4000, model_facing_tools: [], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_EXECUTION_POLICY' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: false, max_concurrency: 1, model_facing_tools: [], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_EXECUTION_POLICY' });
});

test('missing accepted input, hidden prompt bypass, and task promotion are rejected', async () => {
  const emptyRepo = tempRoot('rc5-missing-input-');
  try {
    await expectCode(RC5_INTERNALS_FOR_TESTS.snapshotAcceptedInputs(emptyRepo), 'RC5_ACCEPTED_INPUT_MISSING');
  } finally {
    cleanup(emptyRepo);
  }
  const system = { authority: 'policy', layer: 'system.invariant', trust: 'system_owned' };
  const task = { authority: 'data', layer: 'data.task', trust: 'external_untrusted' };
  const bundle = {
    parts: [
      { semantic_envelope: system, target_field: 'harness.system', target_role: 'system' },
      { semantic_envelope: task, target_field: 'harness.user', target_role: 'user' },
    ],
    route_bundle_digest: { sha256: 'a'.repeat(64) },
    canonical_compilation: { sha256: 'b'.repeat(64) },
    target_route: { boundary: 'offline-route-delivery', id: 'recursus-direct-v1' },
    task_occurrence_count: 1,
    tool_capability_profile: { side_effect_policy: 'no-execution-static-contract-only' },
  };
  RC5_INTERNALS_FOR_TESTS.inspectTreatmentBundle(bundle, { blocks: [system, task] }, 'FACT-01');
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.inspectTreatmentBundle(bundle, { blocks: [task] }, 'FACT-01'), { code: 'RC5_HIDDEN_PROMPT_BYPASS' });
  const promoted = structuredClone(bundle);
  promoted.parts[1].semantic_envelope.authority = 'instruction';
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.inspectTreatmentBundle(promoted, { blocks: promoted.parts.map((part) => part.semantic_envelope) }, 'FACT-01'), { code: 'RC5_TASK_PROMOTION' });
});

function boundedExecutorResult(overrides = {}) {
  return {
    artifact: '# result',
    completion: 'completed',
    direct_adapter_invocations: 1,
    error_category: null,
    executor_error_code: null,
    external_mutations: [],
    failure_stage: null,
    finish_reason: 'stop',
    input_tokens: 200,
    oauth_refresh_count: 0,
    output_token_target_exceeded: false,
    output_tokens: 100,
    provider_error_code: null,
    provider_error_detail_class: null,
    provider_error_param: null,
    provider_request_count: 1,
    response_http_status: 200,
    responses_endpoint: 'https://chatgpt.com/backend-api/codex/responses',
    schema_version: '1.3.0',
    trusted_completed: true,
    wall_ms: 100,
    ...overrides,
  };
}

async function preparedExecution(root) {
  await prepareProviderFree(root);
  const state = await RC5_INTERNALS_FOR_TESTS.readPlan(root);
  await RC5_INTERNALS_FOR_TESTS.ensureExecutionDirectories(state.root);
  return state;
}

async function completePureCases(root, count = RC5_CASE_ORDER.length) {
  const state = await preparedExecution(root);
  const clock = () => new Date('2026-08-26T12:00:00.000Z');
  for (const [index, caseId] of RC5_CASE_ORDER.slice(0, count).entries()) {
    const reservation = await RC5_INTERNALS_FOR_TESTS.reserveCase({
      caseId,
      clock,
      plan: state.plan,
      request: state.requests[index],
      root: state.root,
      runtimeId: `RC5-EXEC-OBSERVATION-${caseId}`,
    });
    const dispatch = await RC5_INTERNALS_FOR_TESTS.dispatchCase({ clock, reservation, root: state.root });
    await RC5_INTERNALS_FOR_TESTS.persistExecutionResult(
      state.root,
      reservation,
      dispatch,
      boundedExecutorResult(),
    );
  }
  return state;
}

test('reservation and dispatch are durable before terminal persistence and enforce case order', async () => {
  const root = tempRoot();
  try {
    const { plan, requests, root: physicalRoot } = await preparedExecution(root);
    const clock = () => new Date('2026-08-26T12:00:00.000Z');
    const reservation = await RC5_INTERNALS_FOR_TESTS.reserveCase({
      caseId: 'FACT-01', clock, plan, request: requests[0], root: physicalRoot, runtimeId: 'RC5-EXEC-TEST-FACT-01',
    });
    const reservationPath = path.join(root, 'reservations', 'FACT-01.json');
    assert.deepEqual(JSON.parse(readFileSync(reservationPath, 'utf8')), reservation);
    assert.equal(RC5_INTERNALS_FOR_TESTS.validateReservation(reservation), true);
    assert.equal(existsSync(path.join(root, 'dispatches', 'FACT-01.json')), false);
    assert.equal(existsSync(path.join(root, 'attempts', 'FACT-01.json')), false);
    assert.throws(
      () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [], [], 'FACT-01'),
      { code: 'RC5_RESERVATION_PENDING' },
    );

    const dispatch = await RC5_INTERNALS_FOR_TESTS.dispatchCase({ clock, reservation, root: physicalRoot });
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'dispatches', 'FACT-01.json'), 'utf8')), dispatch);
    assert.equal(RC5_INTERNALS_FOR_TESTS.validateDispatch(dispatch), true);
    assert.throws(
      () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [], 'FACT-01'),
      { code: 'RC5_RESERVATION_PENDING' },
    );

    const attempt = await RC5_INTERNALS_FOR_TESTS.persistExecutionResult(
      physicalRoot, reservation, dispatch, boundedExecutorResult(),
    );
    assert.equal(RC5_INTERNALS_FOR_TESTS.validateAttemptResult(attempt), true);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'attempts', 'FACT-01.json'), 'utf8')), attempt);
    assert.equal(readFileSync(path.join(root, 'artifacts', 'FACT-01.md'), 'utf8'), '# result');
    assert.throws(
      () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [attempt], 'FACT-01'),
      { code: 'RC5_RETRY_FORBIDDEN' },
    );
    assert.equal(RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [attempt], 'FACT-03'), true);
  } finally {
    cleanup(root);
  }
});

test('exclusive reservation denies concurrent consumption of one case', async () => {
  const root = tempRoot();
  try {
    const { plan, requests, root: physicalRoot } = await preparedExecution(root);
    const clock = () => new Date('2026-08-26T12:00:00.000Z');
    const results = await Promise.allSettled([
      RC5_INTERNALS_FOR_TESTS.reserveCase({ caseId: 'FACT-01', clock, plan, request: requests[0], root: physicalRoot, runtimeId: 'RC5-EXEC-CONCURRENT-A' }),
      RC5_INTERNALS_FOR_TESTS.reserveCase({ caseId: 'FACT-01', clock, plan, request: requests[0], root: physicalRoot, runtimeId: 'RC5-EXEC-CONCURRENT-B' }),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
    const rejected = results.find((item) => item.status === 'rejected');
    assert.equal(rejected?.reason?.code, 'RC5_RETRY_FORBIDDEN');
    const reservation = results.find((item) => item.status === 'fulfilled').value;
    assert.equal(readdirSync(path.join(root, 'reservations')).length, 1);
    assert.throws(
      () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [], [], 'FACT-01'),
      { code: 'RC5_RESERVATION_PENDING' },
    );
  } finally {
    cleanup(root);
  }
});

test('failed and timed-out terminal attempts permanently stop later calls', async () => {
  for (const [completion, finishReason] of [['failed', 'error'], ['timed_out', 'aborted']]) {
    const root = tempRoot(`rc5-${completion}-`);
    try {
      const { plan, requests, root: physicalRoot } = await preparedExecution(root);
      const clock = () => new Date('2026-08-26T12:00:00.000Z');
      const reservation = await RC5_INTERNALS_FOR_TESTS.reserveCase({
        caseId: 'FACT-01', clock, plan, request: requests[0], root: physicalRoot, runtimeId: `RC5-EXEC-${completion}`,
      });
      const dispatch = await RC5_INTERNALS_FOR_TESTS.dispatchCase({ clock, reservation, root: physicalRoot });
      const attempt = await RC5_INTERNALS_FOR_TESTS.persistExecutionResult(physicalRoot, reservation, dispatch, boundedExecutorResult({
        artifact: null,
        completion,
        error_category: completion === 'timed_out' ? 'TIMEOUT' : 'UNAVAILABLE',
        executor_error_code: completion === 'timed_out' ? 'RC5_WORKER_TIMEOUT' : null,
        failure_stage: completion === 'timed_out' ? 'worker_timeout' : 'adapter_terminal',
        finish_reason: finishReason,
        response_http_status: completion === 'timed_out' ? null : 503,
        trusted_completed: false,
      }));
      assert.equal(attempt.completion, completion);
      assert.equal(attempt.artifact, null);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [attempt], 'FACT-01'),
        { code: 'RC5_SLICE_STOPPED' },
      );
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [attempt], 'FACT-03'),
        { code: 'RC5_SLICE_STOPPED' },
      );
    } finally {
      cleanup(root);
    }
  }
});

test('credential-shaped executor output is rejected before artifact or attempt persistence', async () => {
  const root = tempRoot();
  const secret = 'OPENAI_CODEX_OAUTH=synthetic-secret-value-123456';
  try {
    const { plan, requests, root: physicalRoot } = await preparedExecution(root);
    const clock = () => new Date('2026-08-26T12:00:00.000Z');
    const reservation = await RC5_INTERNALS_FOR_TESTS.reserveCase({
      caseId: 'FACT-01', clock, plan, request: requests[0], root: physicalRoot, runtimeId: 'RC5-EXEC-CREDENTIAL-DENIAL',
    });
    const dispatch = await RC5_INTERNALS_FOR_TESTS.dispatchCase({ clock, reservation, root: physicalRoot });
    await expectCode(
      RC5_INTERNALS_FOR_TESTS.persistExecutionResult(physicalRoot, reservation, dispatch, boundedExecutorResult({ artifact: secret })),
      'RC5_CREDENTIAL_LEAK',
    );
    assert.equal(existsSync(path.join(root, 'artifacts', 'FACT-01.md')), false);
    assert.equal(existsSync(path.join(root, 'attempts', 'FACT-01.json')), false);
    assert.equal(allFileText(root).some((text) => text.includes(secret)), false);
    assert.throws(
      () => RC5_INTERNALS_FOR_TESTS.assertCallLedger([reservation], [dispatch], [], 'FACT-01'),
      { code: 'RC5_RESERVATION_PENDING' },
    );
  } finally {
    cleanup(root);
  }
});

test('attempt schema rejects false completion, invalid identity, excessive results, and external mutation', () => {
  const valid = {
    artifact: {
      byte_count: 8,
      media_type: 'text/markdown',
      path: 'artifacts/FACT-01.md',
      sha256: 'a'.repeat(64),
    },
    attempt_id: 'RC5-ATTEMPT-FACT-01-R01',
    completion: 'completed',
    direct_adapter_invocations: 1,
    dispatch_id: 'RC5-DISPATCH-FACT-01-R01',
    error_category: null,
    executor_error_code: null,
    external_mutations: [],
    failure_stage: null,
    finish_reason: 'stop',
    input_tokens: 200,
    oauth_refresh_count: 0,
    output_token_target_exceeded: false,
    output_tokens: 100,
    provider_error_code: null,
    provider_error_detail_class: null,
    provider_error_param: null,
    provider_request_count: 1,
    request_digest: 'a'.repeat(64),
    reservation_id: 'RC5-RESERVATION-FACT-01-R01',
    response_http_status: 200,
    responses_endpoint: 'https://chatgpt.com/backend-api/codex/responses',
    scenario_id: 'FACT-01',
    schema_version: '1.3.0',
    trusted_completed: true,
    usefulness: 'not_evaluated',
    wall_ms: 100,
  };
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult(valid);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, completion: 'timed_out' }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, trusted_completed: false }), { code: 'RC5_FALSE_COMPLETION' });
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, output_token_target_exceeded: true, output_tokens: 4001 });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, output_token_target_exceeded: true, output_tokens: 1_000_001 }), { code: 'RC5_RESULT_BUDGET' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, output_token_target_exceeded: 'not_reported', output_tokens: 'not_reported' }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, dispatch_id: 'wrong' }), { code: 'RC5_RESULT_INVALID' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, artifact: { ...valid.artifact, byte_count: 65_537 } }), { code: 'RC5_RESULT_BUDGET' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, external_mutations: ['tracker_write'] }), { code: 'RC5_EXTERNAL_MUTATION' });
  for (const key of ['response_http_status', 'error_category', 'executor_error_code', 'failure_stage', 'output_token_target_exceeded', 'provider_error_code', 'provider_error_detail_class', 'provider_error_param']) {
    const omitted = { ...valid };
    delete omitted[key];
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult(omitted), { code: 'RC5_RESULT_INVALID' }, `omitted ${key}`);
  }
  for (const status of [99, 600, 200.5, '200']) {
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, response_http_status: status }), { code: 'RC5_RESULT_INVALID' });
  }
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, error_category: 'RAW_ERROR' }), { code: 'RC5_RESULT_INVALID' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, failure_stage: 'response_body' }), { code: 'RC5_RESULT_INVALID' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, provider_error_code: 'bad code' }), { code: 'RC5_RESULT_INVALID' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, provider_error_detail_class: 'RAW_DETAIL' }), { code: 'RC5_RESULT_INVALID' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, provider_error_param: 'bad param' }), { code: 'RC5_RESULT_INVALID' });
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult({
    ...valid,
    artifact: null,
    completion: 'timed_out',
    error_category: 'TIMEOUT',
    executor_error_code: 'RC5_WORKER_TIMEOUT',
    failure_stage: 'worker_timeout',
    finish_reason: 'aborted',
    response_http_status: null,
    trusted_completed: false,
  });
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult({
    ...valid,
    artifact: null,
    completion: 'failed',
    error_category: 'BUDGET_EXCEEDED',
    failure_stage: 'worker_validation',
    finish_reason: 'error',
    output_tokens: 4_001,
    output_token_target_exceeded: true,
    trusted_completed: false,
  });
});

test('executor reconciliation fallback preserves only an allowlisted stage code', () => {
  assert.equal(RC5_INTERNALS_FOR_TESTS.safeExecutorErrorCode({ code: 'RC5_AUTHORITY_TRACE' }), 'RC5_AUTHORITY_TRACE');
  assert.equal(RC5_INTERNALS_FOR_TESTS.safeExecutorErrorCode({ code: 'RC5_AUTHORITY_TRACE_CLOSE_COUNT' }), 'RC5_AUTHORITY_TRACE_CLOSE_COUNT');
  assert.equal(RC5_INTERNALS_FOR_TESTS.safeExecutorErrorCode({ code: 'RC5_AUTHORITY_TRACE_DENIED_CONCURRENCY' }), 'RC5_AUTHORITY_TRACE_DENIED_CONCURRENCY');
  assert.equal(RC5_INTERNALS_FOR_TESTS.safeExecutorErrorCode({ code: 'RC5_PRIVATE_PATH_D:\\secret' }), 'RC5_EXECUTOR_UNCLASSIFIED');
  const traced = RC5_INTERNALS_FOR_TESTS.failedExecutorResult(120_123, 'RC5_AUTHORITY_TRACE');
  assert.equal(traced.completion, 'failed');
  assert.equal(traced.error_category, 'INTEGRATION');
  assert.equal(traced.executor_error_code, 'RC5_AUTHORITY_TRACE');
  assert.equal(traced.failure_stage, 'executor_reconciliation');
  assert.equal(traced.direct_adapter_invocations, 'not_reported');
  assert.equal(traced.provider_request_count, 'not_reported');
  assert.equal(canonicalJsonV1(traced).includes('D:\\secret'), false);
});

test('CLI run validates arguments and authority before reaching runtime', async () => {
  const root = tempRoot();
  try {
    const argumentStdout = captureStream();
    const argumentStderr = captureStream();
    assert.equal(await runRC5SliceCli({
      argv: ['run', '--case', 'FACT-01', '--output-root', root],
      stdout: argumentStdout.stream,
      stderr: argumentStderr.stream,
    }), 2);
    assert.match(argumentStderr.text(), /RC5_ARGUMENT/u);

    const authorityStdout = captureStream();
    const authorityStderr = captureStream();
    assert.equal(await runRC5SliceCli({
      argv: [
        'run',
        '--case', 'FACT-01',
        '--output-root', root,
        '--docker-executable', path.join(root, 'not-used-docker.exe'),
        '--credential-home', path.join(root, 'not-used-credentials'),
      ],
      stdout: authorityStdout.stream,
      stderr: authorityStderr.stream,
    }), 2);
    assert.match(authorityStderr.text(), /RC5_PROVIDER_AUTHORITY/u);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    cleanup(root);
  }
});
