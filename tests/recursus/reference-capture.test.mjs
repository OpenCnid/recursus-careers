import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  RC2_DRY_RUN_ID,
  RC2_RANDOMIZATION_SEED,
  ReferenceError,
  assertContentSafe,
  cleanupWorkspace,
  createRegistration,
  deriveRandomizedAttempts,
  formatReferenceError,
  loadCapturePlan,
  prepareWorkspace,
  recordActualOutcome,
  reserveActualAttempt,
  runDryRun,
  validatePortableRelativePath,
  validateReferenceEvidence,
} from '../../lib/recursus-reference-v4.mjs';
import { canonicalStringify, sha256, validateCorpus } from '../../lib/recursus-benchmark.mjs';
import { parseClaudeStream, runRegisteredClaude, terminateChildHard, validateRunnerPathSyntax } from '../../lib/recursus-reference-capture-v4.mjs';
import { parseCaptureRequest } from '../../capture-recursus-reference-v4.mjs';
import { main as verifyReferenceMain } from '../../verify-recursus-reference-v4.mjs';

const require = createRequire(import.meta.url);
const suiteRoot = mkdtempSync(join(tmpdir(), 'recursus-rc2-tests-'));
const baseEvidence = join(suiteRoot, 'base');
const v4EvidenceTemplate = join(process.cwd(), 'evals', 'recursus', 'rc2-claude-code-reference-v4');
let cloneIndex = 0;

function canonicalBytes(value) {
  return Buffer.from(`${canonicalStringify(value)}\n`, 'utf8');
}

function writeCanonical(pathValue, value) {
  writeFileSync(pathValue, canonicalBytes(value));
}

function readJson(pathValue) {
  return JSON.parse(readFileSync(pathValue, 'utf8'));
}

function reference(pathValue, bytes) {
  return { byte_count: bytes.length, path: pathValue, sha256: sha256(bytes) };
}

function cloneEvidence() {
  const root = join(suiteRoot, `case-${String(++cloneIndex).padStart(3, '0')}`);
  cpSync(baseEvidence, root, { recursive: true });
  return root;
}

function createPreRegistrationBase(root) {
  mkdirSync(root);
  cpSync(join(v4EvidenceTemplate, 'README.md'), join(root, 'README.md'));
  cpSync(join(v4EvidenceTemplate, 'schemas'), join(root, 'schemas'), { recursive: true });
}

function completeOutcome(output = '# Synthetic output\n\nGrounded review draft.\n') {
  return {
    conflictingTerminalEvents: false,
    durationMs: 25,
    exitCode: 0,
    externalRunnerStarted: true,
    inputTokens: 10,
    malformedEventCount: 0,
    outputBytes: Buffer.from(output, 'utf8'),
    outputTokens: 8,
    providerRequest: 'not_observed',
    signal: null,
    timedOut: false,
    totalCostUsd: 0.01,
    traceEvents: [
      { event: 'workspace_created', code: 'ACTUAL_WORKSPACE', value: null },
      { event: 'seed_validated', code: 'RC1_SEED_VALID', value: 'SEED-INVENTORY-FACT-01' },
      { event: 'invocation_constructed', code: 'ACTUAL_INVOCATION', value: null },
      { event: 'external_runner_started', code: 'RUNNER_STARTED', value: null },
      { event: 'external_runner_exited', code: 'RUNNER_EXITED', value: 0 },
      { event: 'output_captured', code: 'OUTPUT_CAPTURED', value: output.length },
    ],
    trustedTerminalEvent: true,
    trustedTerminalSuccess: true,
  };
}

function rewriteSourceSnapshot(root, mutate) {
  const registrationPath = join(root, 'registration.json');
  const registration = readJson(registrationPath);
  const snapshotPath = join(root, ...registration.source_snapshot.path.split('/'));
  const snapshot = readJson(snapshotPath);
  mutate(snapshot);
  const snapshotBytes = canonicalBytes(snapshot);
  writeFileSync(snapshotPath, snapshotBytes);
  registration.source_snapshot = reference(registration.source_snapshot.path, snapshotBytes);
  writeCanonical(registrationPath, registration);
  return registration.source_snapshot;
}

function aggregateInventory(inventory) {
  const values = inventory.map(({ path, byte_count, sha256: digest }) => ({ path, byte_count, sha256: digest }));
  return sha256(Buffer.from(canonicalStringify(values), 'utf8'));
}

function allFileText(root) {
  const values = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) values.push(readFileSync(full, 'utf8'));
    }
  };
  visit(root);
  return values.join('\n');
}

function appendActual(root, outcome = completeOutcome()) {
  const plan = deriveRandomizedAttempts()[0];
  const prepared = prepareWorkspace({ scenarioId: plan.scenario_id });
  const recordedAt = '2026-08-24T12:01:00.000Z';
  try {
    reserveActualAttempt({ evidenceDir: root, recordedAt });
    return recordActualOutcome({
      evidenceDir: root,
      expectedAttemptId: plan.attempt_id,
      outcome,
      preReserved: true,
      prepared,
      recordedAt,
    });
  } finally {
    cleanupWorkspace(prepared);
  }
}

function rewriteManifestAndLedger(root, sequence, mutate) {
  const ledgerName = readdirSync(join(root, 'evidence', 'ledger')).sort()[sequence];
  const ledgerPath = join(root, 'evidence', 'ledger', ledgerName);
  const ledger = readJson(ledgerPath);
  const manifestPath = join(root, ...ledger.runner_manifest.path.split('/'));
  const manifest = readJson(manifestPath);
  mutate(manifest, ledger);
  const manifestBytes = canonicalBytes(manifest);
  writeFileSync(manifestPath, manifestBytes);
  ledger.runner_manifest = reference(ledger.runner_manifest.path, manifestBytes);
  writeCanonical(ledgerPath, ledger);
}

function rewriteTraceAndLedger(root, sequence, mutate) {
  const ledgerName = readdirSync(join(root, 'evidence', 'ledger')).sort()[sequence];
  const ledgerPath = join(root, 'evidence', 'ledger', ledgerName);
  const ledger = readJson(ledgerPath);
  const manifestPath = join(root, ...ledger.runner_manifest.path.split('/'));
  const manifest = readJson(manifestPath);
  const tracePath = join(root, ...manifest.trace.path.split('/'));
  const traceValue = readJson(tracePath);
  mutate(traceValue);
  const traceBytes = canonicalBytes(traceValue);
  writeFileSync(tracePath, traceBytes);
  const traceRef = reference(manifest.trace.path, traceBytes);
  manifest.trace = traceRef;
  const normalizedPath = join(root, ...manifest.normalized_result.path.split('/'));
  const normalized = readJson(normalizedPath);
  normalized.trace = traceRef;
  const normalizedBytes = canonicalBytes(normalized);
  writeFileSync(normalizedPath, normalizedBytes);
  manifest.normalized_result = reference(manifest.normalized_result.path, normalizedBytes);
  const manifestBytes = canonicalBytes(manifest);
  writeFileSync(manifestPath, manifestBytes);
  ledger.runner_manifest = reference(ledger.runner_manifest.path, manifestBytes);
  writeCanonical(ledgerPath, ledger);
}

function rewriteInvocationAndLedger(root, sequence, mutate) {
  const ledgerName = readdirSync(join(root, 'evidence', 'ledger')).sort()[sequence];
  const ledgerPath = join(root, 'evidence', 'ledger', ledgerName);
  const ledger = readJson(ledgerPath);
  const manifestPath = join(root, ...ledger.runner_manifest.path.split('/'));
  const manifest = readJson(manifestPath);
  const invocationPath = join(root, ...manifest.invocation.path.split('/'));
  const invocation = readJson(invocationPath);
  mutate(invocation);
  const invocationBytes = canonicalBytes(invocation);
  writeFileSync(invocationPath, invocationBytes);
  manifest.invocation = reference(manifest.invocation.path, invocationBytes);
  const manifestBytes = canonicalBytes(manifest);
  writeFileSync(manifestPath, manifestBytes);
  ledger.runner_manifest = reference(ledger.runner_manifest.path, manifestBytes);
  writeCanonical(ledgerPath, ledger);
}

before(() => {
  createRegistration({
    allowTestRoot: true,
    evidenceDir: baseEvidence,
    registeredAt: '2026-08-24T12:00:00.000Z',
    runnerBinarySha256: 'a'.repeat(64),
    runnerVersion: '2.1.223',
  });
  runDryRun({ evidenceDir: baseEvidence });
});

after(() => rmSync(suiteRoot, { force: true, recursive: true }));

test('randomization is fixed, complete, and reproducible', () => {
  const expected = [
    'FACT-01:1', 'FACT-01:2', 'SAFE-01:1', 'FACT-03:3',
    'SAFE-01:2', 'FACT-03:1', 'NOSUB-01:3', 'FACT-03:2',
    'SAFE-01:3', 'NOSUB-01:1', 'FACT-01:3', 'NOSUB-01:2',
  ];
  const first = deriveRandomizedAttempts(RC2_RANDOMIZATION_SEED);
  const second = deriveRandomizedAttempts(RC2_RANDOMIZATION_SEED);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => `${item.scenario_id}:${item.repeat_index}`), expected);
  assert.equal(new Set(first.map((item) => item.attempt_id)).size, 12);
});

test('official dry run validates without an actual provider attempt', () => {
  const result = validateReferenceEvidence({ evidenceDir: baseEvidence });
  assert.equal(result.actual_attempt_count, 0);
  assert.deepEqual(result.attempts, [{ attempt_id: RC2_DRY_RUN_ID, terminal_status: 'completed', termination_reason: 'none' }]);
});

test('repeated dry-run projections are byte deterministic', () => {
  const first = runDryRun({ evidenceDir: baseEvidence, ephemeral: true });
  const second = runDryRun({ evidenceDir: baseEvidence, ephemeral: true });
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first).sort(), [
    'artifact_sha256', 'invocation_sha256', 'normalized_result_sha256', 'runner_manifest_sha256',
    'seed_inventory_sha256', 'validation_sha256', 'workspace_inventory_sha256',
  ]);
});

test('actual completed record validates as a registered run fact', () => {
  const root = cloneEvidence();
  const record = appendActual(root);
  assert.equal(record.manifest.terminal_status, 'completed');
  const result = validateReferenceEvidence({ evidenceDir: root });
  assert.equal(result.actual_attempt_count, 1);
  assert.equal(result.terminal_counts.completed, 2);
});

test('missing complete attempt set fails the complete-set gate', () => {
  assert.throws(() => validateReferenceEvidence({ evidenceDir: baseEvidence, requireCompleteSet: true }), { code: 'ATTEMPT_SET_INCOMPLETE' });
});

test('registration rejects unknown fields', () => {
  const root = cloneEvidence();
  const pathValue = join(root, 'registration.json');
  const registration = readJson(pathValue);
  registration.unknown = true;
  writeCanonical(pathValue, registration);
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'UNKNOWN_OR_MISSING_FIELD' });
});

test('registration refuses a linked evidence root without writing outside it', (t) => {
  const outside = join(suiteRoot, `registration-link-outside-${String(++cloneIndex).padStart(3, '0')}`);
  const linkedRoot = join(suiteRoot, `registration-link-root-${String(++cloneIndex).padStart(3, '0')}`);
  mkdirSync(outside);
  try {
    symlinkSync(outside, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`Link creation unavailable: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => createRegistration({
    allowTestRoot: true,
    evidenceDir: linkedRoot,
    registeredAt: '2026-08-24T12:00:00.000Z',
    runnerBinarySha256: 'a'.repeat(64),
    runnerVersion: '2.1.223',
  }), { code: 'PATH_LINK' });
  assert.deepEqual(readdirSync(outside), []);
});

test('registration overwrite refusal leaves neither sealed target partially created', () => {
  for (const preexistingLeaf of ['registration.json', 'source-snapshot.json']) {
    const root = join(suiteRoot, `registration-overwrite-${String(++cloneIndex).padStart(3, '0')}`);
    createPreRegistrationBase(root);
    writeFileSync(join(root, preexistingLeaf), '{}\n');
    assert.throws(() => createRegistration({
      allowTestRoot: true,
      evidenceDir: root,
      registeredAt: '2026-08-24T12:00:00.000Z',
      runnerBinarySha256: 'a'.repeat(64),
      runnerVersion: '2.1.223',
    }), { code: 'OVERWRITE_REFUSAL' });
    const otherLeaf = preexistingLeaf === 'registration.json' ? 'source-snapshot.json' : 'registration.json';
    assert.equal(existsSync(join(root, otherLeaf)), false);
    assert.equal(readFileSync(join(root, preexistingLeaf), 'utf8'), '{}\n');
  }
});

test('registration rejects unknown nested fields', () => {
  const root = cloneEvidence();
  const pathValue = join(root, 'registration.json');
  const registration = readJson(pathValue);
  registration.policies.unknown = true;
  writeCanonical(pathValue, registration);
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'UNKNOWN_OR_MISSING_FIELD' });
});

test('registration rejects unsupported versions', () => {
  const root = cloneEvidence();
  const pathValue = join(root, 'registration.json');
  const registration = readJson(pathValue);
  registration.schema_version = '2.0';
  writeCanonical(pathValue, registration);
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'REGISTRATION_VERSION' });
});

test('registration rejects an overlong runner version before creating any evidence files', () => {
  const root = join(suiteRoot, `registration-long-version-${String(++cloneIndex).padStart(3, '0')}`);
  assert.throws(() => createRegistration({
    allowTestRoot: true,
    evidenceDir: root,
    registeredAt: '2026-08-24T12:00:00.000Z',
    runnerBinarySha256: 'a'.repeat(64),
    runnerVersion: `2.1.223-${'a'.repeat(129)}`,
  }), { code: 'STRING_LENGTH' });
  assert.equal(existsSync(root), false);
});

test('registration cannot claim configured provider or model identity without an input source', () => {
  for (const kind of ['provider', 'model']) {
    const root = cloneEvidence();
    const pathValue = join(root, 'registration.json');
    const registration = readJson(pathValue);
    registration.route[kind] = kind === 'provider'
      ? { id: 'synthetic-provider', reporting_status: 'reported', version: '1' }
      : { id: 'synthetic-model', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'not_reported' };
    writeCanonical(pathValue, registration);
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'IDENTITY_INCONSISTENT' });
  }
});

test('registration and attempt records reject impossible UTC timestamps', () => {
  const registrationRoot = join(suiteRoot, `invalid-time-${String(++cloneIndex).padStart(3, '0')}`);
  assert.throws(() => createRegistration({
    allowTestRoot: true,
    evidenceDir: registrationRoot,
    registeredAt: '2026-99-99T99:99:99Z',
    runnerBinarySha256: 'a'.repeat(64),
    runnerVersion: '2.1.223',
  }), { code: 'UTC_TIMESTAMP' });

  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest, ledger) => {
    manifest.recorded_at = '2026-02-29T12:00:00.000Z';
    ledger.recorded_at = manifest.recorded_at;
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'UTC_TIMESTAMP' });
});

test('registration rejects the wrong route', () => {
  const root = cloneEvidence();
  const pathValue = join(root, 'registration.json');
  const registration = readJson(pathValue);
  registration.route.route_id = 'codex-cli';
  writeCanonical(pathValue, registration);
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'ROUTE_IDENTITY' });
});

test('source snapshot repository identity is independently fixed', () => {
  const committed = readJson(join(baseEvidence, 'source-snapshot.json'));
  assert.equal(committed.repository.url, 'https://github.com/OpenCnid/recursus-careers');
  assert.equal(committed.repository.revision, 'd2f2ad66133fa749e3b9b427b0de3dcad68d1295');
  const root = cloneEvidence();
  rewriteSourceSnapshot(root, (snapshot) => { snapshot.repository.url = 'https://example.test/other'; });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SOURCE_REPOSITORY' });
});

test('V4 registration and source identity versions reconcile', () => {
  const registration = readJson(join(baseEvidence, 'registration.json'));
  const snapshot = readJson(join(baseEvidence, 'source-snapshot.json'));
  assert.equal(registration.registration_id, 'RC2-CO-CLAUDE-CODE-2026-08-24-V4');
  assert.equal(registration.registration_version, '4');
  assert.deepEqual(registration.route.harness, { id: 'rc2-claude-code-reference-v4', version: '4.0.0' });
  assert.equal(snapshot.snapshot_id, 'RC2-SOURCE-SNAPSHOT-04');
  assert.equal(snapshot.registration_id, registration.registration_id);
});

test('source snapshot cannot omit a registered harness file under coordinated resealing', () => {
  const root = cloneEvidence();
  const sourceRef = rewriteSourceSnapshot(root, (snapshot) => {
    snapshot.harness_files.pop();
    snapshot.harness_bundle_sha256 = aggregateInventory(snapshot.harness_files);
  });
  rewriteManifestAndLedger(root, 0, (manifest) => { manifest.source_snapshot = sourceRef; });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SOURCE_INVENTORY' });
});

test('source snapshot binds the direct RC-1 benchmark dependency', () => {
  const snapshot = readJson(join(baseEvidence, 'source-snapshot.json'));
  assert.equal(snapshot.harness_files.some((entry) => entry.path === 'lib/recursus-benchmark.mjs'), true);

  const root = cloneEvidence();
  rewriteSourceSnapshot(root, (value) => {
    value.harness_files = value.harness_files.filter((entry) => entry.path !== 'lib/recursus-benchmark.mjs');
    value.harness_bundle_sha256 = aggregateInventory(value.harness_files);
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SOURCE_INVENTORY' });
});

test('cloned evidence README and schema bytes must match the source snapshot', () => {
  for (const relativePath of ['README.md', 'schemas/registration.schema.json']) {
    const root = cloneEvidence();
    const pathValue = join(root, ...relativePath.split('/'));
    writeFileSync(pathValue, Buffer.concat([readFileSync(pathValue), Buffer.from('\n', 'utf8')]));
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SOURCE_SNAPSHOT_DRIFT' });
  }
});

test('dry-run evidence is immutable', () => {
  const root = cloneEvidence();
  assert.throws(() => runDryRun({ evidenceDir: root }), { code: 'OVERWRITE_REFUSAL' });
});

test('attempt reservation is exclusive and append-only', () => {
  const root = cloneEvidence();
  reserveActualAttempt({ evidenceDir: root, recordedAt: '2026-08-24T12:02:00.000Z' });
  assert.throws(() => reserveActualAttempt({ evidenceDir: root, recordedAt: '2026-08-24T12:02:00.000Z' }), { code: 'OVERWRITE_REFUSAL' });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'DANGLING_ATTEMPT' });
});

test('closed evidence topology rejects unreferenced files and missing intent', () => {
  const extraRoot = cloneEvidence();
  writeFileSync(join(extraRoot, 'unregistered.json'), '{}\n');
  assert.throws(() => validateReferenceEvidence({ evidenceDir: extraRoot }), { code: 'EVIDENCE_TOPOLOGY' });

  const missingRoot = cloneEvidence();
  rmSync(join(missingRoot, 'evidence', 'attempts', RC2_DRY_RUN_ID, 'intent.json'));
  assert.throws(() => validateReferenceEvidence({ evidenceDir: missingRoot }), { code: 'MISSING_FILE' });
});

test('closed evidence topology rejects unreferenced empty directories', () => {
  for (const relativePath of ['junk', 'schemas/junk', `evidence/attempts/${RC2_DRY_RUN_ID}/junk`]) {
    const root = cloneEvidence();
    mkdirSync(join(root, ...relativePath.split('/')), { recursive: true });
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'EVIDENCE_TOPOLOGY' });
  }
});

test('evidence traversal bounds empty directory entries', () => {
  const root = cloneEvidence();
  for (let index = 0; index < 200; index++) mkdirSync(join(root, `empty-${String(index).padStart(3, '0')}`));
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'TREE_SIZE' });
});

test('wrong requested attempt order is rejected', () => {
  const root = cloneEvidence();
  const prepared = prepareWorkspace({ scenarioId: 'FACT-01' });
  try {
    assert.throws(() => recordActualOutcome({
      evidenceDir: root,
      expectedAttemptId: 'RC2-ATTEMPT-CO-CLAUDE-CODE-FACT-03-R01',
      outcome: completeOutcome(),
      prepared,
      recordedAt: '2026-08-24T12:03:00.000Z',
    }), { code: 'ATTEMPT_ORDER' });
  } finally {
    cleanupWorkspace(prepared);
  }
});

test('timeout is retained as incomplete and is not replaced', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.inputTokens = null;
  outcome.outputBytes = null;
  outcome.outputTokens = null;
  outcome.totalCostUsd = null;
  outcome.timedOut = true;
  outcome.trustedTerminalEvent = false;
  outcome.trustedTerminalSuccess = null;
  outcome.exitCode = null;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.terminal_status, 'incomplete');
  assert.equal(record.manifest.termination_reason, 'timeout');
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
});

test('malformed output is retained as incomplete', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.inputTokens = null;
  outcome.outputBytes = null;
  outcome.outputTokens = null;
  outcome.totalCostUsd = null;
  outcome.malformedEventCount = 1;
  outcome.trustedTerminalEvent = false;
  outcome.trustedTerminalSuccess = null;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.termination_reason, 'malformed_output');
  validateReferenceEvidence({ evidenceDir: root });
});

test('malformed terminal result envelopes cannot become trusted failures', () => {
  const malformedResults = [
    { type: 'result', result: 'synthetic output' },
    { type: 'result', subtype: 7, is_error: true, result: 'synthetic output' },
    { type: 'result', subtype: 'unknown_terminal_shape', is_error: true, result: 'synthetic output' },
    { type: 'result', subtype: 'success', is_error: 'false', result: 'synthetic output' },
  ];
  for (const terminal of malformedResults) {
    const parsed = parseClaudeStream(Buffer.from(`${JSON.stringify(terminal)}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
    assert.equal(parsed.trustedTerminalEvent, false);
    assert.equal(parsed.trustedTerminalSuccess, null);
    assert.equal(parsed.malformedEventCount, 1);
    const root = cloneEvidence();
    const record = appendActual(root, parsed);
    assert.equal(record.manifest.terminal_status, 'incomplete');
    assert.equal(record.manifest.termination_reason, 'malformed_output');
    validateReferenceEvidence({ evidenceDir: root });
  }
});

test('tool-call budget excess is observed and retained as incomplete', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.toolBudgetExceeded = true;
  outcome.toolCallCount = 13;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.termination_reason, 'tool_budget_exceeded');
  validateReferenceEvidence({ evidenceDir: root });
});

test('authentication unavailability is retained as blocked', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.authenticationUnavailable = true;
  outcome.inputTokens = null;
  outcome.outputBytes = null;
  outcome.outputTokens = null;
  outcome.providerRequest = 'not_observed';
  outcome.trustedTerminalEvent = false;
  outcome.trustedTerminalSuccess = null;
  outcome.totalCostUsd = null;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.terminal_status, 'blocked');
  assert.equal(record.manifest.termination_reason, 'authentication_unavailable');
  validateReferenceEvidence({ evidenceDir: root });
});

test('unsupported route capability is retained honestly', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.routeUnsupported = true;
  outcome.inputTokens = null;
  outcome.outputBytes = null;
  outcome.outputTokens = null;
  outcome.providerRequest = 'not_observed';
  outcome.trustedTerminalEvent = false;
  outcome.trustedTerminalSuccess = null;
  outcome.totalCostUsd = null;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.terminal_status, 'unsupported');
  validateReferenceEvidence({ evidenceDir: root });
});

test('process failure is distinct from verified completion', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.exitCode = 1;
  outcome.outputBytes = null;
  outcome.trustedTerminalSuccess = false;
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.terminal_status, 'failed');
  validateReferenceEvidence({ evidenceDir: root });
});

test('exit zero without a trusted terminal event cannot complete', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.inputTokens = null;
  outcome.outputBytes = null;
  outcome.outputTokens = null;
  outcome.trustedTerminalEvent = false;
  outcome.trustedTerminalSuccess = null;
  outcome.totalCostUsd = null;
  const record = appendActual(root, outcome);
  assert.notEqual(record.manifest.terminal_status, 'completed');
  validateReferenceEvidence({ evidenceDir: root });
});

test('false terminal attestation is rejected independently', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.observations.exit_code = 1;
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });
});

test('declared failure reason cannot substitute for an observed condition', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest, ledger) => {
    manifest.terminal_status = 'blocked';
    manifest.termination_reason = 'authentication_unavailable';
    ledger.terminal_status = 'blocked';
    ledger.termination_reason = 'authentication_unavailable';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });
});

test('observation types fail closed', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.observations.tool_budget_exceeded = 'false';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'BOOLEAN_REQUIRED' });
});

test('dry run cannot claim runner attestation', () => {
  const root = cloneEvidence();
  rewriteManifestAndLedger(root, 0, (manifest) => {
    manifest.execution_attestation = 'runner_attested';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'DRY_RUN_ATTESTATION' });
});

test('coordinated false trace attestation is rejected after reference resealing', () => {
  const root = cloneEvidence();
  rewriteTraceAndLedger(root, 0, (traceValue) => {
    traceValue.events[0] = { code: 'FALSE_RUNNER_STARTED', event: 'external_runner_started', sequence: 1, value: true };
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });

  const identityRoot = cloneEvidence();
  rewriteTraceAndLedger(identityRoot, 0, (traceValue) => {
    traceValue.trace_id = 'TRACE-ARBITRARY';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: identityRoot }), { code: 'TRACE_MISMATCH' });
});

test('coordinated arbitrary invocation identity is rejected after reference resealing', () => {
  const root = cloneEvidence();
  rewriteInvocationAndLedger(root, 0, (invocation) => {
    invocation.invocation_id = 'INVOCATION-ARBITRARY';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'INVOCATION_MISMATCH' });
});

test('stale generated artifact bytes are rejected', () => {
  const root = cloneEvidence();
  const record = appendActual(root);
  const artifact = record.manifest.artifact_inventory[0];
  writeFileSync(join(root, ...artifact.path.split('/')), '# replaced\n');
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'STALE_HASH' });
});

test('artifact topology rejects a second relabeled repository file', () => {
  const root = cloneEvidence();
  const record = appendActual(root);
  const secondPath = 'registration.json';
  const secondBytes = readFileSync(join(root, secondPath));
  const second = { artifact_id: `ARTIFACT-${record.attemptId}-02`, byte_count: secondBytes.length, media_type: 'text/markdown', path: secondPath, sha256: sha256(secondBytes) };
  const normalizedPath = join(root, ...record.manifest.normalized_result.path.split('/'));
  const normalized = readJson(normalizedPath);
  normalized.artifact_inventory.push(second);
  const normalizedBytes = canonicalBytes(normalized);
  writeFileSync(normalizedPath, normalizedBytes);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.artifact_inventory.push(second);
    manifest.normalized_result = reference(manifest.normalized_result.path, normalizedBytes);
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'ARTIFACT_TOPOLOGY' });
});

test('seed inventory must reconcile to accepted RC-1 mounts and bytes', () => {
  const root = cloneEvidence();
  const manifestPath = join(root, 'evidence', 'attempts', RC2_DRY_RUN_ID, 'runner-manifest.json');
  const manifest = readJson(manifestPath);
  const seedPath = join(root, ...manifest.seed_inventory.path.split('/'));
  const seed = readJson(seedPath);
  seed.files = [];
  const seedBytes = canonicalBytes(seed);
  writeFileSync(seedPath, seedBytes);
  rewriteManifestAndLedger(root, 0, (value) => { value.seed_inventory = reference(value.seed_inventory.path, seedBytes); });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SEED_INVENTORY' });
});

test('workspace inventory must reconcile to the exact registered seed and system inputs', () => {
  const root = cloneEvidence();
  const manifestPath = join(root, 'evidence', 'attempts', RC2_DRY_RUN_ID, 'runner-manifest.json');
  const manifest = readJson(manifestPath);
  const workspacePath = join(root, ...manifest.workspace_inventory.path.split('/'));
  const workspace = readJson(workspacePath);
  workspace.pre_files = [];
  workspace.post_files = [];
  const workspaceBytes = canonicalBytes(workspace);
  writeFileSync(workspacePath, workspaceBytes);
  rewriteManifestAndLedger(root, 0, (value) => { value.workspace_inventory = reference(value.workspace_inventory.path, workspaceBytes); });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'WORKSPACE_ATTESTATION' });
});

test('manifest source snapshot must exactly match registration', () => {
  const root = cloneEvidence();
  rewriteManifestAndLedger(root, 0, (manifest) => { manifest.source_snapshot.sha256 = '0'.repeat(64); });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'SOURCE_SNAPSHOT_MISMATCH' });
});

test('manifest environment must exactly match the preregistered environment', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.environment.timezone = `${manifest.environment.timezone}-drift`;
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'ENVIRONMENT_DRIFT' });
});

test('manifest and scenario mismatch is rejected', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.scenario_id = 'FACT-03';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }));
});

test('manifest and normalized result mismatch is rejected', () => {
  const root = cloneEvidence();
  const record = appendActual(root);
  const normalizedPath = join(root, ...record.manifest.normalized_result.path.split('/'));
  const normalized = readJson(normalizedPath);
  normalized.randomized_order = 2;
  writeCanonical(normalizedPath, normalized);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    const bytes = readFileSync(normalizedPath);
    manifest.normalized_result = reference(manifest.normalized_result.path, bytes);
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'RESULT_MISMATCH' });
});

test('normalized result version, origin, identifier, trace, and errors reconcile exactly', () => {
  for (const mutate of [
    (normalized) => { normalized.schema_version = '9.0'; normalized.attempt_kind = 'actual'; normalized.output_origin = 'claude_code_stream_result'; normalized.result_id = 'ARBITRARY'; },
    (normalized, manifest) => { normalized.trace = manifest.seed_inventory; },
    (normalized) => { normalized.errors = [{ code: 'ARBITRARY', message: 'Synthetic mismatch.' }]; },
  ]) {
    const root = cloneEvidence();
    const manifestPath = join(root, 'evidence', 'attempts', RC2_DRY_RUN_ID, 'runner-manifest.json');
    const manifest = readJson(manifestPath);
    const normalizedPath = join(root, ...manifest.normalized_result.path.split('/'));
    const normalized = readJson(normalizedPath);
    mutate(normalized, manifest);
    const normalizedBytes = canonicalBytes(normalized);
    writeFileSync(normalizedPath, normalizedBytes);
    rewriteManifestAndLedger(root, 0, (value) => { value.normalized_result = reference(value.normalized_result.path, normalizedBytes); });
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'RESULT_MISMATCH' });
  }
});

test('ledger filename, entry identifier, and timestamp reconcile exactly', () => {
  const renamedRoot = cloneEvidence();
  const ledgerRoot = join(renamedRoot, 'evidence', 'ledger');
  const original = readdirSync(ledgerRoot)[0];
  renameSync(join(ledgerRoot, original), join(ledgerRoot, '9999-arbitrary.json'));
  assert.throws(() => validateReferenceEvidence({ evidenceDir: renamedRoot }), { code: 'LEDGER_IDENTITY' });

  const timestampRoot = cloneEvidence();
  const ledgerPath = join(timestampRoot, 'evidence', 'ledger', readdirSync(join(timestampRoot, 'evidence', 'ledger'))[0]);
  const ledger = readJson(ledgerPath);
  ledger.recorded_at = '2026-08-24T23:59:59.000Z';
  writeCanonical(ledgerPath, ledger);
  assert.throws(() => validateReferenceEvidence({ evidenceDir: timestampRoot }), { code: 'LEDGER_MANIFEST_MISMATCH' });
});

test('missing reported identity fields fail closed', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    delete manifest.reported_model.snapshot;
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'UNKNOWN_OR_MISSING_FIELD' });
});

test('reported identity cannot be inferred from the runner name', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.reported_provider = { id: 'not_reported', reporting_status: 'reported', version: 'not_reported' };
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'IDENTITY_INCONSISTENT' });
});

test('dry-run identity, observations, and usage cannot be falsely resealed', () => {
  const mutations = [
    (manifest) => { manifest.reported_model = { id: 'synthetic-model', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'not_reported' }; },
    (manifest) => { manifest.reported_provider = { id: 'synthetic-provider', reporting_status: 'reported', version: '1' }; },
    (manifest) => { manifest.usage.input_tokens = 1; },
    (manifest) => { manifest.observations.exit_code = 0; },
  ];
  for (const mutate of mutations) {
    const root = cloneEvidence();
    rewriteManifestAndLedger(root, 0, mutate);
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: /^(?:DRY_RUN_ATTESTATION|FALSE_ATTESTATION)$/u });
  }
});

test('provider identity and request facts are bound to V4 parser capabilities', () => {
  const providerRoot = cloneEvidence();
  appendActual(providerRoot);
  rewriteManifestAndLedger(providerRoot, 1, (manifest) => {
    manifest.reported_provider = { id: 'synthetic-provider', reporting_status: 'reported', version: '1' };
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: providerRoot }), { code: 'FALSE_ATTESTATION' });

  const requestRoot = cloneEvidence();
  appendActual(requestRoot);
  rewriteManifestAndLedger(requestRoot, 1, (manifest) => { manifest.observations.provider_request = 'reported'; });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: requestRoot }), { code: 'FALSE_ATTESTATION' });
});

test('a nonstarted actual runner cannot report model identity or provider-derived usage', () => {
  const makeBlocked = () => ({
    ...completeOutcome(),
    environmentUnavailable: true,
    exitCode: null,
    externalRunnerStarted: false,
    inputTokens: null,
    outputBytes: null,
    outputTokens: null,
    providerRequest: 'not_made',
    totalCostUsd: null,
    trustedTerminalEvent: false,
    trustedTerminalSuccess: null,
  });
  for (const mutate of [
    (manifest) => { manifest.reported_model = { id: 'synthetic-model', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'not_reported' }; },
    (manifest) => { manifest.usage.cache_read_input_tokens = 1; },
  ]) {
    const root = cloneEvidence();
    appendActual(root, makeBlocked());
    assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
    rewriteManifestAndLedger(root, 1, mutate);
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });
  }
});

test('a nonstarted actual runner cannot be resealed with a fabricated terminal condition', () => {
  const root = cloneEvidence();
  const outcome = {
    ...completeOutcome(),
    environmentUnavailable: true,
    exitCode: null,
    externalRunnerStarted: false,
    inputTokens: null,
    outputBytes: null,
    outputTokens: null,
    providerRequest: 'not_made',
    totalCostUsd: null,
    trustedTerminalEvent: false,
    trustedTerminalSuccess: null,
  };
  appendActual(root, outcome);
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).terminal_counts.blocked, 1);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.observations.environment_unavailable = false;
    manifest.observations.route_unsupported = true;
    manifest.terminal_status = 'unsupported';
    manifest.termination_reason = 'route_unsupported';
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });
});

test('started actual observations must remain coherent with parser and process-close facts', () => {
  const mutations = [
    (manifest) => {
      manifest.observations.environment_unavailable = true;
      manifest.terminal_status = 'blocked';
      manifest.termination_reason = 'environment_unavailable';
    },
    (manifest) => {
      manifest.observations.trusted_terminal_event = false;
      manifest.terminal_status = 'incomplete';
      manifest.termination_reason = 'malformed_output';
    },
    (manifest) => {
      manifest.observations.sensitive_capture_blocked = true;
      manifest.terminal_status = 'incomplete';
      manifest.termination_reason = 'sensitive_capture_blocked';
    },
    (manifest) => {
      manifest.observations.process_signal = 'SIGTERM';
      manifest.terminal_status = 'incomplete';
      manifest.termination_reason = 'malformed_output';
    },
  ];
  for (const mutate of mutations) {
    const root = cloneEvidence();
    appendActual(root);
    rewriteManifestAndLedger(root, 1, mutate);
    assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'FALSE_ATTESTATION' });
  }
});

test('oracle identifiers, digests, canaries, paths, and bytes are denied', () => {
  const { context } = validateCorpus();
  const signature = context.leakSignatures[0];
  for (const token of signature.tokens) {
    assert.throws(() => assertContentSafe(Buffer.from(token, 'utf8'), context.leakSignatures, 'test content'), { code: 'ORACLE_LEAKAGE' });
  }
  assert.throws(() => assertContentSafe(signature.fullBytes, context.leakSignatures, 'test content'), { code: 'ORACLE_LEAKAGE' });
});

test('percent-encoded evaluator-only paths are denied without exposing the token', () => {
  const { context } = validateCorpus();
  const token = context.leakSignatures.flatMap((signature) => signature.tokens).find((value) => /[\\/]/u.test(value));
  assert.ok(token);
  const encoded = token.replaceAll('\\', '%5C').replaceAll('/', '%2F');
  assert.notEqual(encoded, token);
  assert.throws(() => assertContentSafe(Buffer.from(encoded), context.leakSignatures, 'encoded oracle probe'), { code: 'ORACLE_LEAKAGE' });
  assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ value: encoded })), context.leakSignatures, 'serialized encoded oracle probe'), { code: 'ORACLE_LEAKAGE' });
});

test('Windows-form oracle paths are denied raw, serialized, and before runner-derived persistence', () => {
  const { context } = validateCorpus();
  const token = context.leakSignatures[0].tokens.find((value) => value.includes('\\'));
  assert.ok(token);
  assert.throws(() => assertContentSafe(Buffer.from(token), context.leakSignatures, 'raw Windows oracle path'), { code: 'ORACLE_LEAKAGE' });
  assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ model: token })), context.leakSignatures, 'serialized Windows oracle path'), { code: 'ORACLE_LEAKAGE' });

  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.reportedModel = { id: token, reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.termination_reason, 'sensitive_capture_blocked');
  const published = allFileText(root);
  assert.equal(published.includes(token), false);
  assert.equal(published.includes(JSON.stringify(token).slice(1, -1)), false);
  validateReferenceEvidence({ evidenceDir: root });
});

test('credential-shaped output is withheld by the content-safe boundary', () => {
  const { context } = validateCorpus();
  for (const text of [
    'Authorization: Bearer abcdefghijklmnop',
    'API_KEY=abcdefghijklmnop',
    'refreshToken: deadbeefdeadbeef',
    'oauth_token = deadbeefdeadbeef',
    'session-token: deadbeefdeadbeef',
    'private_key: deadbeefdeadbeef',
    'secret-key: deadbeefdeadbeef',
    '"refreshToken": deadbeefdeadbeef',
    "'oauth_token': deadbeefdeadbeef",
    '`session-token`: deadbeefdeadbeef',
    'AWS_SECRET_ACCESS_KEY=deadbeefdeadbeef',
    'AWS_SESSION_TOKEN=deadbeefdeadbeef',
    '-----BEGIN PRIVATE KEY-----',
    'https://user:password@example.test/path',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl',
  ]) assert.throws(() => assertContentSafe(Buffer.from(text), context.leakSignatures, 'test content'), { code: 'CREDENTIAL_LEAKAGE' });
});

test('standalone JWT-shaped artifacts and runner scalars are withheld before persistence', () => {
  const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl';
  const { context } = validateCorpus();
  assert.throws(() => assertContentSafe(Buffer.from(token), context.leakSignatures, 'raw JWT probe'), { code: 'CREDENTIAL_LEAKAGE' });
  assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ value: token })), context.leakSignatures, 'canonical JWT probe'), { code: 'CREDENTIAL_LEAKAGE' });

  const artifactRoot = cloneEvidence();
  const artifactRecord = appendActual(artifactRoot, completeOutcome(`# Synthetic output\n\n${token}\n`));
  assert.equal(artifactRecord.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(artifactRoot).includes(token), false);
  validateReferenceEvidence({ evidenceDir: artifactRoot });

  const scalarRoot = cloneEvidence();
  const scalarOutcome = completeOutcome();
  scalarOutcome.reportedModel = { id: token, reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  const scalarRecord = appendActual(scalarRoot, scalarOutcome);
  assert.equal(scalarRecord.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(scalarRoot).includes(token), false);
  validateReferenceEvidence({ evidenceDir: scalarRoot });
});

test('credential-bearing JSON keys are rejected without treating generic secret prose as a credential', () => {
  const { context } = validateCorpus();
  for (const key of ['apiKey', 'access_token', 'auth-token', 'oauthToken', 'refreshToken', 'session_token', 'clientSecret', 'password', 'private_key', 'secret-key', 'secret_access_key', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) {
    const raw = `{ "${key}" : "deadbeefdeadbeef" }`;
    const canonical = canonicalStringify({ [key]: 'deadbeefdeadbeef' });
    assert.throws(() => assertContentSafe(Buffer.from(raw), context.leakSignatures, 'raw credential JSON'), { code: 'CREDENTIAL_LEAKAGE' });
    assert.throws(() => assertContentSafe(Buffer.from(canonical), context.leakSignatures, 'canonical credential JSON'), { code: 'CREDENTIAL_LEAKAGE' });
  }
  for (const key of ['anthropicApiKey', 'my_refresh_token', 'sshPrivateKey']) {
    assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ [key]: 'deadbeefdeadbeef' })), context.leakSignatures, 'prefixed credential JSON'), { code: 'CREDENTIAL_LEAKAGE' });
    assert.throws(() => assertContentSafe(Buffer.from(`'${key}': deadbeefdeadbeef`), context.leakSignatures, 'prefixed credential YAML'), { code: 'CREDENTIAL_LEAKAGE' });
  }
  const longPrefixedKey = `${'a'.repeat(65)}ApiKey`;
  assert.throws(() => assertContentSafe(Buffer.from(`${longPrefixedKey}: deadbeefdeadbeef`), context.leakSignatures, 'long prefixed credential assignment'), { code: 'CREDENTIAL_LEAKAGE' });
  assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ [longPrefixedKey]: 'deadbeefdeadbeef' })), context.leakSignatures, 'long prefixed credential JSON'), { code: 'CREDENTIAL_LEAKAGE' });
  assert.doesNotThrow(() => assertContentSafe(Buffer.from('A fictional secret garden appears in this synthetic prose.'), context.leakSignatures, 'generic prose'));
  assert.doesNotThrow(() => assertContentSafe(Buffer.from(canonicalStringify({ apiKeyDescription: 'fictional metadata only', keyboardLayout: 'synthetic', secretGarden: 'fictional prose' })), context.leakSignatures, 'noncredential JSON metadata'));
});

test('credential-bearing JSON artifacts and runner scalars are withheld before persistence', () => {
  const artifactRoot = cloneEvidence();
  const artifactOutcome = completeOutcome('{"refreshToken":"deadbeefdeadbeef"}\n');
  const artifactRecord = appendActual(artifactRoot, artifactOutcome);
  assert.equal(artifactRecord.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(artifactRoot).includes('deadbeefdeadbeef'), false);
  validateReferenceEvidence({ evidenceDir: artifactRoot });

  const scalarRoot = cloneEvidence();
  const scalarOutcome = completeOutcome();
  scalarOutcome.errorCode = 'RUNNER_MESSAGE';
  scalarOutcome.errorMessage = canonicalStringify({ oauthToken: 'deadbeefdeadbeef' });
  const scalarRecord = appendActual(scalarRoot, scalarOutcome);
  assert.equal(scalarRecord.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(scalarRoot).includes('deadbeefdeadbeef'), false);
  validateReferenceEvidence({ evidenceDir: scalarRoot });

  const markdownRoot = cloneEvidence();
  const markdownOutcome = completeOutcome('# Synthetic output\n\nrefreshToken: deadbeefdeadbeef\n');
  const markdownRecord = appendActual(markdownRoot, markdownOutcome);
  assert.equal(markdownRecord.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(markdownRoot).includes('deadbeefdeadbeef'), false);
  validateReferenceEvidence({ evidenceDir: markdownRoot });
});

test('over-budget output is artifact validation failure, not sensitive-content evidence', () => {
  const root = cloneEvidence();
  const record = appendActual(root, completeOutcome('x'.repeat(262_145)));
  assert.equal(record.manifest.observations.sensitive_capture_blocked, false);
  assert.equal(record.manifest.terminal_status, 'incomplete');
  assert.equal(record.manifest.termination_reason, 'malformed_output');
  assert.deepEqual(record.manifest.artifact_inventory, []);
  assert.deepEqual(record.manifest.errors, [{ code: 'OUTPUT_BUDGET', message: 'Generated output was withheld because local artifact validation rejected it.' }]);
  validateReferenceEvidence({ evidenceDir: root });
});

test('over-nested encoded private scalar is withheld and retained append-only', () => {
  let encodedPath = '///root/.secret';
  for (let depth = 0; depth < 9; depth++) encodedPath = encodedPath.replaceAll('%', '%25').replaceAll('/', '%2F');
  const token = `file:${encodedPath}`;
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.reportedModel = { id: token, reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'not_reported' };
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.terminal_status, 'incomplete');
  assert.equal(record.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(record.manifest.errors[0].code, 'CONTENT_ENCODING');
  assert.equal(allFileText(root).includes(token), false);
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
});

test('credential-shaped content anywhere in publishable evidence is rejected', () => {
  const root = cloneEvidence();
  appendActual(root);
  rewriteManifestAndLedger(root, 1, (manifest) => {
    manifest.reported_model = { id: 'API_KEY=abcdefghijklmnop', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: root }), { code: 'CREDENTIAL_LEAKAGE' });
});

test('runner-derived credential-shaped identity is withheld before evidence persistence', () => {
  const root = cloneEvidence();
  const outcome = completeOutcome();
  outcome.reportedModel = { id: 'API_KEY=abcdefghijklmnop', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  const record = appendActual(root, outcome);
  assert.equal(record.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(root).includes('API_KEY=abcdefghijklmnop'), false);
  validateReferenceEvidence({ evidenceDir: root });
});

test('registration rejects credential and private-path runner versions before evidence persistence', () => {
  for (const runnerVersion of ['API_KEY=abcdefghijklmnop', 'C:\\Users\\Person\\secret.txt']) {
    const root = join(suiteRoot, `registration-input-${String(++cloneIndex).padStart(3, '0')}`);
    assert.throws(() => createRegistration({
      allowTestRoot: true,
      evidenceDir: root,
      registeredAt: '2026-08-24T12:00:00.000Z',
      runnerBinarySha256: 'a'.repeat(64),
      runnerVersion,
    }), { code: 'STRING_FORMAT' });
    assert.equal(existsSync(root), false);
  }
});

test('absolute Windows and POSIX host paths are denied', () => {
  const { context } = validateCorpus();
  for (const text of ['C:\\Users\\Person\\secret.txt', 'C:/Users/Person/secret.txt', 'C:\\Documents and Settings\\Alice\\secret.txt', 'D:\\OpenCnid\\recursus-careers\\private.txt', 'Q:/SyntheticHost/private.txt', '\\\\server\\share\\secret.txt', '/home/person/secret.txt', '/Users/person/secret.txt', '/root/.claude/credentials.json', '/tmp/private-token', '/var/tmp/private-token', '/private/var/folders/aa/token', '/opt/synthetic-host/private.txt']) {
    assert.throws(() => assertContentSafe(Buffer.from(text), context.leakSignatures, 'test content'), { code: 'PRIVATE_PATH_LEAKAGE' });
    assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ value: text })), context.leakSignatures, 'serialized test content'), { code: 'PRIVATE_PATH_LEAKAGE' });
  }
  assert.doesNotThrow(() => assertContentSafe(Buffer.from('https://career-ops.test/root/reference'), context.leakSignatures, 'reserved URL'));
  assert.doesNotThrow(() => assertContentSafe(Buffer.from('Use /career-ops only for this synthetic route.'), context.leakSignatures, 'route prose'));
});

test('private file URI roots are denied without treating HTTP URL paths as host paths', () => {
  const { context } = validateCorpus();
  for (const text of [
    'file:///home/alice/.claude/settings.json',
    'file:///root/.claude/credentials.json',
    'file:///tmp/private-123/token',
    'file:///var/tmp/private-123/token',
    'file:///private/var/folders/aa/token',
    'file:///C:/Users/Alice/.claude/settings.json',
    'file:///C:/Documents%20and%20Settings/Alice/settings.json',
    'file:///C:%5CUsers%5CPrivateProbe%5Csecret.txt',
    'file:///home%2Falice%2F.secret',
    'file:%2F%2F%2Froot%2F.secret',
  ]) {
    assert.throws(() => assertContentSafe(Buffer.from(text), context.leakSignatures, 'private file URI'), { code: 'PRIVATE_PATH_LEAKAGE' });
    assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ value: text })), context.leakSignatures, 'serialized private file URI'), { code: 'PRIVATE_PATH_LEAKAGE' });
  }
  assert.doesNotThrow(() => assertContentSafe(Buffer.from('https://career-ops.test/root/reference'), context.leakSignatures, 'reserved HTTPS URL'));
});

test('forward-slash UNC paths are denied without treating HTTPS as a host path', () => {
  const { context } = validateCorpus();
  for (const text of ['//server/share/private.txt', 'value=//server/share/private.txt']) {
    assert.throws(() => assertContentSafe(Buffer.from(text), context.leakSignatures, 'forward UNC path'), { code: 'PRIVATE_PATH_LEAKAGE' });
    assert.throws(() => assertContentSafe(Buffer.from(canonicalStringify({ value: text })), context.leakSignatures, 'serialized forward UNC path'), { code: 'PRIVATE_PATH_LEAKAGE' });
  }
  assert.doesNotThrow(() => assertContentSafe(Buffer.from('https://server.test/share/private.txt'), context.leakSignatures, 'HTTPS URL'));
});

test('serialized absolute host-path evidence is rejected and runner-derived path identity is withheld', () => {
  const tamperedRoot = cloneEvidence();
  appendActual(tamperedRoot);
  rewriteManifestAndLedger(tamperedRoot, 1, (manifest) => {
    manifest.reported_model = { id: 'D:\\OpenCnid\\recursus-careers\\private.txt', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  });
  assert.throws(() => validateReferenceEvidence({ evidenceDir: tamperedRoot }), { code: 'PRIVATE_PATH_LEAKAGE' });

  const captureRoot = cloneEvidence();
  const outcome = completeOutcome();
  outcome.reportedModel = { id: 'Q:/SyntheticHost/private.txt', reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'synthetic' };
  const record = appendActual(captureRoot, outcome);
  assert.equal(record.manifest.termination_reason, 'sensitive_capture_blocked');
  assert.equal(allFileText(captureRoot).includes('Q:/SyntheticHost/private.txt'), false);
  validateReferenceEvidence({ evidenceDir: captureRoot });
});

test('portable path validation rejects escapes and Windows special forms', () => {
  for (const pathValue of ['../escape', 'C:/escape', 'C:\\escape', '\\\\server\\share', 'file:stream', '/absolute']) {
    assert.throws(() => validatePortableRelativePath(pathValue));
  }
  assert.equal(validatePortableRelativePath('evidence/attempts/a.json'), 'evidence/attempts/a.json');
});

test('unexpected workspace mutation produces a noncompleted retained record', () => {
  const root = cloneEvidence();
  const plan = deriveRandomizedAttempts()[0];
  const prepared = prepareWorkspace({ scenarioId: plan.scenario_id });
  const recordedAt = '2026-08-24T12:04:00.000Z';
  try {
    writeFileSync(join(prepared.workspace, 'unexpected.txt'), 'synthetic mutation\n');
    reserveActualAttempt({ evidenceDir: root, recordedAt });
    const record = recordActualOutcome({
      evidenceDir: root,
      expectedAttemptId: plan.attempt_id,
      outcome: completeOutcome(),
      preReserved: true,
      prepared,
      recordedAt,
    });
    assert.equal(record.manifest.terminal_status, 'incomplete');
    assert.equal(record.manifest.termination_reason, 'unexpected_external_mutation');
    validateReferenceEvidence({ evidenceDir: root });
  } finally {
    cleanupWorkspace(prepared);
  }
});

test('unexpected empty workspace directory is captured as external mutation', () => {
  const root = cloneEvidence();
  const plan = deriveRandomizedAttempts()[0];
  const prepared = prepareWorkspace({ scenarioId: plan.scenario_id });
  const recordedAt = '2026-08-24T12:04:00.000Z';
  try {
    mkdirSync(join(prepared.workspace, 'unexpected-empty'));
    reserveActualAttempt({ evidenceDir: root, recordedAt });
    const record = recordActualOutcome({
      evidenceDir: root,
      expectedAttemptId: plan.attempt_id,
      outcome: completeOutcome(),
      preReserved: true,
      prepared,
      recordedAt,
    });
    assert.equal(record.manifest.termination_reason, 'unexpected_external_mutation');
    validateReferenceEvidence({ evidenceDir: root });
  } finally {
    cleanupWorkspace(prepared);
  }
});

test('post-run content scan failure remains append-only and independently valid', () => {
  const root = cloneEvidence();
  const plan = deriveRandomizedAttempts()[0];
  const prepared = prepareWorkspace({ scenarioId: plan.scenario_id });
  const recordedAt = '2026-08-24T12:04:00.000Z';
  const token = 'deadbeefdeadbeef';
  try {
    writeFileSync(join(prepared.workspace, 'unexpected-private.txt'), `API_KEY=${token}\n`);
    reserveActualAttempt({ evidenceDir: root, recordedAt });
    const record = recordActualOutcome({
      evidenceDir: root,
      expectedAttemptId: plan.attempt_id,
      outcome: completeOutcome(),
      preReserved: true,
      prepared,
      recordedAt,
    });
    assert.equal(record.manifest.termination_reason, 'unexpected_external_mutation');
    assert.equal(allFileText(root).includes(token), false);
    assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
  } finally {
    cleanupWorkspace(prepared);
  }
});

test('fresh workspaces have identical inventories and distinct roots', () => {
  const first = prepareWorkspace({ scenarioId: 'FACT-01' });
  const second = prepareWorkspace({ scenarioId: 'FACT-01' });
  try {
    assert.notEqual(first.workspace, second.workspace);
    assert.deepEqual(first.seedInventory, second.seedInventory);
    assert.deepEqual(first.preFiles, second.preFiles);
    assert.deepEqual(first.preDirectories, second.preDirectories);
  } finally {
    cleanupWorkspace(first);
    cleanupWorkspace(second);
  }
});

test('stream parser does not promote model prose or process exit alone', () => {
  const fake = Buffer.from(`${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'I completed the task and use model fake.' }] } })}\n`);
  const parsed = parseClaudeStream(fake, Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true });
  assert.equal(parsed.trustedTerminalEvent, false);
  assert.equal(parsed.trustedTerminalSuccess, null);
  assert.equal(parsed.outputBytes, null);
  assert.equal(parsed.reportedProvider.reporting_status, 'not_reported');
});

test('stream parser extracts only the trusted terminal result envelope', () => {
  const stream = [
    { type: 'system', subtype: 'init', model: 'claude-test-snapshot' },
    { type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } },
    { type: 'result', subtype: 'success', is_error: false, result: '# Safe result\n', usage: { cache_creation_input_tokens: 5, cache_read_input_tokens: 7, input_tokens: 3, output_tokens: 2 }, total_cost_usd: 0.001 },
  ].map(JSON.stringify).join('\n');
  const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true });
  assert.equal(parsed.trustedTerminalEvent, true);
  assert.equal(parsed.trustedTerminalSuccess, true);
  assert.equal(parsed.outputBytes.toString('utf8'), '# Safe result\n');
  assert.equal(parsed.reportedModel.id, 'claude-test-snapshot');
  assert.equal(parsed.reportedModel.snapshot, 'not_reported');
  assert.equal(parsed.reportedProvider.reporting_status, 'not_reported');
  assert.equal(parsed.cacheCreationInputTokens, 5);
  assert.equal(parsed.cacheReadInputTokens, 7);
});

test('successful generated prose cannot fabricate a startup failure classification', () => {
  const stream = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Authentication required, permission denied, and unknown option are phrases in this synthetic draft.\n',
  });
  const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(parsed.authenticationUnavailable, false);
  assert.equal(parsed.permissionDenied, false);
  assert.equal(parsed.routeUnsupported, false);
  const root = cloneEvidence();
  const record = appendActual(root, parsed);
  assert.equal(record.manifest.terminal_status, 'completed');
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
});

test('empty and whitespace-only terminal results cannot satisfy completion', () => {
  for (const result of ['', ' \r\n\t']) {
    const stream = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result });
    const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
    assert.equal(parsed.outputBytes, null);
    assert.equal(parsed.errorCode, 'EMPTY_RESULT');
    const root = cloneEvidence();
    const record = appendActual(root, parsed);
    assert.equal(record.manifest.terminal_status, 'incomplete');
    assert.equal(record.manifest.termination_reason, 'malformed_output');
    assert.deepEqual(record.manifest.artifact_inventory, []);
    validateReferenceEvidence({ evidenceDir: root });
  }
});

test('stream parser records unavailable cache usage as null without inference', () => {
  const stream = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '# Safe result\n', usage: { input_tokens: 3, output_tokens: 2 } });
  const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(parsed.cacheCreationInputTokens, null);
  assert.equal(parsed.cacheReadInputTokens, null);
});

test('stream parser fails closed on conflicting or reserved reported model identity', () => {
  const result = { type: 'result', subtype: 'success', is_error: false, result: '# Safe result\n' };
  const conflicting = [
    { type: 'system', subtype: 'init', model: 'claude-model-a' },
    { type: 'assistant', message: { model: 'claude-model-b', content: [] } },
    result,
  ].map(JSON.stringify).join('\n');
  const conflict = parseClaudeStream(Buffer.from(`${conflicting}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(conflict.malformedEventCount, 1);
  assert.equal(conflict.errorCode, 'MODEL_IDENTITY_INVALID');
  assert.equal(conflict.reportedModel.reporting_status, 'not_reported');

  const sentinel = [
    { type: 'system', subtype: 'init', model: 'not_reported' },
    result,
  ].map(JSON.stringify).join('\n');
  const reserved = parseClaudeStream(Buffer.from(`${sentinel}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(reserved.malformedEventCount, 1);
  assert.equal(reserved.reportedModel.reporting_status, 'not_reported');
});

test('overlong runner model identity is retained as bounded independently valid incomplete evidence', () => {
  const stream = [
    { type: 'system', subtype: 'init', model: 'm'.repeat(129) },
    { type: 'result', subtype: 'success', is_error: false, result: '# Safe result\n' },
  ].map(JSON.stringify).join('\n');
  const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(parsed.reportedModel.reporting_status, 'not_reported');
  assert.equal(parsed.errorCode, 'MODEL_IDENTITY_INVALID');
  const root = cloneEvidence();
  const record = appendActual(root, parsed);
  assert.equal(record.manifest.terminal_status, 'incomplete');
  assert.equal(record.manifest.termination_reason, 'malformed_output');
  assert.ok(record.manifestBytes.length < 2_097_152);
  assert.equal(allFileText(root).includes('m'.repeat(129)), false);
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
});

test('stream parser classifies the observed expired OAuth text without inferring a provider request', () => {
  const parsed = parseClaudeStream(Buffer.alloc(0), Buffer.from('Failed to authenticate: OAuth session expired and could not be refreshed'), { exitCode: 1, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(parsed.authenticationUnavailable, true);
  assert.equal(parsed.providerRequest, 'not_observed');
});

test('stream parser counts structured tool calls against the registered budget', () => {
  const stream = Array.from({ length: 13 }, (_, index) => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `tool-${index}` } } })).join('\n');
  const parsed = parseClaudeStream(Buffer.from(`${stream}\n`), Buffer.alloc(0), { exitCode: 0, externalRunnerStarted: true, maxToolCalls: 12 });
  assert.equal(parsed.toolCallCount, 13);
  assert.equal(parsed.toolBudgetExceeded, true);
});

test('registration records the combined stream capture budget', () => {
  const registration = readJson(join(baseEvidence, 'registration.json'));
  assert.equal(registration.budgets.max_capture_bytes, 2_097_152);
});

test('an unavailable runner is reserved and retained without starting a child process', async () => {
  const root = cloneEvidence();
  const result = await runRegisteredClaude({ allowTestRoot: true, evidenceDir: root, runnerExecutable: join(suiteRoot, 'missing-runner.exe') });
  assert.equal(result.manifest.terminal_status, 'blocked');
  assert.equal(result.manifest.termination_reason, 'environment_unavailable');
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
});

test('actual capture refuses a corrupt validated-prefix preflight before reservation', async () => {
  const root = cloneEvidence();
  rewriteManifestAndLedger(root, 0, (manifest) => { manifest.route_id = 'tampered-route'; });
  await assert.rejects(() => runRegisteredClaude({ allowTestRoot: true, evidenceDir: root, runnerExecutable: join(suiteRoot, 'missing-runner.exe') }), { code: 'MANIFEST_IDENTITY' });
  assert.deepEqual(readdirSync(join(root, 'evidence', 'attempts')).sort(), [RC2_DRY_RUN_ID]);
});

test('actual capture refuses cloned evidence roots before reservation', async () => {
  const root = cloneEvidence();
  await assert.rejects(() => runRegisteredClaude({ evidenceDir: root, runnerExecutable: join(suiteRoot, 'missing-runner.exe') }), { code: 'EVIDENCE_ROOT' });
  assert.deepEqual(readdirSync(join(root, 'evidence', 'attempts')).sort(), [RC2_DRY_RUN_ID]);
});

test('actual capture refuses a linked evidence root before reservation', async (t) => {
  const target = cloneEvidence();
  const linkedRoot = join(suiteRoot, `linked-evidence-${String(++cloneIndex).padStart(3, '0')}`);
  try {
    symlinkSync(target, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`Link creation unavailable: ${error.code || error.message}`);
    return;
  }
  await assert.rejects(() => runRegisteredClaude({ allowTestRoot: true, evidenceDir: linkedRoot, runnerExecutable: join(suiteRoot, 'missing-runner.exe') }), { code: 'PATH_LINK' });
  assert.deepEqual(readdirSync(join(target, 'evidence', 'attempts')).sort(), [RC2_DRY_RUN_ID]);
});

test('official dry run refuses a precreated linked evidence subtree', (t) => {
  const root = join(suiteRoot, `pre-dry-link-${String(++cloneIndex).padStart(3, '0')}`);
  const outside = join(suiteRoot, `pre-dry-outside-${String(++cloneIndex).padStart(3, '0')}`);
  createRegistration({
    allowTestRoot: true,
    evidenceDir: root,
    registeredAt: '2026-08-24T12:00:00.000Z',
    runnerBinarySha256: 'a'.repeat(64),
    runnerVersion: '2.1.223',
  });
  mkdirSync(outside);
  try {
    symlinkSync(outside, join(root, 'evidence'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`Link creation unavailable: ${error.code || error.message}`);
    return;
  }
  assert.throws(() => runDryRun({ evidenceDir: root }), { code: 'EVIDENCE_TOPOLOGY' });
  assert.deepEqual(readdirSync(outside), []);
});

test('actual capture refuses environment drift before reservation', async () => {
  const root = cloneEvidence();
  const registration = readJson(join(root, 'registration.json'));
  const observedEnvironmentForTest = { ...registration.environment, timezone: `${registration.environment.timezone}-drift` };
  await assert.rejects(() => runRegisteredClaude({
    allowTestRoot: true,
    evidenceDir: root,
    observedEnvironmentForTest,
    runnerExecutable: join(suiteRoot, 'missing-runner.exe'),
  }), { code: 'ENVIRONMENT_DRIFT' });
  assert.deepEqual(readdirSync(join(root, 'evidence', 'attempts')).sort(), [RC2_DRY_RUN_ID]);
});

test('interleaved ledger advancement is rejected before a second runner can start', async () => {
  const root = cloneEvidence();
  const loaded = loadCapturePlan({ allowTestRoot: true, evidenceDir: root });
  await assert.rejects(() => runRegisteredClaude({
    allowTestRoot: true,
    beforeReserveForTest: () => appendActual(root),
    evidenceDir: root,
    runnerExecutable: join(suiteRoot, 'missing-runner.exe'),
  }), { code: 'ATTEMPT_ORDER' });
  assert.equal(validateReferenceEvidence({ evidenceDir: root }).actual_attempt_count, 1);
  assert.equal(readdirSync(join(root, 'evidence', 'attempts')).includes(loaded.registration.attempts[1].attempt_id), false);
});

test('capture CLI requires an absolute runner path before any attempt can be consumed', () => {
  const root = cloneEvidence();
  assert.throws(() => parseCaptureRequest(['next']), { code: 'ARGUMENT' });
  assert.throws(() => parseCaptureRequest(['next', '--runner-executable', 'claude']), { code: 'RUNNER_PATH' });
  assert.throws(() => parseCaptureRequest(['next', '--evidence-dir', root, '--runner-executable', join(suiteRoot, 'missing-runner.exe')]), { code: 'ARGUMENT' });
  assert.deepEqual(readdirSync(join(root, 'evidence', 'attempts')).sort(), [RC2_DRY_RUN_ID]);
});

test('runner path syntax rejects remote, device, alternate-stream, and script forms before access', () => {
  for (const pathValue of [
    '\\\\server\\share\\claude.exe',
    '\\\\?\\C:\\Tools\\claude.exe',
    '\\\\.\\C:\\Tools\\claude.exe',
    'C:relative\\claude.exe',
    'C:\\Tools\\claude.exe:stream',
    'C:\\Tools\\claude.cmd',
    'C:\\Tools\\claude.bat',
    'C:\\Tools\\claude.ps1',
    'C:\\Tools\\claude.js',
  ]) assert.throws(() => validateRunnerPathSyntax(pathValue, 'win32'), { code: 'RUNNER_PATH' });
  assert.equal(validateRunnerPathSyntax('C:\\Tools\\claude.exe', 'win32'), 'C:\\Tools\\claude.exe');
  assert.equal(validateRunnerPathSyntax('/usr/local/bin/claude', 'linux'), '/usr/local/bin/claude');
  assert.throws(() => validateRunnerPathSyntax('/usr/local/bin/claude.sh', 'linux'), { code: 'RUNNER_PATH' });
});

test('bounded capture requests hard child termination with no soft-signal fallback', () => {
  const signals = [];
  const fakeChild = { kill: (signal) => { signals.push(signal); return true; } };
  assert.equal(terminateChildHard(fakeChild), true);
  assert.deepEqual(signals, ['SIGKILL']);
  assert.equal(terminateChildHard({ kill: () => { throw new Error('synthetic failure'); } }), false);
});

test('CLI and structured diagnostics never expose host paths or credential-shaped details', async () => {
  const privateMissingPath = 'C:\\Users\\PrivateProbe\\missing';
  const writes = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = (chunk) => {
    writes.push(String(chunk));
    return true;
  };
  let exitCode;
  try {
    exitCode = await verifyReferenceMain(['validate', '--evidence-dir', privateMissingPath]);
  } finally {
    process.stderr.write = originalWrite;
  }
  const diagnostic = writes.join('');
  assert.equal(exitCode, 1);
  assert.equal(diagnostic.includes(privateMissingPath), false);
  assert.match(diagnostic, /^UNEXPECTED: An unexpected local capture error occurred/u);

  const pathDiagnostic = formatReferenceError(new ReferenceError('PROBE', `Missing ${privateMissingPath}`));
  const posixPathDiagnostic = formatReferenceError(new ReferenceError('PROBE', 'Missing /opt/synthetic-host/private.txt'));
  const credentialDiagnostic = formatReferenceError(new ReferenceError('PROBE', 'API_KEY=abcdefghijklmnop'));
  const jwtDiagnostic = formatReferenceError(new ReferenceError('PROBE', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c2lnbmF0dXJl'));
  assert.equal(pathDiagnostic, 'PROBE: Content-safe diagnostic detail was withheld.');
  assert.equal(posixPathDiagnostic, 'PROBE: Content-safe diagnostic detail was withheld.');
  assert.equal(credentialDiagnostic, 'PROBE: Content-safe diagnostic detail was withheld.');
  assert.equal(jwtDiagnostic, 'PROBE: Content-safe diagnostic detail was withheld.');
});

test('dry-run and validation paths do not call external surfaces', () => {
  const modules = [
    require('node:child_process'),
    require('node:dns'),
    require('node:http'),
    require('node:https'),
    require('node:net'),
    require('node:tls'),
  ];
  const names = ['spawn', 'spawnSync', 'exec', 'execFile', 'request', 'get', 'connect', 'lookup', 'resolve'];
  const restore = [];
  const deny = () => { throw new Error('external surface denied by test'); };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = deny;
  try {
    for (const moduleValue of modules) {
      for (const name of names) {
        if (typeof moduleValue[name] === 'function') {
          restore.push([moduleValue, name, moduleValue[name]]);
          moduleValue[name] = deny;
        }
      }
    }
    runDryRun({ evidenceDir: baseEvidence, ephemeral: true });
    validateReferenceEvidence({ evidenceDir: baseEvidence });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [moduleValue, name, original] of restore) moduleValue[name] = original;
  }
});

test('offline modules contain no child process or network imports', () => {
  for (const pathValue of [
    'lib/recursus-reference-v4.mjs',
    'prepare-recursus-reference-v4.mjs',
    'verify-recursus-reference-v4.mjs',
  ]) {
    const text = readFileSync(pathValue, 'utf8');
    for (const token of ['node:child_process', 'node:dns', 'node:http', 'node:https', 'node:net', 'node:tls']) assert.equal(text.includes(token), false, `${pathValue} imported ${token}`);
  }
});

test('all eight RC-2 schemas are closed at the top level', () => {
  const schemaRoot = 'evals/recursus/rc2-claude-code-reference-v4/schemas';
  const files = readdirSync(schemaRoot).filter((name) => name.endsWith('.schema.json')).sort();
  assert.equal(files.length, 8);
  for (const file of files) {
    const schema = readJson(join(schemaRoot, file));
    assert.equal(schema.additionalProperties, false, file);
    assert.equal(schema.type, 'object', file);
    assert.ok(Array.isArray(schema.required) && schema.required.length > 0, file);
  }
});

test('package and updater integration select and own the current v4 harness', () => {
  const packageValue = readJson('package.json');
  assert.equal(packageValue.scripts['recursus:reference:capture'], 'node capture-recursus-reference-v4.mjs next');
  assert.equal(packageValue.scripts['recursus:reference:prepare'], 'node prepare-recursus-reference-v4.mjs');
  assert.equal(packageValue.scripts['recursus:reference:verify'], 'node verify-recursus-reference-v4.mjs validate');
  const updater = readFileSync('update-system.mjs', 'utf8');
  for (const pathValue of [
    'lib/recursus-reference-v4.mjs',
    'lib/recursus-reference-capture-v4.mjs',
    'prepare-recursus-reference-v4.mjs',
    'capture-recursus-reference-v4.mjs',
    'verify-recursus-reference-v4.mjs',
  ]) assert.equal(updater.includes(`'${pathValue}'`), true, pathValue);
});
