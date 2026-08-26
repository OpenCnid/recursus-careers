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

test('prepare compiles each fixed RC-4 oferta bundle once and stops at the registered V17 incompatibility', async () => {
  const root = tempRoot();
  try {
    const result = await prepareSlice({ outputRoot: root });
    assert.equal(result.compatibility, 'rebuild_required');
    assert.equal(result.recommendation, 'REBUILD');
    const plan = JSON.parse(readFileSync(path.join(root, 'slice-plan.json'), 'utf8'));
    assert.deepEqual(plan.case_order, RC5_CASE_ORDER);
    assert.equal(plan.accepted_inputs.integrity, 'pass');
    assert.equal(plan.policy.model_facing_tools.length, 0);
    assert.equal(plan.compatibility.provider_call_permitted, false);
    assert.ok(plan.compatibility.reasons.includes('RC4_LIM_V17_COMPILED_PROMPT_UNSUPPORTED'));
    for (const item of plan.cases) {
      assert.equal(item.treatment.compile_count, 1);
      assert.equal(item.treatment.target_id, 'recursus-direct-v1');
      assert.equal(item.treatment.model_facing_tools.length, 0);
      assert.ok(readFileSync(path.join(root, ...item.treatment.bundle_path.split('/'))).length > 0);
    }
  } finally {
    cleanup(root);
  }
});

test('authorized run fails closed before invoking a provider when V17 cannot accept the RC-4 bundle', async () => {
  const root = tempRoot();
  try {
    await prepareSlice({ outputRoot: root });
    await expectCode(runSliceCase({ caseId: 'FACT-01', outputRoot: root, providerAuthority: RC5_PROVIDER_AUTHORITY }), 'RC5_ROUTE_INCOMPATIBLE');
    assert.equal(readFileSync(path.join(root, 'slice-plan.json')).length > 0, true);
  } finally {
    cleanup(root);
  }
});

test('summarize records REBUILD with zero calls and does not invent treatment observations', async () => {
  const root = tempRoot();
  try {
    await prepareSlice({ outputRoot: root });
    const result = await summarizeSlice({ outputRoot: root });
    assert.deepEqual(result, { provider_call_count: 0, recommendation: 'REBUILD' });
    const summary = JSON.parse(readFileSync(path.join(root, 'summary.json'), 'utf8'));
    assert.equal(summary.observation_rows.length, 0);
    assert.ok(summary.cases.every((item) => item.completion === 'not_run'));
    assert.match(readFileSync(path.join(root, 'decision.md'), 'utf8'), /\*\*Recommendation:\*\* REBUILD/u);
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
  const fake = {
    accepted_inputs: { digest: '0'.repeat(64), files: [], integrity: 'pass' },
    budgets: { max_concurrency: 1, max_provider_calls: 3, max_output_tokens_per_call: 4000, max_total_output_tokens: 12000, max_wall_ms_per_call: 600000, max_total_wall_ms: 1800000 },
    case_order: [...RC5_CASE_ORDER],
    cases: RC5_CASE_ORDER.map((scenarioId) => ({
      baseline: { attempt_id: RC5_INTERNALS_FOR_TESTS.CASES[scenarioId].baseline_attempt },
      fixture_id: RC5_INTERNALS_FOR_TESTS.CASES[scenarioId].fixture_id,
      scenario_id: scenarioId,
      treatment: { bundle_path: `bundles/${scenarioId}.json` },
    })),
    compatibility: { provider_call_permitted: false, reasons: [], status: 'rebuild_required' },
    plan_digest: { algorithm: 'sha256', value: '0'.repeat(64) },
    plan_id: 'RC5-DISPOSABLE-OFERTA-SLICE',
    policy: { automatic_retries: 0, external_mutation: 'forbidden', model_facing_tools: [] },
    schema_version: '1.0.0',
  };
  fake.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(fake);
  RC5_INTERNALS_FOR_TESTS.validatePlanDocument(fake);
  const wrongCase = structuredClone(fake);
  wrongCase.cases[0].scenario_id = 'FACT-03';
  wrongCase.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(wrongCase);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(wrongCase), { code: 'RC5_CASE_IDENTITY' });
  const wrongBaseline = structuredClone(fake);
  wrongBaseline.cases[0].baseline.attempt_id = 'wrong';
  wrongBaseline.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(wrongBaseline);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(wrongBaseline), { code: 'RC5_CASE_IDENTITY' });
  const escape = structuredClone(fake);
  escape.cases[0].treatment.bundle_path = '../hidden-prompt.json';
  escape.plan_digest.value = RC5_INTERNALS_FOR_TESTS.planDigest(escape);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validatePlanDocument(escape), { code: 'RC5_OUTPUT_ESCAPE' });
});

test('accepted input mutation and execution-policy denials are explicit', () => {
  const before = [{ byte_count: 1, path: 'accepted', sha256: 'a'.repeat(64) }];
  const after = [{ byte_count: 1, path: 'accepted', sha256: 'b'.repeat(64) }];
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertAcceptedSnapshotsEqual(before, after), { code: 'RC5_ACCEPTED_INPUT_MUTATION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: false, max_concurrency: 1, max_output_tokens: 4000, model_facing_tools: ['Read'], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_MODEL_TOOLS' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: true, max_concurrency: 1, max_output_tokens: 4000, model_facing_tools: [], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_EXECUTION_POLICY' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.assertExecutionEnvelope({ external_mutation: false, max_concurrency: 2, max_output_tokens: 4000, model_facing_tools: [], retry_count: 0, timeout_ms: 600000 }), { code: 'RC5_EXECUTION_POLICY' });
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
    completion: 'completed',
    external_mutations: [],
    output_tokens: 100,
    trusted_completed: true,
    wall_ms: 100,
  };
  RC5_INTERNALS_FOR_TESTS.validateAttemptResult(valid);
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, completion: 'timed_out' }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, trusted_completed: false }), { code: 'RC5_FALSE_COMPLETION' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, output_tokens: 4001 }), { code: 'RC5_RESULT_BUDGET' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, artifact: 'OPENAI_CODEX_OAUTH=secretvalue123' }), { code: 'RC5_CREDENTIAL_LEAK' });
  assert.throws(() => RC5_INTERNALS_FOR_TESTS.validateAttemptResult({ ...valid, external_mutations: ['tracker_write'] }), { code: 'RC5_EXTERNAL_MUTATION' });
});

test('CLI requires exact authority and reports the incompatible route without provider work', async () => {
  const root = tempRoot();
  try {
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runRC5SliceCli({ argv: ['prepare', '--output-root', root], stdout: stdout.stream, stderr: stderr.stream }), 0);
    assert.equal(stderr.text(), '');
    assert.equal(await runRC5SliceCli({ argv: ['run', '--case', 'FACT-01', '--output-root', root], stdout: stdout.stream, stderr: stderr.stream }), 2);
    assert.match(stderr.text(), /RC5_PROVIDER_AUTHORITY/u);
    const authorizedError = captureStream();
    assert.equal(await runRC5SliceCli({ argv: ['run', '--case', 'FACT-01', '--output-root', root, '--provider-authority'], stdout: stdout.stream, stderr: authorizedError.stream }), 1);
    assert.match(authorizedError.text(), /RC5_ROUTE_INCOMPATIBLE/u);
  } finally {
    cleanup(root);
  }
});
