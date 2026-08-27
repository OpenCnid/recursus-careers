import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonV1 } from '../../lib/recursus/prompt-context-v1.mjs';
import {
  RC6_INTERNALS_FOR_TESTS,
  RC6_PERMISSION_POLICY_ID,
  RC6_REGISTERED_FAULTS,
  exerciseRunState,
  inspectRunState,
  recoverRunState,
} from '../../lib/recursus/rc6-run-state.mjs';
import { RC6_VALIDATION_EXECUTOR_IMAGE_ID } from '../../lib/recursus/rc6-validation-executor.mjs';
import { runRC6RunStateCli } from '../../scripts/recursus/rc6-run-state.mjs';

const EXACT_EVIDENCE_MODE = 'rc6_validation_executor_exact_provider_free';

function tempRoot(prefix = 'rc6-run-state-') {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function cleanup(root) {
  rmSync(root, { force: true, maxRetries: 10, recursive: true, retryDelay: 50 });
}

function fakeExecutor(options = {}) {
  return Promise.resolve(Object.freeze({
    authority_manifest: {
      id: 'rc5-container-run-authority-v1',
      sha256: 'e284b3117d56e4961f16c58f218d5bc004563b963060070dbc3818df29eb0063',
    },
    cleanup: {
      authority_resources_absent: true,
      credential_lock_residue_count: 0,
      disposable_state_removed: true,
      inspection_error_count: 0,
    },
    exact_container_run: false,
    executor_image_id: RC6_VALIDATION_EXECUTOR_IMAGE_ID,
    provider_calls: 0,
    request_digest: options.request?.request_digest?.value,
    result: {
      artifact: '# Provider-free RC-6 result\n\n- grounded synthetic evidence\n',
      completion: 'completed',
      direct_adapter_invocations: 1,
      error_category: null,
      executor_error_code: null,
      external_mutations: [],
      failure_stage: null,
      finish_reason: 'stop',
      input_tokens: 622,
      oauth_refresh_count: 0,
      output_token_target_exceeded: false,
      output_tokens: 128,
      provider_error_code: null,
      provider_error_detail_class: null,
      provider_error_param: null,
      provider_request_count: 1,
      response_http_status: 200,
      responses_endpoint: 'https://chatgpt.com/backend-api/codex/responses',
      schema_version: '1.3.0',
      simulator_observation: { body_sha256: 'a'.repeat(64), provider_calls: 0, request_count: 1, response_status: 200 },
      transport_mode: 'provider_free_success',
      trusted_completed: true,
      wall_ms: 10,
    },
    retry_count: 0,
    scenario_id: 'FACT-01',
    schema_version: '1.0.0',
    simulator_request_count: 1,
    test_only: true,
    transport_mode: 'provider_free_success',
  }));
}

function exerciseTest(options) {
  return RC6_INTERNALS_FOR_TESTS.exerciseRunStateForTests({ executor: fakeExecutor, ...options });
}

function captureStream() {
  let output = '';
  return {
    stream: { write(value) { output += String(value); return true; } },
    text() { return output; },
  };
}

function runChild(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, arguments_, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (bytes) => { stdout += bytes.toString('utf8'); });
    child.stderr.on('data', (bytes) => { stderr += bytes.toString('utf8'); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}

function retainedBytes(root) {
  const rows = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile()) rows.push([path.relative(root, target).replaceAll('\\', '/'), readFileSync(target).toString('hex')]);
    }
  }
  visit(root);
  return rows;
}

const EXPECTED_FAULT_ROWS = Object.freeze([
  ['before-reservation', 'safely_resumable', 0, 0, 0, 0, 'unverified', 0, null, {}],
  ['after-reservation', 'safely_resumable', 0, 0, 0, 0, 'unverified', 0, null, {}],
  ['after-dispatch', 'indeterminate_stopped', 1, 0, 0, 1, 'unverified', 1, null, {}],
  ['after-simulated-request', 'indeterminate_stopped', 1, 1, 0, 1, 'unverified', 1, null, {}],
  ['after-seal', 'already_complete', 1, 1, 1, 1, 'verified', 1, null, {}],
  ['after-artifact', 'already_complete', 1, 1, 1, 1, 'verified', 1, null, {}],
  ['after-terminal', 'already_complete', 1, 1, 1, 1, 'verified', 0, null, {}],

  ['malformed-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_STATE_INVALID', {}],
  ['truncated-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_STATE_INVALID', {}],
  ['unknown-field-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_SEAL_INVALID', {}],
  ['duplicate-key-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_STATE_NONCANONICAL', {}],
  ['reordered-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_STATE_NONCANONICAL', {}],
  ['oversized-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_STATE_INVALID', {}],

  ['stale-plan', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-request', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-source', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-route', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-provider', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-adapter', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RUN_PLAN', {}],
  ['stale-image', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RUN_PLAN', {}],
  ['stale-model', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['stale-permission', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_PERMISSION_POLICY', {}],
  ['stale-authority', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RUN_PLAN', {}],
  ['adapter-projection-drift', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_ADAPTER_PROJECTION', {}],
  ['retained-request-drift', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_RETAINED_STATE', {}],
  ['automatic-retry-state', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_SEAL_INVALID', {
    usage_mutation_count: 3,
    usage_mutations_denied: true,
  }],

  ['artifact-omission', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_ARTIFACT_INVALID', {}],
  ['artifact-byte-drift', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_ARTIFACT_INVALID', {}],
  ['artifact-hash-mismatch', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_ARTIFACT_INVALID', {}],
  ['artifact-path-escape', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_PATH_ESCAPE', {}],
  ['artifact-media-type-drift', 'fail_closed', 1, 1, 0, 0, 'verified', 0, 'RC6_ARTIFACT_INVALID', {}],
  ['artifact-replacement-race', 'fail_closed', 1, 1, 0, 0, 'verified', 1, 'RC6_ARTIFACT_INVALID', {
    replacement_observed: true,
  }],

  ['cleanup-failure', 'fail_closed', 1, 1, 0, 0, 'failed', 0, 'RC6_CLEANUP_UNVERIFIED', {}],
  ['container-residue', 'fail_closed', 1, 1, 0, 0, 'failed', 0, 'RC6_CLEANUP_UNVERIFIED', {}],
  ['network-residue', 'fail_closed', 1, 1, 0, 0, 'failed', 0, 'RC6_CLEANUP_UNVERIFIED', {}],
  ['credential-lock-residue', 'fail_closed', 1, 1, 0, 0, 'failed', 0, 'RC6_CLEANUP_UNVERIFIED', {}],

  ['recovery-race', 'already_complete', 1, 1, 1, 1, 'verified', 1, null, {
    cross_process: true,
    loser_classification: 'fail_closed',
    loser_diagnostic_code: 'RC6_RECOVERY_LOCK_HELD',
  }],
  ['repeated-inspect-recover', 'already_complete', 1, 1, 1, 1, 'verified', 0, null, {
    inspect_count: 3,
    recover_count: 3,
    retained_bytes_unchanged: true,
  }],
  ['second-dispatch', 'already_complete', 1, 1, 1, 1, 'verified', 0, null, {
    duplicate_dispatch_denied: true,
  }],
  ['automatic-retry-attempt', 'already_complete', 1, 1, 1, 1, 'verified', 0, null, {
    retry_attempt_denied: true,
  }],
]);

const EXPECTED_FAULTS = Object.freeze(EXPECTED_FAULT_ROWS.map(([fault]) => fault));
const EXPECTED_FAULTS_BY_NAME = new Map(EXPECTED_FAULT_ROWS.map((row) => [row[0], row]));
const EXPECTED_CAPTURE_TOTALS = Object.freeze({
  artifact_count: 7,
  automatic_retries: 0,
  cleanup_states: Object.freeze({ failed: 4, unverified: 4, verified: 32 }),
  dispatch_count: 38,
  operator_steps: 6,
  provider_call_count: 0,
  simulated_request_count: 37,
  terminal_count: 9,
});

function canonicalMutation(filePath, mutate, digestKey = null) {
  const value = JSON.parse(readFileSync(filePath, 'utf8'));
  mutate(value);
  if (digestKey !== null) value[digestKey] = RC6_INTERNALS_FOR_TESTS.digestProjection(value, digestKey);
  writeFileSync(filePath, canonicalJsonV1(value));
}

test('provider-neutral policy is closed, independently identified, and zero-provider for RC-6 acceptance', () => {
  const scope = {
    adapter_revision: 'a', executor_image_id: 'b', interface_id: 'c', interface_version: '1.0.0', model: 'd',
    output_frame_id: 'e', provider: 'f', reasoning_effort: 'g', request_digest: 'h', request_file_sha256: 'i',
    route_id: 'j', source_closure_digest: 'k', wire_contract: 'l',
  };
  const policy = RC6_INTERNALS_FOR_TESTS.buildPermissionPolicy(scope);
  assert.equal(policy.policy_id, RC6_PERMISSION_POLICY_ID);
  assert.equal(policy.adapter_independent, true);
  assert.equal(policy.provider.rc6_acceptance_max_provider_calls, 0);
  assert.equal(policy.provider.automatic_retries, 0);
  assert.equal(policy.artifact.media_type, 'text/markdown');
  assert.deepEqual(policy.allowed_semantics, [...RC6_INTERNALS_FOR_TESTS.ALLOWED_SEMANTICS]);
  assert.deepEqual(policy.denied_capabilities, [...RC6_INTERNALS_FOR_TESTS.DENIED_CAPABILITIES]);
  for (const denied of ['model_tools', 'browser', 'plugins', 'shell', 'child_agents', 'submission', 'send', 'contact', 'tracker_mutation', 'external_mutation']) {
    assert.ok(policy.denied_capabilities.includes(denied), denied);
  }
  assert.equal(RC6_INTERNALS_FOR_TESTS.validatePermissionPolicy(policy, scope), policy);
  for (const mutate of [
    (value) => value.denied_capabilities.pop(),
    (value) => value.denied_capabilities.reverse(),
    (value) => value.denied_capabilities.push('unknown'),
    (value) => { value.provider.automatic_retries = 1; },
    (value) => { value.provider.rc6_acceptance_max_provider_calls = 1; },
    (value) => { value.sources.task_authority = 'instruction'; },
    (value) => { value.artifact.media_type = 'text/html'; },
    (value) => { value.diagnostics.retained_fields.push('raw'); },
  ]) {
    const changed = structuredClone(policy);
    mutate(changed);
    changed.policy_sha256 = RC6_INTERNALS_FOR_TESTS.digestProjection(changed, 'policy_sha256');
    assert.throws(() => RC6_INTERNALS_FOR_TESTS.validatePermissionPolicy(changed, scope), { code: 'RC6_PERMISSION_POLICY' });
  }
});

test('prepared and reserved checkpoints are safely resumable without dispatch or simulator requests', async () => {
  for (const fault of ['before-reservation', 'after-reservation']) {
    const root = tempRoot(`rc6-${fault}-`);
    try {
      const first = await exerciseRunState({ fault, outputRoot: root });
      assert.deepEqual(first, {
        artifact_count: 0,
        artifact_sha256: null,
        automatic_retries: 0,
        classification: 'safely_resumable',
        cleanup_state: 'unverified',
        diagnostic_code: null,
        dispatch_count: 0,
        evidence_mode: EXACT_EVIDENCE_MODE,
        permission_policy_id: RC6_PERMISSION_POLICY_ID,
        provider_call_count: 0,
        run_id: first.run_id,
        simulated_request_count: 0,
        terminal_count: 0,
      });
      const before = retainedBytes(root);
      assert.deepEqual(await inspectRunState({ outputRoot: root }), first);
      assert.deepEqual(await recoverRunState({ outputRoot: root }), first);
      assert.deepEqual(retainedBytes(root), before);
    } finally { cleanup(root); }
  }
});

test('dispatch without a trusted seal stops indeterminate and never replays', async () => {
  for (const [fault, requests] of [['after-dispatch', 0], ['after-simulated-request', 1]]) {
    const root = tempRoot(`rc6-${fault}-`);
    try {
      const result = await exerciseTest({ fault, outputRoot: root });
      assert.equal(result.classification, 'indeterminate_stopped');
      assert.equal(result.dispatch_count, 1);
      assert.equal(result.simulated_request_count, requests);
      assert.equal(result.provider_call_count, 0);
      assert.equal(result.automatic_retries, 0);
      assert.equal(result.artifact_count, 0);
      assert.equal(result.terminal_count, 1);
      const before = retainedBytes(root);
      assert.deepEqual(await recoverRunState({ outputRoot: root }), result);
      assert.deepEqual(retainedBytes(root), before);
    } finally { cleanup(root); }
  }
});

test('staged artifact and verified cleanup without the final seal remain indeterminate', async () => {
  const root = tempRoot('rc6-preseal-crash-');
  try {
    const state = await RC6_INTERNALS_FOR_TESTS.prepareRun(root, 'after-seal');
    const reservation = await RC6_INTERNALS_FOR_TESTS.writeReservation(state);
    const dispatch = await RC6_INTERNALS_FOR_TESTS.writeDispatch(state, reservation);
    const execution = await fakeExecutor({ request: state.request });
    await RC6_INTERNALS_FOR_TESTS.writeExecutionObservation(state, execution.result, execution.cleanup);
    await RC6_INTERNALS_FOR_TESTS.sealResult(state, execution.result, execution.cleanup, dispatch);
    rmSync(path.join(root, 'sealed-results', 'FACT-01.json'));
    const result = await recoverRunState({ outputRoot: root });
    assert.equal(result.classification, 'indeterminate_stopped');
    assert.equal(result.dispatch_count, 1);
    assert.equal(result.simulated_request_count, 1);
    assert.equal(result.provider_call_count, 0);
    assert.equal(result.artifact_count, 0);
    assert.equal(result.cleanup_state, 'unverified');
    assert.equal(existsSync(path.join(root, 'artifacts', 'FACT-01.md')), false);
  } finally { cleanup(root); }
});

test('sealed-result, artifact-publication, and terminal checkpoints recover to one identical completion', async () => {
  for (const fault of ['after-seal', 'after-artifact', 'after-terminal']) {
    const root = tempRoot(`rc6-${fault}-`);
    try {
      const result = await exerciseTest({ fault, outputRoot: root });
      assert.equal(result.classification, 'already_complete');
      assert.equal(result.dispatch_count, 1);
      assert.equal(result.simulated_request_count, 1);
      assert.equal(result.provider_call_count, 0);
      assert.equal(result.automatic_retries, 0);
      assert.equal(result.artifact_count, 1);
      assert.equal(result.terminal_count, 1);
      assert.match(result.artifact_sha256, /^[a-f0-9]{64}$/u);
      const before = retainedBytes(root);
      for (let count = 0; count < 3; count += 1) {
        assert.deepEqual(await inspectRunState({ outputRoot: root }), result);
        assert.deepEqual(await recoverRunState({ outputRoot: root }), result);
      }
      assert.deepEqual(retainedBytes(root), before);
    } finally { cleanup(root); }
  }
});

test('every registered mutation fails closed with its bounded diagnostic and exact zero-replay counts', async (t) => {
  const expected = EXPECTED_FAULT_ROWS.filter(([, classification]) => classification === 'fail_closed');
  for (const [fault, , dispatches, requests, artifacts, terminals, cleanupState, , code, faultAssertions] of expected) {
    await t.test(fault, async () => {
      const root = tempRoot('rc6-mutation-');
      try {
        const result = await exerciseTest({ fault, outputRoot: root });
        assert.equal(result.classification, 'fail_closed');
        assert.equal(result.diagnostic_code, code);
        assert.equal(result.dispatch_count, dispatches);
        assert.equal(result.simulated_request_count, requests);
        assert.equal(result.provider_call_count, 0);
        assert.equal(result.automatic_retries, 0);
        assert.equal(result.artifact_count, artifacts);
        assert.equal(result.terminal_count, terminals);
        assert.equal(result.cleanup_state, cleanupState);
        if (Object.keys(faultAssertions).length === 0) assert.equal(result.fault_assertions, undefined);
        else assert.deepEqual(result.fault_assertions, faultAssertions);
        assert.ok(Buffer.byteLength(canonicalJsonV1(result), 'utf8') < 2_048);
        const { fault_assertions: _faultAssertions, ...persistedObservation } = result;
        assert.deepEqual(await recoverRunState({ outputRoot: root }), persistedObservation);
      } finally { cleanup(root); }
    });
  }
});

test('cross-process recovery, repeated observation, duplicate dispatch, and retry denial retain one terminal identity', async () => {
  const expectedAssertions = new Map([
    ['recovery-race', {
      cross_process: true,
      loser_classification: 'fail_closed',
      loser_diagnostic_code: 'RC6_RECOVERY_LOCK_HELD',
    }],
    ['repeated-inspect-recover', { inspect_count: 3, recover_count: 3, retained_bytes_unchanged: true }],
    ['second-dispatch', { duplicate_dispatch_denied: true }],
    ['automatic-retry-attempt', { retry_attempt_denied: true }],
  ]);
  for (const [fault, assertions] of expectedAssertions) {
    const root = tempRoot(`rc6-${fault}-`);
    try {
      const result = await exerciseTest({ fault, outputRoot: root });
      assert.equal(result.classification, 'already_complete');
      assert.equal(result.artifact_count, 1);
      assert.equal(result.terminal_count, 1);
      assert.equal(result.dispatch_count, 1);
      assert.equal(readdirSync(path.join(root, 'dispatches')).length, 1);
      assert.equal(readdirSync(path.join(root, 'artifacts')).length, 1);
      assert.equal(readdirSync(path.join(root, 'attempts')).length, 1);
      assert.equal(readdirSync(path.join(root, 'locks')).length, 0);
      assert.deepEqual(result.fault_assertions, assertions);
    } finally { cleanup(root); }
  }
});

test('a second recovery process loses the exclusive lock before artifact publication', async () => {
  const root = tempRoot('rc6-process-race-');
  let releaseLock;
  let winnerPromise;
  try {
    const state = await RC6_INTERNALS_FOR_TESTS.prepareRun(root, 'recovery-race');
    const reservation = await RC6_INTERNALS_FOR_TESTS.writeReservation(state);
    const dispatch = await RC6_INTERNALS_FOR_TESTS.writeDispatch(state, reservation);
    const execution = await fakeExecutor({ request: state.request });
    await RC6_INTERNALS_FOR_TESTS.writeExecutionObservation(state, execution.result, execution.cleanup);
    await RC6_INTERNALS_FOR_TESTS.sealResult(state, execution.result, execution.cleanup, dispatch);

    let announceLock;
    const locked = new Promise((resolve) => { announceLock = resolve; });
    const released = new Promise((resolve) => { releaseLock = resolve; });
    winnerPromise = RC6_INTERNALS_FOR_TESTS.recoverRunStateForTests({ outputRoot: root }, {
      afterLock: async () => {
        announceLock();
        await released;
      },
    });
    await locked;
    const script = path.resolve(import.meta.dirname, '..', '..', 'scripts', 'recursus', 'rc6-run-state.mjs');
    const loser = await runChild([script, 'recover', '--output-root', root]);
    assert.equal(loser.code, 1);
    assert.equal(loser.stderr, '');
    const loserObservation = JSON.parse(loser.stdout);
    assert.equal(loserObservation.classification, 'fail_closed');
    assert.equal(loserObservation.diagnostic_code, 'RC6_RECOVERY_LOCK_HELD');
    assert.equal(loserObservation.artifact_count, 0);
    releaseLock();
    releaseLock = undefined;
    const winner = await winnerPromise;
    assert.equal(winner.classification, 'already_complete');
    assert.equal(readdirSync(path.join(root, 'artifacts')).length, 1);
    assert.equal(readdirSync(path.join(root, 'attempts')).length, 1);
    assert.equal(readdirSync(path.join(root, 'dispatches')).length, 1);
    assert.equal(readdirSync(path.join(root, 'locks')).length, 0);
  } finally {
    releaseLock?.();
    await winnerPromise?.catch(() => {});
    cleanup(root);
  }
});

test('canonical state reader rejects structural and identity mutations before publication', async () => {
  const base = tempRoot('rc6-mutation-base-');
  const roots = [base];
  try {
    const state = await RC6_INTERNALS_FOR_TESTS.prepareRun(base, 'after-seal');
    const reservation = await RC6_INTERNALS_FOR_TESTS.writeReservation(state);
    const dispatch = await RC6_INTERNALS_FOR_TESTS.writeDispatch(state, reservation);
    const execution = await fakeExecutor();
    await RC6_INTERNALS_FOR_TESTS.writeExecutionObservation(state, execution.result, execution.cleanup);
    await RC6_INTERNALS_FOR_TESTS.sealResult(state, execution.result, execution.cleanup, dispatch);

    const mutations = [
      ['truncated', 'sealed-results/FACT-01.json', (file) => writeFileSync(file, '{')],
      ['unknown-field', 'sealed-results/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.unknown = true; }, 'sealed_result_sha256')],
      ['reordered', 'sealed-results/FACT-01.json', (file) => {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, JSON.stringify(value, null, 2));
      }],
      ['duplicate-key', 'sealed-results/FACT-01.json', (file) => {
        const text = readFileSync(file, 'utf8');
        writeFileSync(file, `{"schema_version":"1.0.0",${text.slice(1)}`);
      }],
      ['oversized', 'sealed-results/FACT-01.json', (file) => writeFileSync(file, ' '.repeat(131_073))],
      ['plan', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.retained_plan_digest = 'b'.repeat(64); }, 'run_plan_sha256')],
      ['request', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.request_digest = 'b'.repeat(64); }, 'run_plan_sha256')],
      ['source', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.source_closure_digest = 'b'.repeat(64); }, 'run_plan_sha256')],
      ['route', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.route_id = 'changed'; }, 'run_plan_sha256')],
      ['provider', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.provider = 'changed'; }, 'run_plan_sha256')],
      ['adapter', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.adapter_revision = 'b'.repeat(40); }, 'run_plan_sha256')],
      ['image', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.executor_image_id = `sha256:${'b'.repeat(64)}`; }, 'run_plan_sha256')],
      ['model', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.scope.model = 'changed'; }, 'run_plan_sha256')],
      ['permission', 'permission-policy.json', (file) => canonicalMutation(file, (value) => { value.denied_capabilities.pop(); }, 'policy_sha256')],
      ['adapter-projection', 'adapter-projection.json', (file) => canonicalMutation(file, (value) => { value.final_wire.tools_field = 'present'; }, 'projection_sha256')],
      ['authority', 'run-plan.json', (file) => canonicalMutation(file, (value) => { value.authority.authority_id = 'changed'; }, 'run_plan_sha256')],
      ['retry', 'sealed-results/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.automatic_retries = 1; }, 'sealed_result_sha256')],
      ['negative-input-tokens', 'sealed-results/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.input_tokens = -1; }, 'sealed_result_sha256'), 'RC6_USAGE_INVALID'],
      ['excessive-output-tokens', 'sealed-results/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.output_tokens = 1_000_001; value.output_token_target_exceeded = true; }, 'sealed_result_sha256'), 'RC6_USAGE_INVALID'],
      ['inconsistent-output-token-target', 'sealed-results/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.output_token_target_exceeded = true; }, 'sealed_result_sha256'), 'RC6_USAGE_INVALID'],
      ['container-residue', 'cleanup/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.container_residue_count = 1; }, 'cleanup_sha256')],
      ['network-residue', 'cleanup/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.network_residue_count = 1; }, 'cleanup_sha256')],
      ['credential-lock-residue', 'cleanup/FACT-01.json', (file) => canonicalMutation(file, (value) => { value.credential_lock_residue_count = 1; }, 'cleanup_sha256')],
      ['retained-request', 'retained-rc5/requests/FACT-01.dsh-request.json', (file) => canonicalMutation(file, (value) => { value.unknown = true; })],
    ];
    for (const [name, relative, mutate, diagnosticCode] of mutations) {
      const root = tempRoot(`rc6-mutation-${name}-`);
      roots.push(root);
      cleanup(root);
      cpSync(base, root, { recursive: true });
      mutate(path.join(root, ...relative.split('/')));
      const result = await inspectRunState({ outputRoot: root });
      assert.equal(result.classification, 'fail_closed', name);
      if (diagnosticCode === undefined) assert.match(result.diagnostic_code, /^RC6_/u, name);
      else assert.equal(result.diagnostic_code, diagnosticCode, name);
      assert.equal(result.provider_call_count, 0, name);
      assert.equal(result.automatic_retries, 0, name);
    }
  } finally {
    for (const root of roots) if (existsSync(root)) cleanup(root);
  }
});

test('artifact omission, hash, media, path, and replacement mutations cannot complete', async () => {
  const base = tempRoot('rc6-artifact-base-');
  const roots = [base];
  try {
    await exerciseTest({ fault: 'after-terminal', outputRoot: base });
    const mutations = [
      ['omitted', (root) => rmSync(path.join(root, 'artifacts', 'FACT-01.md'))],
      ['bytes', (root) => writeFileSync(path.join(root, 'artifacts', 'FACT-01.md'), 'changed')],
      ['hash', (root) => canonicalMutation(path.join(root, 'sealed-results', 'FACT-01.json'), (value) => { value.artifact.sha256 = 'b'.repeat(64); }, 'sealed_result_sha256')],
      ['path', (root) => canonicalMutation(path.join(root, 'sealed-results', 'FACT-01.json'), (value) => { value.artifact.path = '../escape.md'; }, 'sealed_result_sha256')],
      ['media', (root) => canonicalMutation(path.join(root, 'sealed-results', 'FACT-01.json'), (value) => { value.artifact.media_type = 'text/html'; }, 'sealed_result_sha256')],
    ];
    for (const [name, mutate] of mutations) {
      const root = tempRoot(`rc6-artifact-${name}-`);
      roots.push(root);
      cleanup(root);
      cpSync(base, root, { recursive: true });
      mutate(root);
      const result = await recoverRunState({ outputRoot: root });
      assert.equal(result.classification, 'fail_closed', name);
      assert.equal(result.provider_call_count, 0, name);
      assert.equal(result.automatic_retries, 0, name);
    }
  } finally {
    for (const root of roots) if (existsSync(root)) cleanup(root);
  }
});

test('two independent provider-free fault matrix captures retain byte-identical deterministic summaries', async () => {
  const roots = [tempRoot('rc6-matrix-a-'), tempRoot('rc6-matrix-b-')];
  try {
    const captures = [];
    for (const root of roots) captures.push(await exerciseTest({ fault: 'matrix', outputRoot: root }));
    assert.deepEqual(captures[0], captures[1]);
    assert.equal(captures[0].evidence_mode, 'injected_test_only');
    assert.deepEqual(RC6_REGISTERED_FAULTS, EXPECTED_FAULTS);
    assert.deepEqual(captures[0].fault_order, EXPECTED_FAULTS);
    assert.equal(captures[0].cases.length, RC6_REGISTERED_FAULTS.length);
    assert.equal(captures[0].cases.length, 40);
    assert.equal(captures[0].provider_calls, 0);
    assert.deepEqual(captures[0].capture_totals, EXPECTED_CAPTURE_TOTALS);
    assert.equal(readFileSync(path.join(roots[0], 'fault-matrix-capture.json'), 'utf8'),
      readFileSync(path.join(roots[1], 'fault-matrix-capture.json'), 'utf8'));
    const completedArtifactHashes = new Set();
    for (const item of captures[0].cases) {
      const expected = EXPECTED_FAULTS_BY_NAME.get(item.fault);
      assert.ok(expected, item.fault);
      const [, classification, dispatches, requests, artifacts, terminals, cleanupState, operatorSteps, diagnosticCode,
        faultAssertions] = expected;
      assert.equal(item.observation.classification, classification, item.fault);
      assert.equal(item.observation.dispatch_count, dispatches, item.fault);
      assert.equal(item.observation.simulated_request_count, requests, item.fault);
      assert.equal(item.observation.artifact_count, artifacts, item.fault);
      assert.equal(item.observation.terminal_count, terminals, item.fault);
      assert.equal(item.observation.cleanup_state, cleanupState, item.fault);
      assert.equal(item.operator_steps, operatorSteps, item.fault);
      assert.equal(item.observation.diagnostic_code, diagnosticCode, item.fault);
      assert.equal(item.observation.provider_call_count, 0, item.fault);
      assert.equal(item.observation.automatic_retries, 0, item.fault);
      assert.equal(item.observation.evidence_mode, 'injected_test_only', item.fault);
      assert.deepEqual(item.fault_assertions, faultAssertions, item.fault);
      if (artifacts === 1) completedArtifactHashes.add(item.observation.artifact_sha256);
      else assert.equal(item.observation.artifact_sha256, null, item.fault);
    }
    assert.equal(completedArtifactHashes.size, 1);
    assert.match([...completedArtifactHashes][0], /^[a-f0-9]{64}$/u);
  } finally { for (const root of roots) cleanup(root); }
});

test('CLI keeps inspect/recover networkless and rejects provider or credential-shaped options', async () => {
  const root = tempRoot('rc6-cli-');
  try {
    const badOut = captureStream();
    const badErr = captureStream();
    assert.equal(await runRC6RunStateCli({
      argv: ['inspect', '--output-root', root, '--docker-executable', 'C:\\docker.exe'],
      stderr: badErr.stream,
      stdout: badOut.stream,
    }), 2);
    assert.match(badErr.text(), /RC6_ARGUMENT/u);
    assert.equal(readdirSync(root).length, 0);

    const preparedOut = captureStream();
    assert.equal(await runRC6RunStateCli({
      argv: ['exercise', '--output-root', root, '--fault', 'before-reservation'],
      stderr: captureStream().stream,
      stdout: preparedOut.stream,
    }), 0);
    const preparedObservation = JSON.parse(preparedOut.text());
    assert.equal(preparedObservation.classification, 'safely_resumable');
    assert.equal(preparedObservation.evidence_mode, EXACT_EVIDENCE_MODE);

    const inspectOut = captureStream();
    assert.equal(await runRC6RunStateCli({
      argv: ['inspect', '--output-root', root],
      stderr: captureStream().stream,
      stdout: inspectOut.stream,
    }), 0);
    assert.equal(JSON.parse(inspectOut.text()).provider_call_count, 0);
  } finally { cleanup(root); }
});

test('output-root boundary rejects missing, nonempty, repository, broad, aliased, and credential-shaped roots', async () => {
  const parent = tempRoot('rc6-root-boundary-');
  try {
    const missing = path.join(parent, 'missing', 'run');
    assert.equal((await inspectRunState({ outputRoot: missing })).classification, 'fail_closed');
    const nonempty = path.join(parent, 'nonempty');
    mkdirSync(nonempty);
    writeFileSync(path.join(nonempty, 'preserve.txt'), 'preserve');
    await assert.rejects(exerciseRunState({ fault: 'before-reservation', outputRoot: nonempty }));
    assert.equal(readFileSync(path.join(nonempty, 'preserve.txt'), 'utf8'), 'preserve');
    await assert.rejects(exerciseRunState({ fault: 'before-reservation', outputRoot: path.resolve(import.meta.dirname, '..', '..') }));
    await assert.rejects(exerciseRunState({ fault: 'before-reservation', outputRoot: tmpdir() }));
    const credentialRoot = path.join(parent, 'credentials', 'run');
    mkdirSync(credentialRoot, { recursive: true });
    await assert.rejects(exerciseRunState({ fault: 'before-reservation', outputRoot: credentialRoot }), { code: 'RC6_OUTPUT_ROOT_PROTECTED' });
    const worktreeParent = path.resolve(import.meta.dirname, '..', '..', '..');
    const protectedObservation = await inspectRunState({ outputRoot: worktreeParent });
    assert.equal(protectedObservation.classification, 'fail_closed');
    assert.equal(protectedObservation.diagnostic_code, 'RC6_OUTPUT_ROOT_PROTECTED');
    assert.equal(protectedObservation.run_id, null);
    const aliasTarget = path.join(parent, 'alias-target');
    const aliasRoot = path.join(parent, 'alias-root');
    mkdirSync(aliasTarget);
    symlinkSync(aliasTarget, aliasRoot, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(exerciseRunState({ fault: 'before-reservation', outputRoot: aliasRoot }));
  } finally { cleanup(parent); }
});

test('public exercise rejects injected executors and cannot mint Docker-exact evidence from a callback', async () => {
  const root = tempRoot('rc6-public-injection-');
  try {
    await assert.rejects(exerciseRunState({ executor: fakeExecutor, fault: 'after-terminal', outputRoot: root }), {
      code: 'RC6_ARGUMENT',
    });
    assert.equal(readdirSync(root).length, 0);
    await exerciseRunState({ fault: 'before-reservation', outputRoot: root });
    const exactState = await RC6_INTERNALS_FOR_TESTS.readAndValidateState(root);
    await assert.rejects(RC6_INTERNALS_FOR_TESTS.writeReservation(exactState), { code: 'RC6_TEST_ONLY_STATE' });
    await assert.rejects(RC6_INTERNALS_FOR_TESTS.sealResult(exactState, {}, {}, {}), { code: 'RC6_TEST_ONLY_STATE' });
    await assert.rejects(RC6_INTERNALS_FOR_TESTS.publishTerminal(exactState), { code: 'RC6_TEST_ONLY_STATE' });
    await assert.rejects(RC6_INTERNALS_FOR_TESTS.recoverRunStateForTests({ outputRoot: root }), { code: 'RC6_TEST_ONLY_STATE' });
    await assert.rejects(RC6_INTERNALS_FOR_TESTS.prepareRun(root, 'before-reservation', EXACT_EVIDENCE_MODE), {
      code: 'RC6_ARGUMENT',
    });
  } finally { cleanup(root); }
});
