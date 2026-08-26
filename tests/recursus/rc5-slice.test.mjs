import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  RC5_CASE_ORDER,
  RC5_INTERNALS_FOR_TESTS,
  RC5_PROVIDER_AUTHORITY,
  RC5SliceError,
  assertDisposableRoot,
  prepareSlice,
  runSliceCase,
  summarizeSlice,
} from '../../lib/recursus/rc5-slice.mjs';
import { runRC5SliceCli } from '../../scripts/recursus/rc5-slice.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function tempRoot(prefix = 'rc5-slice-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function cleanup(root) {
  rmSync(root, { force: true, maxRetries: 10, recursive: true, retryDelay: 50 });
}

async function providerFreeTransportProbe({ requests }) {
  const captures = RC5_INTERNALS_FOR_TESTS.expectedProviderFreePayloadCaptures(requests);
  return structuredClone(RC5_INTERNALS_FOR_TESTS.expectedPinnedTransportProbe(captures));
}

function prepareProviderFree(outputRoot) {
  return prepareSlice({ outputRoot, transportProbe: providerFreeTransportProbe });
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

test('prepare validates the compatible pinned adapter without starting a provider call', async () => {
  const root = tempRoot();
  try {
    const result = await prepareProviderFree(root);
    assert.equal(result.compatibility, 'compatible');
    assert.equal(result.interface_status, 'validated_provider_free');
    assert.equal(result.provider_call_permitted, true);
    assert.equal(result.recommendation, 'not_decided');
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    assert.deepEqual(plan.case_order, RC5_CASE_ORDER);
    assert.equal(plan.accepted_inputs.integrity, 'pass');
    assert.equal(plan.policy.model_facing_tools.length, 0);
    assert.equal(plan.compatibility.provider_call_permitted, true);
    assert.equal(plan.compatibility.status, 'compatible');
    assert.equal(plan.compatibility.interface.status, 'validated_provider_free');
    assert.deepEqual(plan.compatibility.reasons, []);
    assert.equal(plan.compatibility.transport.status, 'compatible');
    assert.equal(plan.transport_probe.provider_calls, 0);
    assert.equal(plan.transport_probe.payload_captures.length, 3);
    for (const item of plan.cases) {
      assert.equal(item.treatment.compile_count, 1);
      assert.equal(item.treatment.target_id, 'recursus-direct-v1');
      assert.equal(item.treatment.model_facing_tools.length, 0);
      assert.equal(item.treatment.message_count, 9);
      assert.ok(readFileSync(path.join(root, ...item.treatment.bundle_path.split('/'))).length > 0);
      const request = JSON.parse(readFileSync(path.join(root, ...item.treatment.request_path.split('/')), 'utf8'));
      assert.equal(request.dsh_generate_options.messages.length, 9);
      assert.equal(request.dsh_generate_options.maxTokens, 4000);
      assert.equal(Object.hasOwn(request.dsh_generate_options, 'system'), false);
      assert.deepEqual(request.dsh_generate_options.tools, []);
    }
  } finally {
    cleanup(root);
  }
});

test('authorized run stops before provider execution because no executor is registered', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    await expectCode(runSliceCase({ caseId: 'FACT-01', outputRoot: root, providerAuthority: RC5_PROVIDER_AUTHORITY }), 'RC5_EXECUTOR_UNIMPLEMENTED');
    assert.equal(readFileSync(path.join(root, 'slice-plan.json')).length > 0, true);
  } finally {
    cleanup(root);
  }
});

test('summarize refuses a decision when compatible preparation has no treatment attempts', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    await expectCode(summarizeSlice({ outputRoot: root }), 'RC5_DECISION_INCOMPLETE');
  } finally {
    cleanup(root);
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
    const escape = structuredClone(plan);
    escape.cases[0].treatment.request_path = '../hidden-prompt.json';
    escape.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(escape);
    assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(escape), { code: 'RC5_OUTPUT_ESCAPE' });
  } finally {
    cleanup(root);
  }
});

test('ordered-parts requests preserve all nine bundle parts and reject semantic or policy drift', async () => {
  const root = tempRoot();
  try {
    await prepareProviderFree(root);
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    const item = plan.cases[0];
    const bundle = JSON.parse(readFileSync(path.join(root, ...item.treatment.bundle_path.split('/')), 'utf8'));
    const request = JSON.parse(readFileSync(path.join(root, ...item.treatment.request_path.split('/')), 'utf8'));
    const projected = RC5_INTERNALS_FOR_TESTS.projectOrderedPartsRequest(bundle, item.scenario_id, item.fixture_id);
    assert.deepEqual(projected, request);
    assert.equal(RC5_INTERNALS_FOR_TESTS.assertOrderedPartsRequest(request, bundle, item.scenario_id, item.fixture_id), true);
    assert.deepEqual(request.dsh_generate_options.messages.map((message) => message.role), [
      'system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system',
    ]);

    const mutations = [
      ['reordered parts', (value) => { [value.dsh_generate_options.messages[0], value.dsh_generate_options.messages[1]] = [value.dsh_generate_options.messages[1], value.dsh_generate_options.messages[0]]; }, 'RC5_REQUEST_PART_DRIFT'],
      ['omitted part', (value) => { value.dsh_generate_options.messages.pop(); }, 'RC5_REQUEST_POLICY'],
      ['role downgrade', (value) => { value.dsh_generate_options.messages[0].role = 'user'; }, 'RC5_REQUEST_PART_DRIFT'],
      ['changed content', (value) => { value.dsh_generate_options.messages[4].content[0].text += ' '; }, 'RC5_REQUEST_PART_DRIFT'],
      ['system-field aggregation', (value) => { value.dsh_generate_options.system = value.dsh_generate_options.messages[8].content[0].text; }, 'RC5_REQUEST_POLICY'],
      ['alternate prompt input', (value) => { value.dsh_generate_options.prompt = 'HIDDEN'; }, 'RC5_REQUEST_POLICY'],
      ['model-facing tools', (value) => { value.dsh_generate_options.tools.push({ name: 'Read' }); }, 'RC5_REQUEST_POLICY'],
      ['4,001 output tokens', (value) => { value.dsh_generate_options.maxTokens = 4001; }, 'RC5_REQUEST_POLICY'],
      ['second provider call', (value) => { value.execution.max_provider_calls = 2; }, 'RC5_REQUEST_POLICY'],
      ['automatic retry', (value) => { value.execution.automatic_retries = 1; }, 'RC5_REQUEST_POLICY'],
    ];
    for (const [label, mutate, expectedCode] of mutations) {
      const changed = structuredClone(request);
      mutate(changed);
      changed.request_digest.value = RC5_INTERNALS_FOR_TESTS.requestDigest(changed);
      assert.throws(
        () => RC5_INTERNALS_FOR_TESTS.assertOrderedPartsRequest(changed, bundle, item.scenario_id, item.fixture_id),
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
        capabilities: { ordered_system_user_messages_v1: true },
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

    const wireMutations = [
      ['endpoint', (value) => { value.urls[0] = 'https://example.test/responses'; }],
      ['instructions', (value) => { value.payloads[0].instructions = 'hidden'; }],
      ['tools', (value) => { value.payloads[0].tools = []; }],
      ['message order', (value) => { [value.payloads[0].input[0], value.payloads[0].input[1]] = [value.payloads[0].input[1], value.payloads[0].input[0]]; }],
      ['message content', (value) => { value.payloads[0].input[4].content[0].text += ' '; }],
      ['message role', (value) => { value.payloads[0].input[0].role = 'user'; }],
      ['system aggregation', (value) => { value.payloads[0].instructions = value.payloads[0].input.pop().content[0].text; }],
      ['maximum token cap', (value) => { value.payloads[0].max_output_tokens = 4001; }],
      ['capability', (value) => { value.capabilities.ordered_system_user_messages_v1 = false; }],
      ['payload count', (value) => { value.payloads.pop(); }],
      ['fetch count', (value) => { value.http_request_count += 1; }],
      ['provider call count', (value) => { value.provider_calls = 1; }],
      ['retry completion', (value) => { value.retry_probe.completed = true; }],
      ['retry fetch count', (value) => { value.retry_probe.http_request_count = 2; }],
      ['retry provider calls', (value) => { value.retry_probe.provider_calls = 1; }],
      ['retry endpoint', (value) => { value.retry_probe.url = 'https://example.test/responses'; }],
      ['retry payload', (value) => { value.retry_probe.payload.input[0].role = 'user'; }],
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
      ['capability drift', (value) => { value.capabilities.ordered_system_user_messages_v1 = false; }],
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

test('call ledger rejects wrong order, retry, and a fourth call', () => {
  const completed = (scenarioId) => ({ output_tokens: 10, scenario_id: scenarioId, wall_ms: 10 });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertCallLedger([], 'FACT-03'), { code: 'RC5_CASE_ORDER' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertCallLedger([completed('FACT-01')], 'FACT-01'), { code: 'RC5_RETRY_FORBIDDEN' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertCallLedger([{ ...completed('FACT-01'), completion: 'timed_out' }], 'FACT-01'), { code: 'RC5_RETRY_FORBIDDEN' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertCallLedger(RC5_CASE_ORDER.map(completed), 'SAFE-01'), { code: 'RC5_CALL_BUDGET' });
});

test('result validation rejects timeout false-completion, incomplete completion, oversized output, credentials, and external mutation', () => {
  const valid = {
    artifact: '# result',
    attempt_id: 'RC5-ATTEMPT-FACT-01-R01',
    completion: 'completed',
    external_mutations: [],
    output_tokens: 100,
    request_digest: 'a'.repeat(64),
    reservation_id: 'RC5-RESERVATION-FACT-01-R01',
    scenario_id: 'FACT-01',
    trusted_completed: true,
    usefulness: 'not_evaluated',
    wall_ms: 100,
  };
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult(valid);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, completion: 'timed_out' }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, trusted_completed: false }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, output_tokens: 4001 }), { code: 'RC5_RESULT_BUDGET' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, artifact: 'OPENAI_CODEX_OAUTH=secretvalue123' }), { code: 'RC5_CREDENTIAL_LEAK' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, external_mutations: ['tracker_write'] }), { code: 'RC5_EXTERNAL_MUTATION' });
});

test('CLI requires exact authority and reports the unimplemented executor without provider work', async () => {
  const root = tempRoot();
  try {
    const stdout = captureStream();
    const stderr = captureStream();
    const services = { transportProbe: providerFreeTransportProbe };
    assert.equal(await runRC5SliceCli({ argv: ['prepare', '--output-root', root, '--docker-executable', process.execPath], services, stdout: stdout.stream, stderr: stderr.stream }), 0);
    assert.equal(stderr.text(), '');
    assert.equal(await runRC5SliceCli({ argv: ['run', '--case', 'FACT-01', '--output-root', root], services, stdout: stdout.stream, stderr: stderr.stream }), 2);
    assert.match(stderr.text(), /RC5_PROVIDER_AUTHORITY/u);
    const authorizedError = captureStream();
    assert.equal(await runRC5SliceCli({ argv: ['run', '--case', 'FACT-01', '--output-root', root, '--provider-authority'], services, stdout: stdout.stream, stderr: authorizedError.stream }), 1);
    assert.match(authorizedError.text(), /RC5_EXECUTOR_UNIMPLEMENTED/u);
  } finally {
    cleanup(root);
  }
});
