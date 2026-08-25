import assert from 'node:assert/strict';
import { linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { canonicalStringify, sha256, validateCorpus } from '../../lib/recursus-benchmark.mjs';
import { assertStagingContentSafe } from '../../lib/recursus-route-content-gate-v16.mjs';
import {
  RC3_ACTUAL_ID,
  RC3_DRY_RUN_ID,
  RC3_INTERNALS_FOR_TESTS,
  RC3_REGISTRATION_ID,
  RC3_ROUTE_ID,
  RC3_SCENARIO_ID,
  RouteError,
  assertRouteContentSafe,
  deriveTerminal,
  loadRouteContract,
  prepareActualWorkspace,
  recordActual,
  reserveActualAttempt,
  runDryRun,
  sanitizeWorkerOutputForEvidence,
  validateRouteEvidence,
} from '../../lib/recursus-route-v16.mjs';
import {
  RC3_CAPTURE_INTERNALS_FOR_TESTS,
  assertCaptureRootsDisjoint,
  captureActualRoute,
  interpretCleanupInspections,
  preflightRuntimeAuthority,
  requireDryOnlyEvidence,
  requireRuntimeAuthorityEnforcement,
} from '../../lib/recursus-route-capture-v16.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const roots = [];

function tempRoot(label) {
  const root = mkdtempSync(join(tmpdir(), `recursus-rc3-v16-${label}-`));
  roots.push(root);
  return root;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalStringify(value)}\n`, 'utf8');
}

function officialDry(label) {
  const root = tempRoot(label);
  const evidenceDir = join(root, 'evidence');
  runDryRun({ evidenceDir, repoRoot: ROOT, runRoot: join(root, 'seed'), write: true });
  return { evidenceDir, root };
}

function resealDryManifest(evidenceDir, mutate) {
  const manifestPath = join(evidenceDir, 'attempts', RC3_DRY_RUN_ID, 'runner-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  mutate(manifest);
  const manifestBytes = canonicalBytes(manifest);
  writeFileSync(manifestPath, manifestBytes);
  const ledgerPath = join(evidenceDir, 'ledger', `0000-${RC3_DRY_RUN_ID}.json`);
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  ledger.manifest.byte_count = manifestBytes.length;
  ledger.manifest.sha256 = sha256(manifestBytes);
  writeFileSync(ledgerPath, canonicalBytes(ledger));
}

function resealDryIntent(evidenceDir, mutate) {
  const attemptRoot = join(evidenceDir, 'attempts', RC3_DRY_RUN_ID);
  const intentPath = join(attemptRoot, 'intent.json');
  const intent = JSON.parse(readFileSync(intentPath, 'utf8'));
  mutate(intent);
  const intentBytes = canonicalBytes(intent);
  writeFileSync(intentPath, intentBytes);
  resealDryManifest(evidenceDir, (manifest) => {
    manifest.recorded_at = intent.recorded_at;
    const record = manifest.records.find((item) => item.path === 'intent.json');
    record.byte_count = intentBytes.length;
    record.sha256 = sha256(intentBytes);
  });
}

function writeReservation(evidenceDir, reservedAt) {
  writeFileSync(join(evidenceDir, 'actual-reservation.json'), canonicalBytes({
    attempt_id: RC3_ACTUAL_ID,
    registration_id: RC3_REGISTRATION_ID,
    reservation_id: `RESERVATION-${RC3_ACTUAL_ID}`,
    reserved_at: reservedAt,
    route_id: RC3_ROUTE_ID,
    scenario_id: RC3_SCENARIO_ID,
    schema_version: '1.0',
    state: 'reserved',
  }));
}

function successfulActualObservation() {
  return {
    ...RC3_INTERNALS_FOR_TESTS.defaultObservation('actual'),
    adapter_identity_matched: true,
    adapter_invocation_count: 1,
    adapter_registered: true,
    application_fetch_count: 1,
    artifact_captured: true,
    artifact_valid: true,
    authentication_available: true,
    authority_attestation_valid: true,
    direct_adapter_invocation_observed: true,
    discarded_reasoning_block_count: 1,
    harness_identity_matched: true,
    identity_match: true,
    inbox_transition_matched: true,
    input_message_matched: true,
    observed_unsupported_capabilities: [],
    oauth_fetch_count: 0,
    process_exit_code: 0,
    provider_identity_matched: true,
    provider_request_count: 1,
    proxy_responses_tunnel_count: 1,
    registered_runtime_loaded: true,
    relay_connection_count: 1,
    request_context_matched: true,
    responses_fetch_count: 1,
    route_identity_matched: true,
    runtime_started: true,
    trusted_terminal_event_count: 1,
    trusted_terminal_success: true,
    text_block_count: 1,
    unregistered_fetch_count: 0,
    wall_ms: 1,
  };
}

function successfulWorkerObservation() {
  return {
    ...successfulActualObservation(),
    authority_attestation_valid: false,
    process_exit_code: null,
    proxy_download_bytes: 0,
    proxy_responses_tunnel_count: 0,
    proxy_upload_bytes: 0,
    relay_connection_count: 0,
  };
}

function successfulAuthorityObservation() {
  return {
    artifact_captured: true,
    artifact_valid: true,
    attempt_id: RC3_ACTUAL_ID,
    authentication_available: true,
    authority_attestation_valid: true,
    budget_exceeded: false,
    cleanup_observation: {
      container_inspect_not_found_count: 3,
      inspection_error_count: 0,
      network_inspect_not_found_count: 1,
      outcome: 'strict_not_found',
      volume_inspect_not_found_count: 1,
    },
    content_scan_passed: true,
    credential_scan_passed: true,
    external_mount_topology_valid: true,
    external_resources_cleaned: true,
    image_identity_matched: true,
    observation_id: `AUTHORITY-${RC3_ACTUAL_ID}`,
    oracle_scan_passed: true,
    post_run_scan_passed: true,
    process_exit_code: 0,
    process_oom_killed: false,
    process_signal: null,
    proxy_clean_shutdown: true,
    proxy_denial_reasons: [],
    proxy_denied_count: 0,
    proxy_download_bytes: 1,
    proxy_oauth_tunnel_count: 0,
    proxy_responses_tunnel_count: 1,
    proxy_upload_bytes: 1,
    proxy_unexpected_count: 0,
    relay_clean_shutdown: true,
    relay_connection_count: 1,
    relay_upstream_failure_count: 0,
    schema_version: '1.0',
    tunnel_count_reconciled: true,
    unexpected_external_mutation: false,
    workspace_unchanged: true,
  };
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

test('V16 freezes distinct route, runtime, harness, adapter, provider, model, and authority identities', () => {
  const { registration, sourceSnapshot } = loadRouteContract({ repoRoot: ROOT });
  assert.equal(registration.route.route_id, 'recursus-direct-v16');
  assert.equal(registration.route.runtime.id, 'recursus');
  assert.equal(registration.route.control_plane.id, 'deepseek-harness');
  assert.equal(registration.route.adapter.id, 'deepseek-openai-codex');
  assert.equal(registration.route.provider.id, 'openai-codex');
  assert.equal(registration.route.model.id, 'gpt-5.6-sol');
  assert.equal(registration.route.model.reasoning_effort, 'xhigh');
  assert.equal(registration.route.runner.version, '16.0.0');
  assert.notEqual(registration.route.runner.id, registration.route.harness.id);
  assert.equal(registration.authority_profile.network_boundary.worker, 'relay_network_namespace_no_routes_no_socket_mount');
  assert.equal(registration.authority_profile.network_boundary.max_response_connect_tunnels_per_adapter_request, 2);
  assert.equal(registration.authority_profile.network_boundary.max_oauth_refresh_connect_tunnels_per_adapter_request, 2);
  assert.equal(registration.authority_profile.network_boundary.wire_request_count, 'unsupported_end_to_end_tls');
  assert.equal(sourceSnapshot.execution_materialization.packaging_status.status, 'selected_materialization_validated_not_reproducible');
  assert.equal(registration.authority_profile.image.reference, 'recursus-rc3-v16@sha256:8475dfcbe0ee7eec2632ba96f1baf6bf8d92c57c379491bca0d8f6352e5dfae0');
  assert.deepEqual(registration.environment.platforms, ['windows-x64']);
});

test('V16 records authority as supported for actual and inapplicable to offline dry runs', () => {
  const { registration } = loadRouteContract({ repoRoot: ROOT });
  assert.deepEqual(requireRuntimeAuthorityEnforcement(registration), {
    capability_id: 'runtime_authority_enforcement',
    enabled: true,
    required_for_actual: true,
    required_for_dry_run: false,
    support_status: 'supported',
  });
  assert.ok(registration.unsupported_capabilities.includes('reproducible_package_build'));
  assert.ok(registration.unsupported_capabilities.includes('wire_level_request_count_attestation'));
  assert.ok(!registration.unsupported_capabilities.includes('runtime_authority_enforcement'));
});

test('V16 independently reconciles runner context and materialization aggregates', () => {
  const { registration, sourceSnapshot } = loadRouteContract({ repoRoot: ROOT });
  assert.equal(RC3_INTERNALS_FOR_TESTS.validateRunnerMaterialization(registration, sourceSnapshot, ROOT), true);
  for (const [expected, mutate] of [
    ['MATERIALIZATION_REFERENCE', (snapshot) => { snapshot.execution_materialization.runner_layer.build_definition.sha256 = '0'.repeat(64); }],
    ['MATERIALIZATION_ATTESTATION', (snapshot) => { snapshot.execution_materialization.runner_layer.context_file_count++; }],
    ['MATERIALIZATION_ATTESTATION', (snapshot) => { snapshot.execution_materialization.worker_image.config_digest = `sha256:${'0'.repeat(64)}`; }],
    ['CONTEXT_INVENTORY', (snapshot) => {
      const item = snapshot.runner_files.find((entry) => entry.path === 'lib/recursus-route-worker-v16.mjs');
      item.sha256 = '0'.repeat(64);
    }],
    ['PARENT_IMAGE_IDENTITY', (snapshot) => { snapshot.execution_materialization.parent_image.reference = 'recursus-rc3-v14:final@sha256:' + '0'.repeat(64); }],
  ]) {
    const snapshot = structuredClone(sourceSnapshot);
    mutate(snapshot);
    assert.throws(() => RC3_INTERNALS_FOR_TESTS.validateRunnerMaterialization(registration, snapshot, ROOT), (error) => error.code === expected);
  }
});

test('V16 provider-free projections are deterministic and contain zero authority activity', () => {
  const first = runDryRun({ repoRoot: ROOT, runRoot: join(tempRoot('det-a'), 'seed') });
  const second = runDryRun({ repoRoot: ROOT, runRoot: join(tempRoot('det-b'), 'seed') });
  assert.deepEqual(first, second);
  assert.equal(first.terminal_status, 'completed');
  const { evidenceDir } = officialDry('dry-authority');
  const manifest = JSON.parse(readFileSync(join(evidenceDir, 'attempts', RC3_DRY_RUN_ID, 'runner-manifest.json'), 'utf8'));
  assert.equal(manifest.execution.authority_attestation_valid, false);
  assert.equal(manifest.execution.provider_request_count, 0);
  assert.equal(manifest.execution.proxy_responses_tunnel_count, 0);
  assert.equal(manifest.execution.proxy_oauth_tunnel_count, 0);
  assert.equal(manifest.execution.proxy_denied_count, 0);
  assert.equal(manifest.execution.relay_connection_count, 0);
});

test('V16 independently validates official dry evidence and all contract hashes', () => {
  const { evidenceDir } = officialDry('validate');
  const result = validateRouteEvidence({ evidenceDir, repoRoot: ROOT });
  assert.equal(result.dry_run_count, 1);
  assert.equal(result.actual_attempt_count, 0);
  assert.equal(result.source_snapshot_integrity, 'pass');
  assert.equal(result.validation_id, 'RC3-ROUTE-VALIDATION-16');
});

test('V16 rejects stale artifact bytes and wrong route or scenario identity', () => {
  const stale = officialDry('stale-artifact').evidenceDir;
  writeFileSync(join(stale, 'attempts', RC3_DRY_RUN_ID, 'artifacts', 'assistant-output.md'), '# changed\n', 'utf8');
  assert.throws(() => validateRouteEvidence({ evidenceDir: stale, repoRoot: ROOT }), (error) => error.code === 'STALE_HASH');

  for (const [label, mutate] of [
    ['wrong-route', (manifest) => { manifest.route_id = 'unregistered-route'; }],
    ['wrong-scenario', (manifest) => { manifest.scenario_id = 'WRONG-01'; }],
  ]) {
    const evidenceDir = officialDry(label).evidenceDir;
    resealDryManifest(evidenceDir, mutate);
    assert.throws(() => validateRouteEvidence({ evidenceDir, repoRoot: ROOT }), /required constant/u);
  }
});

test('V16 rejects false dry-run authority attestation after coordinated resealing', () => {
  const { evidenceDir } = officialDry('false-authority');
  resealDryManifest(evidenceDir, (manifest) => {
    manifest.execution.authority_attestation_valid = true;
    manifest.execution.proxy_responses_tunnel_count = 1;
    manifest.execution.relay_connection_count = 1;
  });
  assert.throws(() => validateRouteEvidence({ evidenceDir, repoRoot: ROOT }), (error) => error.code === 'FALSE_ATTESTATION');
});

test('V16 rejects noncanonical and out-of-order intent and reservation timestamps', () => {
  const invalidIntent = officialDry('invalid-intent-time').evidenceDir;
  resealDryIntent(invalidIntent, (intent) => { intent.recorded_at = 'not-a-date-xxxxxxxxx'; });
  assert.throws(() => validateRouteEvidence({ evidenceDir: invalidIntent, repoRoot: ROOT }), /pattern|canonical UTC timestamp/u);

  const earlyIntent = officialDry('early-intent-time').evidenceDir;
  resealDryIntent(earlyIntent, (intent) => { intent.recorded_at = '2026-08-24T00:00:00.000Z'; });
  assert.throws(() => validateRouteEvidence({ evidenceDir: earlyIntent, repoRoot: ROOT }), (error) => error.code === 'ATTEMPT_CROSS_REFERENCE');

  const invalidReservation = officialDry('invalid-reservation-time').evidenceDir;
  writeReservation(invalidReservation, 'not-a-date-xxxxxxxxx');
  assert.throws(() => validateRouteEvidence({ evidenceDir: invalidReservation, repoRoot: ROOT }), /pattern|canonical UTC timestamp/u);

  const earlyReservation = officialDry('early-reservation-time').evidenceDir;
  writeReservation(earlyReservation, '2026-08-24T00:00:00.000Z');
  assert.throws(() => validateRouteEvidence({ evidenceDir: earlyReservation, repoRoot: ROOT }), (error) => error.code === 'RESERVATION_CHRONOLOGY');
});

test('V16 cleanup attestation accepts only exact Docker not-found results', () => {
  const result = (kind, name) => ({
    error: undefined,
    signal: null,
    status: 1,
    stderr: kind === 'container'
      ? `Error response from daemon: No such container: ${name}\n`
      : kind === 'network'
        ? `Error response from daemon: network ${name} not found\n`
        : `Error response from daemon: get ${name}: no such volume\n`,
    stdout: '[]\n',
  });
  const entries = [
    ...['worker', 'relay', 'proxy'].map((name) => ({ kind: 'container', name, result: result('container', name) })),
    { kind: 'network', name: 'network', result: result('network', 'network') },
    { kind: 'volume', name: 'socket', result: result('volume', 'socket') },
  ];
  assert.deepEqual(interpretCleanupInspections(entries), {
    container_inspect_not_found_count: 3,
    inspection_error_count: 0,
    network_inspect_not_found_count: 1,
    outcome: 'strict_not_found',
    volume_inspect_not_found_count: 1,
  });
  for (const badResult of [
    { ...result('container', 'worker'), status: null },
    { ...result('container', 'worker'), status: 2 },
    { ...result('container', 'worker'), signal: 'SIGTERM' },
    { ...result('container', 'worker'), stderr: 'daemon unavailable\n' },
  ]) {
    const observed = interpretCleanupInspections([{ kind: 'container', name: 'worker', result: badResult }]);
    assert.equal(observed.inspection_error_count, 1);
    assert.equal(observed.outcome, 'inspection_error');
  }
});

test('V16 terminal completion requires reconciled authority and a separate DSH request observation', () => {
  const complete = successfulActualObservation();
  assert.deepEqual(deriveTerminal('actual', complete), { reason: 'none', status: 'completed' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, proxy_responses_tunnel_count: 2, relay_connection_count: 2 }), { reason: 'none', status: 'completed' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, application_fetch_count: 2, oauth_fetch_count: 1, proxy_oauth_tunnel_count: 1, relay_connection_count: 2 }), { reason: 'none', status: 'completed' });
  for (const mutate of [
    (value) => { value.authority_attestation_valid = false; },
    (value) => { value.proxy_responses_tunnel_count = 0; },
    (value) => { value.proxy_denied_count = 1; },
    (value) => { value.relay_connection_count = 0; },
    (value) => { value.proxy_responses_tunnel_count = 3; value.relay_connection_count = 3; },
  ]) {
    const observation = { ...complete };
    mutate(observation);
    assert.deepEqual(deriveTerminal('actual', observation), { reason: 'authority_attestation_failed', status: 'incomplete' });
  }
  assert.deepEqual(deriveTerminal('actual', { ...complete, provider_request_count: 0 }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, adapter_invocation_count: 2 }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, application_fetch_count: 2, responses_fetch_count: 2 }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, application_fetch_count: 2, unregistered_fetch_count: 1 }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, inbox_transition_matched: false }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, input_message_matched: false }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, request_context_matched: false }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, text_block_count: 0 }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, seed_validated: false }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, runner_input_validated: false }), { reason: 'malformed_output', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, identity_match: false }), { reason: 'identity_mismatch', status: 'incomplete' });
  assert.deepEqual(deriveTerminal('actual', { ...complete, unexpected_external_mutation: true }), { reason: 'unexpected_external_mutation', status: 'incomplete' });
});

test('V16 require-actual gate accepts only a completed runner-attested artifact', () => {
  const completed = { attempt_kind: 'actual', execution: { artifact_captured: true, artifact_valid: true }, execution_attestation: 'runner_attested', terminal_status: 'completed', termination_reason: 'none' };
  assert.equal(RC3_INTERNALS_FOR_TESTS.requireCompletedActual([completed]), true);
  for (const mutation of [
    { terminal_status: 'blocked' },
    { terminal_status: 'failed' },
    { terminal_status: 'incomplete' },
    { execution_attestation: 'absent' },
    { execution: { artifact_captured: false, artifact_valid: false } },
  ]) assert.throws(() => RC3_INTERNALS_FOR_TESTS.requireCompletedActual([{ ...completed, ...mutation }]), (error) => error.code === 'ACTUAL_NOT_COMPLETED');
});

test('V16 rejects unsupported required capabilities without simulating completion', () => {
  const observation = { ...successfulActualObservation(), observed_unsupported_capabilities: ['direct_adapter_transport'], required_capabilities_supported: false };
  assert.deepEqual(deriveTerminal('actual', observation), { reason: 'route_unsupported', status: 'unsupported' });
});

test('V16 public callers cannot mint completed runner-attested actual evidence', async () => {
  const { evidenceDir, root } = officialDry('actual-projection');
  const runRoot = join(root, 'actual-seed');
  const prepared = prepareActualWorkspace({ evidenceDir, repoRoot: ROOT, runRoot });
  reserveActualAttempt({ evidenceDir, repoRoot: ROOT });
  const artifactBytes = Buffer.from('# Synthetic V16 projection\n\nBounded test artifact.\n', 'utf8');
  assert.throws(() => recordActual({
    authorityObservation: successfulAuthorityObservation(),
    evidenceDir,
    prepared,
    publicationCapability: Object.freeze({}),
    repoRoot: ROOT,
    runRoot,
    workerResult: { artifactBytes, observation: successfulActualObservation() },
    workerObservation: successfulWorkerObservation(),
  }), (error) => error.code === 'PUBLICATION_AUTHORITY');
  assert.throws(() => validateRouteEvidence({ evidenceDir, repoRoot: ROOT, requireActual: true }), (error) => error.code === 'ACTUAL_INCOMPLETE');
  assert.equal(RC3_INTERNALS_FOR_TESTS.buildProjection, undefined);
  assert.throws(() => preflightRuntimeAuthority({}), (error) => error.code === 'CAPTURE_ENTRYPOINT');
  await assert.rejects(() => captureActualRoute({}), (error) => error.code === 'CAPTURE_ENTRYPOINT');
});

test('V16 worker module exposes no host trust-minting surface', async () => {
  const worker = await import('../../lib/recursus-route-worker-v16.mjs');
  assert.equal(worker.trustValidatedWorkerResult, undefined);
  assert.equal(worker.consumeTrustedWorkerResult, undefined);
});

test('V16 does not export a directly callable adapter worker', async () => {
  const worker = await import('../../lib/recursus-route-worker-v16.mjs');
  assert.equal(worker.runDirectAdapterWorker, undefined);
  assert.equal(worker.inspectAuthentication, undefined);
});

test('V16 enforces artifact budget and content gates before worker persistence', () => {
  const worker = readFileSync(join(ROOT, 'lib', 'recursus-route-worker-v16.mjs'), 'utf8');
  const budgetCall = worker.indexOf('boundArtifactBeforePersistence(consumeTrustedWorkerResult(');
  const gateCall = worker.indexOf("assertStagingContentSafe(result.artifactBytes, 'provider artifact')");
  const artifactWrite = worker.indexOf("writeFileSync(join(output, 'assistant-output.md')");
  assert.ok(budgetCall >= 0 && gateCall > budgetCall && artifactWrite > gateCall);
  assert.match(worker, /artifactBytes\.length <= MAX_ARTIFACT_BYTES/);
  assert.match(worker, /artifact_captured: false,[\s\S]*artifact_valid: false,[\s\S]*budget_exceeded: true,[\s\S]*content_scan_passed: false/);
  const html = (value) => [...value].map((character) => `&#${character.codePointAt(0)};`).join('');
  const htmlNoSemicolon = (value) => [...value].map((character) => `&#x${character.codePointAt(0).toString(16)}`).join('');
  const htmlCommentSeparated = (value) => [...value].map((character) => `&#${character.codePointAt(0)}<!-- -->`).join('');
  const htmlTagSeparated = (value, token) => [...value].join(token);
  const quotedPrintable = (value) => [...Buffer.from(value, 'utf8')].map((byte) => `=${byte.toString(16).padStart(2, '0')}`).join('');
  const rawUtf32le = (value) => {
    const bytes = Buffer.alloc([...value].length * 4);
    [...value].forEach((character, index) => bytes.writeUInt32LE(character.codePointAt(0), index * 4));
    return bytes;
  };
  for (const value of [
    html('OPENAI_CODEX_OAUTH: synthetic-secret-value'),
    html('C:\\Users\\Synthetic\\secret.txt'),
    htmlNoSemicolon('OPENAI_CODEX_OAUTH: synthetic-secret-value'),
    htmlNoSemicolon('C:\\Users\\Synthetic\\secret.txt'),
    htmlCommentSeparated('OPENAI_CODEX_OAUTH: synthetic-secret-value'),
    htmlCommentSeparated('C:\\Users\\Synthetic\\secret.txt'),
    htmlTagSeparated('OPENAI_CODEX_OAUTH: synthetic-secret-value', '<wbr>'),
    htmlTagSeparated('C:\\Users\\Synthetic\\secret.txt', '<img>'),
    htmlTagSeparated('OPENAI_CODEX_OAUTH: synthetic-secret-value', '<!x>'),
    'Bearer&nbspSYNTHETICTOKEN12345',
    Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf16le'),
    rawUtf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value'),
    quotedPrintable('OPENAI_CODEX_OAUTH: synthetic-secret-value'),
    [...'OPENAI_CODEX_OAUTH: synthetic-secret-value'].map((character) => `%u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''),
  ]) assert.throws(() => assertStagingContentSafe(Buffer.from(value), 'provider artifact'), (error) => ['CONTENT_ENCODING', 'CREDENTIAL_LEAK', 'PRIVATE_PATH_LEAK'].includes(error.code));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Research &Development. Sales &Marketing. https://example.test/?code=20&utm_source=career&ref=resume'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Copyright &copy; and punctuation &mdash; are ordinary prose.'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Led 360&deg; campaigns, improved the team&rsquo;s cadence, and reduced variance to &plusmn;5 percent with &alpha; trials.'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Ordinary &notanentity; prose and &CounterClockwiseContourIntegral; notation remain valid content.'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Names such as Ren\u00e9 may use &eacute;. See <https://example.test/profile> or <candidate@example.test>.'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Plain <p>summary</p> with <strong>leadership</strong> and <span class="role">engineering</span>.'), 'provider artifact'));
  for (const value of [
    '<a href="file:///home/synthetic/private.txt">Profile</a>',
    '<img src="C:\\Users\\Synthetic\\secret.png" alt="portrait">',
    '<img src="file:///C:/Users/Synthetic/secret.png" alt="portrait">',
    '<span data-path="/home/synthetic/private.txt">Engineer</span>',
    '</a data-path="/home/synthetic/private.txt">',
    '</a data-path="C:\\Users\\Synthetic\\secret.txt">',
    '</a/home/synthetic/private.txt>',
    Buffer.from('<a href="/home/synthetic/private.txt">Profile</a>', 'utf8').toString('base64'),
    [...Buffer.from('<a href="C:\\Users\\Synthetic\\secret.txt">Profile</a>', 'utf8')].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''),
    '\\/home/synthetic/private.txt',
    'C\\:\\\\Users\\Synthetic\\secret.txt',
    'file\\:\\/\\/\\/home/synthetic/private.txt',
  ]) assert.throws(() => assertStagingContentSafe(Buffer.from(value), 'provider artifact'), (error) => error.code === 'PRIVATE_PATH_LEAK');
  for (const value of [
    'sk-syn**thetic1234567890**',
    'Bearer **SYNTHETICTOKEN123456**',
    'OPENAI_CODEX_OAUTH**:** syntheticvalue123456',
    'sk-[synthetic1234567890](https://example.test)',
    'sk-[synthetic1234567890]\n\n[synthetic1234567890]: https://example.test',
    '_sk_-_synthetic1234567890_',
    '_Bearer_ _SYNTHETICTOKEN123456_',
    '_Basic_ _QUJDREVGR0hJSktMTQ==_',
  ]) assert.throws(() => assertStagingContentSafe(Buffer.from(value), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from('Bearer&nbspSYNTHETICTOKEN123456'), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from('Bearer&ThinSpace;SYNTHETICTOKEN123456'), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from('Basic&Tab;QUJDREVGR0hJSktMTQ=='), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from('OPENAI&UnderBar;CODEX&UnderBar;OAUTH: synthetic-secret-value'), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from('https&colon;&sol;&sol;user&colon;pass&commat;example.test'), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.throws(() => assertStagingContentSafe(Buffer.from([...'OPENAI_CODEX_OAUTH: synthetic-secret-value'].map((character) => `&amp;amp;#x${character.codePointAt(0).toString(16)};`).join('')), 'provider artifact'), (error) => error.code === 'CREDENTIAL_LEAK');
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('**Leadership:** delivered [a synthetic project](https://example.test/project) with `Node.js`.'), 'provider artifact'));
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('Use [bracketed prose] without a reference definition.'), 'provider artifact'));
  assert.throws(() => assertStagingContentSafe(Buffer.from(Array.from({ length: 2_000 }, (_value, index) => `ID${index.toString(16).padStart(6, '0')}`).join(' ')), 'provider artifact'), (error) => error.code === 'CONTENT_ENCODING');
  assert.doesNotThrow(() => assertStagingContentSafe(Buffer.from('# Synthetic professional summary\n'), 'provider artifact'));
});

test('V16 documentation preserves reviewed historical statuses', () => {
  const roadmap = readFileSync(join(ROOT, 'docs', 'recursus', 'ROADMAP.md'), 'utf8');
  assert.match(roadmap, /\| RC-3 \| Minimal Recursus execution bridge \| `in progress` \|/);
  assert.match(roadmap, /\| RC-4 \| Compiled prompt and context parity \| `next` \|/);
  for (const [version, status] of [
    [4, 'preserved historical and superseded'],
    [12, 'preserved historical and rejected after review'],
    [13, 'preserved historical and rejected after review'],
    [14, 'preserved historical and rejected before execution'],
    [15, 'preserved historical and rejected after final review'],
  ]) {
    const readme = readFileSync(join(ROOT, 'evals', 'recursus', `rc3-recursus-direct-v${version}`, 'README.md'), 'utf8');
    assert.match(readme, new RegExp(`Status: ${status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }
  const v16 = readFileSync(join(ROOT, 'evals', 'recursus', 'rc3-recursus-direct-v16', 'README.md'), 'utf8');
  assert.match(v16, /V16 supersedes but does not rewrite rejected V15/);
});

test('V16 freezes exact application fetch facts and discards reasoning bytes from artifacts', () => {
  const worker = readFileSync(join(ROOT, 'lib', 'recursus-route-worker-v16.mjs'), 'utf8');
  const capture = readFileSync(join(ROOT, 'lib', 'recursus-route-capture-v16.mjs'), 'utf8');
  assert.match(worker, /https:\/\/chatgpt\.com\/backend-api\/codex\/responses/u);
  assert.match(worker, /https:\/\/auth\.openai\.com\/oauth\/token/u);
  assert.ok(worker.indexOf('const fetchGuard = installApplicationFetchGuard()') < worker.indexOf('await Promise.all(names.map'));
  assert.match(worker, /Object\.defineProperty\(globalThis, 'fetch', \{ configurable: false, enumerable: true, value: guarded, writable: false \}\)/u);
  assert.doesNotMatch(worker, /fetchGuard\.restore/u);
  assert.match(worker, /reasoningBlocks\.length/u);
  assert.match(worker, /userMessages\[0\]\?\.data;/u);
  assert.match(worker, /agent\/inbox\/spliced/u);
  assert.match(worker, /inbox_transition_matched: inboxTransitionMatched/u);
  assert.match(worker, /request\/context/u);
  assert.match(worker, /request_context_matched: requestContextMatched/u);
  assert.doesNotMatch(worker, /reasoningBlocks\.map/u);
  assert.match(capture, /const integerSummary = \[proxy\.denied, proxy\.oauth_admitted, proxy\.responses_admitted, proxy\.unexpected, relay\.accepted_connections, relay\.upstream_failures\]/u);
  assert.match(capture, /authority-proxy-events\.json/u);
  assert.match(capture, /CONTENT_GATE_SCRIPT/u);
});

test('V16 rejects oracle, credential, path, malformed, and over-budget artifacts before evidence publication', () => {
  const { context } = validateCorpus({ repoRoot: ROOT });
  const percentEncode = (value) => [...Buffer.from(value, 'utf8')].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
  const mimeBase64 = (value, encoding = 'utf8') => Buffer.from(value, encoding).toString('base64').match(/.{1,4}/gu).join(' \n');
  const wrappedBase64 = (value, width) => Buffer.from(`X`.repeat(55) + value + `X`.repeat(55), 'utf8').toString('base64').match(new RegExp(`.{1,${width}}`, 'gu')).join(' \n');
  const separatedHex = (value, encoding = 'utf8') => Buffer.from(value, encoding).toString('hex').match(/.{2}/gu).join(':');
  const prefixedHex = (value, prefix, separator) => Buffer.from(value, 'utf8').toString('hex').match(/.{2}/gu).map((byte) => `${prefix}${byte}`).join(separator);
  const jsonUnicode = (value) => [...value].map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const mixedJsonUnicode = (value) => [...value].map((character, index) => index % 2 === 0 ? character : `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const utf16Padded = (value) => `中`.repeat(100) + value + `中`.repeat(100);
  const htmlNumeric = (value) => [...value].map((character) => `&#x${character.codePointAt(0).toString(16)};`).join('');
  const htmlNumericNoSemicolon = (value) => [...value].map((character) => `&#${character.codePointAt(0)}`).join('');
  const htmlNumericSpaced = (value) => [...value].map((character) => `&#${character.codePointAt(0)} `).join('');
  const htmlCommentSeparated = (value) => [...value].map((character) => `&#${character.codePointAt(0)}<!---->`).join('');
  const htmlTagSeparated = (value, token) => [...value].join(token);
  const quotedPrintable = (value) => [...Buffer.from(value, 'utf8')].map((byte) => `=${byte.toString(16).padStart(2, '0')}`).join('');
  const percentUnicode = (value) => [...value].map((character) => `%u${character.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const utf32le = (value) => {
    const codePoints = [...value].map((character) => character.codePointAt(0));
    const bytes = Buffer.alloc(codePoints.length * 4);
    codePoints.forEach((codePoint, index) => bytes.writeUInt32LE(codePoint, index * 4));
    return bytes;
  };
  const percentBytes = (bytes) => [...bytes].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join('');
  const quotedPrintableBytes = (bytes) => [...bytes].map((byte) => `=${byte.toString(16).padStart(2, '0')}`).join('');
  for (const [expected, bytes] of [
    ['ORACLE_LEAK_TOKEN', Buffer.from('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(`encoded=${Buffer.from('refresh: synthetic-secret-value', 'utf8').toString('base64url')}`, 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(`encoded=${Buffer.from('access: synthetic-secret-value', 'utf8').toString('base64').replaceAll('=', '')}`, 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.from(percentEncode('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from(percentEncode('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(percentEncode(Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf8').toString('base64')), 'utf8')],
    ['CREDENTIAL_LEAK', canonicalBytes({ encoded: Buffer.from(percentEncode('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8').toString('base64') })],
    ['PRIVATE_PATH_LEAK', Buffer.from('C:\\Users\\Synthetic\\secret.txt', 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from(percentEncode('C:\\Users\\Synthetic\\secret.txt'), 'utf8').toString('hex'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(mimeBase64('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(mimeBase64('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(mimeBase64('C:\\Users\\Synthetic\\secret.txt'), 'utf8')],
    ...[1, 2, 3, 76].flatMap((width) => [
      ['ORACLE_LEAK_TOKEN', Buffer.from(wrappedBase64('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', width), 'utf8')],
      ['CREDENTIAL_LEAK', Buffer.from(wrappedBase64('OPENAI_CODEX_OAUTH: synthetic-secret-value', width), 'utf8')],
      ['PRIVATE_PATH_LEAK', Buffer.from(wrappedBase64('C:\\Users\\Synthetic\\secret.txt', width), 'utf8')],
    ]),
    ['ORACLE_LEAK_TOKEN', Buffer.from(separatedHex('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(separatedHex('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(separatedHex('C:\\Users\\Synthetic\\secret.txt'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(prefixedHex('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', '0x', ','), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(prefixedHex('OPENAI_CODEX_OAUTH: synthetic-secret-value', '\\x', ' '), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from('C:\\Users\\Synthetic\\secret.txt', 'utf8').toString('hex').match(/.{2}/gu).join(','), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.from('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', 'utf16le').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf16le').toString('base64'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from('C:\\Users\\Synthetic\\secret.txt', 'utf16le').toString('hex'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.from(utf16Padded('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf16le').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from(utf16Padded('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf16le').toString('hex'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from(utf16Padded('C:\\Users\\Synthetic\\secret.txt'), 'utf16le').toString('base64'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(`prefix {"x":"${jsonUnicode('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2')}"} suffix`, 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(`prefix \`${jsonUnicode('OPENAI_CODEX_OAUTH: synthetic-secret-value')}\` suffix`, 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(`prefix {"x":"${jsonUnicode('C:\\Users\\Synthetic\\secret.txt')}"} suffix`, 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from(jsonUnicode('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8').toString('base64'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(`prefix \`${mixedJsonUnicode('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2')}\` suffix`, 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(`prefix \`${mixedJsonUnicode('OPENAI_CODEX_OAUTH: synthetic-secret-value')}\` suffix`, 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(`prefix \`${mixedJsonUnicode('C:\\Users\\Synthetic\\secret.txt')}\` suffix`, 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from(mixedJsonUnicode('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8').toString('base64'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(htmlNumeric('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(htmlNumeric('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(htmlNumeric('/home/synthetic/private.txt'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(htmlNumericNoSemicolon('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(htmlNumericNoSemicolon('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(htmlNumericNoSemicolon('/home/synthetic/private.txt'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(htmlNumericSpaced('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(htmlNumericSpaced('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(htmlNumericSpaced('/home/synthetic/private.txt'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(htmlCommentSeparated('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(htmlCommentSeparated('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(htmlCommentSeparated('/home/synthetic/private.txt'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(htmlTagSeparated('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', '<wbr>'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(htmlTagSeparated('OPENAI_CODEX_OAUTH: synthetic-secret-value', '<img>'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(htmlTagSeparated('/home/synthetic/private.txt', '<!x>'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from([...'REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'].map((character) => `&amp;amp;#${character.codePointAt(0)};`).join(''), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from([...'OPENAI_CODEX_OAUTH: synthetic-secret-value'].map((character) => `&amp;amp;#x${character.codePointAt(0).toString(16)};`).join(''), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from([...'/home/synthetic/private.txt'].map((character) => `&amp;amp;#${character.codePointAt(0)};`).join(''), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.from('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2', 'utf8').toString('hex').match(/.{2}/gu).join('.'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf8').toString('hex').match(/.{2}/gu).join('.'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from('/home/synthetic/private.txt', 'utf8').toString('hex').match(/.{2}/gu).join('.'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from([...'REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'].join('\u200b'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from([...'OPENAI_CODEX_OAUTH: synthetic-secret-value'].join('\u2060'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from([...'/home/synthetic/private.txt'].join('\u00ad'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from('REC-BENCH-LEAK-**CANARY**-MANIFEST-FACT-01-A7Q2', 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from('REC-BENCH-LEAK-[CANARY](https://example.test)-MANIFEST-FACT-01-A7Q2', 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from('REC-BENCH-LEAK-[CANARY]-MANIFEST-FACT-01-A7Q2\n\n[CANARY]: https://example.test', 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'.replaceAll('-', '\\-'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from('_REC_-_BENCH_-_LEAK_-_CANARY_-_MANIFEST_-_FACT_-_01_-_A7Q2_', 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from('_/home/synthetic/private.txt_', 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from([...Buffer.from('_REC_-_BENCH_-_LEAK_-_CANARY_-_MANIFEST_-_FACT_-_01_-_A7Q2_', 'utf8')].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(percentBytes(utf32le('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2')), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(quotedPrintableBytes(utf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value')), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(percentBytes(utf32le('/home/synthetic/private.txt')), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.from(quotedPrintableBytes(utf32le('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2')), 'utf8').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(Buffer.from(percentBytes(utf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value')), 'utf8').toString('base64'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.from(quotedPrintableBytes(utf32le('/home/synthetic/private.txt')), 'utf8').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from('Bearer&nbspSYNTHETICTOKEN12345', 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(quotedPrintable('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(percentUnicode('OPENAI_CODEX_OAUTH: synthetic-secret-value'), 'utf8')],
    ['ORACLE_LEAK_TOKEN', Buffer.from(utf32le('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2').toString('base64'), 'utf8')],
    ['CREDENTIAL_LEAK', Buffer.from(utf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value').toString('base64'), 'utf8')],
    ['PRIVATE_PATH_LEAK', Buffer.from(utf32le('C:\\Users\\Synthetic\\secret.txt').toString('base64'), 'utf8')],
    ['CONTENT_ENCODING', Buffer.from('OPENAI_CODEX_OAUTH: synthetic-secret-value', 'utf16le')],
    ['CONTENT_ENCODING', utf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value')],
    ...[1, 2, 3].flatMap((prefixLength) => [
      ['ORACLE_LEAK_TOKEN', Buffer.from(Buffer.concat([Buffer.alloc(prefixLength, 0x58), utf32le('REC-BENCH-LEAK-CANARY-MANIFEST-FACT-01-A7Q2'), Buffer.from([0x59])]).toString('base64'), 'utf8')],
      ['CREDENTIAL_LEAK', Buffer.from(Buffer.concat([Buffer.alloc(prefixLength, 0x58), utf32le('OPENAI_CODEX_OAUTH: synthetic-secret-value'), Buffer.from([0x59])]).toString('hex'), 'utf8')],
      ['PRIVATE_PATH_LEAK', Buffer.from(Buffer.concat([Buffer.alloc(prefixLength, 0x58), utf32le('C:\\Users\\Synthetic\\secret.txt'), Buffer.from([0x59])]).toString('base64'), 'utf8')],
    ]),
    ['CONTENT_ENCODING', Buffer.from('prefix "\\uD800" suffix', 'utf8')],
    ['UTF8', Buffer.from([0xff, 0xfe, 0xfd])],
    ['ARTIFACT_BUDGET', Buffer.alloc(65_537, 0x61)],
  ]) {
    const sanitized = sanitizeWorkerOutputForEvidence({ artifactBytes: bytes, observation: successfulActualObservation() }, context);
    assert.equal(sanitized.artifactBytes, null);
    if (expected === 'ORACLE_LEAK_TOKEN') assert.equal(sanitized.observation.oracle_scan_passed, false, expected);
    else if (expected === 'CREDENTIAL_LEAK') assert.equal(sanitized.observation.credential_scan_passed, false, expected);
    else if (expected === 'ARTIFACT_BUDGET') assert.equal(sanitized.observation.budget_exceeded, true, expected);
    else if (expected === 'UTF8' || expected === 'CONTENT_ENCODING') assert.equal(sanitized.observation.malformed_event_count, 1, expected);
    else assert.equal(sanitized.observation.content_scan_passed, false, expected);
  }
});

test('V16 complete registration, source snapshot, dry manifest, and trace are content safe', () => {
  const { context } = validateCorpus({ repoRoot: ROOT });
  const { registrationDocument, snapshotDocument } = loadRouteContract({ repoRoot: ROOT });
  assert.doesNotThrow(() => assertRouteContentSafe(registrationDocument.bytes, context, 'registration'));
  assert.doesNotThrow(() => assertRouteContentSafe(snapshotDocument.bytes, context, 'source snapshot'));
  const { evidenceDir } = officialDry('content-safe');
  for (const name of ['runner-manifest.json', 'trace.json', 'normalized-result.json', 'bridge-input.json']) {
    const bytes = readFileSync(join(evidenceDir, 'attempts', RC3_DRY_RUN_ID, name));
    assert.doesNotThrow(() => assertRouteContentSafe(bytes, context, name));
  }
});

test('V16 actual preparation starts from a fresh seed and detects overwrite attempts', () => {
  const { evidenceDir, root } = officialDry('fresh-seed');
  const runRoot = join(root, 'actual-seed');
  const prepared = prepareActualWorkspace({ evidenceDir, repoRoot: ROOT, runRoot });
  assert.equal(prepared.bridgeInput.attempt_id, RC3_ACTUAL_ID);
  assert.throws(() => prepareActualWorkspace({ evidenceDir, repoRoot: ROOT, runRoot }), (error) => error.code === 'DIRECTORY_NOT_EMPTY');
});

test('V16 scans the complete serialized worker input with only registered container paths allowed', () => {
  const { evidenceDir, root } = officialDry('worker-input-scan');
  const prepared = prepareActualWorkspace({ evidenceDir, repoRoot: ROOT, runRoot: join(root, 'actual-seed') });
  const { context } = validateCorpus({ repoRoot: ROOT });
  const workerInput = {
    credentialPath: '/credentials/.credentials.yaml',
    lockDirectory: '/locks',
    maxTokens: 4096,
    model: 'gpt-5.6-sol',
    profileDirectory: '/opt/recursus-profile',
    provider: 'openai-codex',
    reasoningEffort: 'xhigh',
    request: prepared.requestBytes.toString('utf8'),
    seedWorkspace: '/seed',
    timeoutMs: 120000,
  };
  assert.doesNotThrow(() => assertRouteContentSafe(canonicalBytes(workerInput), context, 'serialized worker input'));
  for (const privatePath of [
    'C:\\Users\\Synthetic\\profile',
    'C:/seed/private.txt',
    'file:///seed/private.txt',
    '/seed/../../home/synthetic/private.txt',
    '/input/worker-input.json/../../home/synthetic/private.txt',
    '/seed/C:\\Users\\Synthetic\\secret.txt',
    Buffer.from('C:\\Users\\Synthetic\\encoded.txt', 'utf8').toString('base64'),
    Buffer.from([...Buffer.from('C:\\Users\\Synthetic\\nested.txt', 'utf8')].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''), 'utf8').toString('base64'),
    [...Buffer.from(Buffer.from('C:\\Users\\Synthetic\\reverse-nested.txt', 'utf8').toString('base64'), 'utf8')].map((byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''),
    ...[';', '!', '?', ')', ']', '}', ',', ' '].map((separator) => `/seed${separator}/home/synthetic/private.txt`),
  ]) {
    assert.throws(() => assertRouteContentSafe(canonicalBytes({ ...workerInput, profileDirectory: privatePath }), context, 'serialized worker input'), (error) => error.code === 'PRIVATE_PATH_LEAK');
  }
});

test('V16 detects a real post-seed mutation before terminal derivation', () => {
  const { evidenceDir, root } = officialDry('real-seed-mutation');
  const runRoot = join(root, 'actual-seed');
  const prepared = prepareActualWorkspace({ evidenceDir, repoRoot: ROOT, runRoot });
  const firstSeedFile = prepared.preTree.files[0].path;
  const firstSeedTarget = join(runRoot, ...firstSeedFile.split('/'));
  const seedHardlink = join(root, 'seed-hardlink.txt');
  linkSync(firstSeedTarget, seedHardlink);
  const { context } = validateCorpus({ repoRoot: ROOT });
  assert.throws(() => RC3_INTERNALS_FOR_TESTS.preparedWorkspaceMutated(prepared, runRoot, context), (error) => error.code === 'HARDLINK');
  rmSync(seedHardlink);
  writeFileSync(join(runRoot, ...firstSeedFile.split('/')), 'synthetic mutation\n', 'utf8');
  const mutated = RC3_INTERNALS_FOR_TESTS.preparedWorkspaceMutated(prepared, runRoot, context);
  assert.equal(mutated, true);
  assert.deepEqual(deriveTerminal('actual', { ...successfulActualObservation(), unexpected_external_mutation: mutated, workspace_unchanged: !mutated }), { reason: 'unexpected_external_mutation', status: 'incomplete' });
});

test('V16 closes the complete actual staging-root topology', () => {
  const root = tempRoot('staging-topology');
  const credentialHome = join(root, 'credential');
  const attemptRoot = join(root, 'attempt');
  const layout = {
    auth: join(attemptRoot, 'authentication'),
    input: join(attemptRoot, 'input'),
    locks: join(attemptRoot, 'locks'),
    output: join(attemptRoot, 'output'),
    root: attemptRoot,
  };
  mkdirSync(credentialHome);
  mkdirSync(attemptRoot);
  for (const directory of [layout.auth, layout.input, layout.locks, layout.output]) mkdirSync(directory);
  const runnerInputBytes = canonicalBytes({ synthetic: true });
  const authenticationBytes = Buffer.from('{}\n', 'utf8');
  const proxyBytes = Buffer.from('[]\n', 'utf8');
  const relayBytes = Buffer.from('[]\n', 'utf8');
  const workerObservationBytes = Buffer.from('{}\n', 'utf8');
  writeFileSync(join(credentialHome, '.credentials.yaml'), 'synthetic-placeholder\n', 'utf8');
  writeFileSync(join(layout.auth, 'authentication-status.json'), authenticationBytes);
  writeFileSync(join(layout.input, 'worker-input.json'), runnerInputBytes);
  writeFileSync(join(layout.output, 'worker-observation.json'), workerObservationBytes);
  writeFileSync(join(layout.root, 'authority-proxy-events.json'), proxyBytes);
  writeFileSync(join(layout.root, 'authority-relay-events.json'), relayBytes);
  const { context } = validateCorpus({ repoRoot: ROOT });
  const expected = { authenticationBytes, proxyBytes, relayBytes, runnerInputBytes };
  const initial = RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, expected, true, context);
  assert.equal(initial.valid, true);
  const sealed = { ...expected, outputFiles: initial.outputFiles };
  assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, true);

  for (const [pathValue, original, mutated] of [
    [join(layout.auth, 'authentication-status.json'), authenticationBytes, Buffer.from('{"mutated":true}\n', 'utf8')],
    [join(layout.input, 'worker-input.json'), runnerInputBytes, canonicalBytes({ synthetic: false })],
    [join(layout.output, 'worker-observation.json'), workerObservationBytes, Buffer.from('{"mutated":true}\n', 'utf8')],
    [join(layout.root, 'authority-proxy-events.json'), proxyBytes, Buffer.from('[{"mutated":true}]\n', 'utf8')],
    [join(layout.root, 'authority-relay-events.json'), relayBytes, Buffer.from('[{"mutated":true}]\n', 'utf8')],
  ]) {
    writeFileSync(pathValue, mutated);
    assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, false);
    writeFileSync(pathValue, original);
  }

  for (const [label, target] of [
    ['credential', join(credentialHome, '.credentials.yaml')],
    ['authentication', join(layout.auth, 'authentication-status.json')],
    ['input', join(layout.input, 'worker-input.json')],
    ['proxy', join(layout.root, 'authority-proxy-events.json')],
    ['relay', join(layout.root, 'authority-relay-events.json')],
    ['output', join(layout.output, 'worker-observation.json')],
  ]) {
    const hardlink = join(root, `${label}-hardlink`);
    linkSync(target, hardlink);
    assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, false);
    rmSync(hardlink);
    assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, true);
  }

  writeFileSync(join(layout.locks, 'unexpected.lock'), 'synthetic mutation\n', 'utf8');
  assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, false);
  rmSync(join(layout.locks, 'unexpected.lock'));
  writeFileSync(join(layout.root, 'unexpected.txt'), 'synthetic mutation\n', 'utf8');
  assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.inspectExternalMountTopology(layout, credentialHome, sealed, true, context).valid, false);
  rmSync(join(layout.root, 'unexpected.txt'));
});

test('V16 capture roots reject overlap and retry gate rejects reservations or attempts', () => {
  const root = tempRoot('roots');
  const repo = join(root, 'repo');
  const credential = join(root, 'credential');
  const evidence = join(root, 'evidence');
  const seed = join(root, 'seed');
  const attempt = join(root, 'attempt');
  for (const pathValue of [repo, credential, evidence, seed, attempt]) mkdirSync(pathValue);
  assert.doesNotThrow(() => assertCaptureRootsDisjoint({ attemptRoot: attempt, credentialHome: credential, evidenceDir: evidence, repoRoot: repo, runRoot: seed }));
  assert.throws(() => assertCaptureRootsDisjoint({ attemptRoot: join(seed, 'nested'), credentialHome: credential, evidenceDir: evidence, repoRoot: repo, runRoot: seed }), (error) => error.code === 'CAPTURE_ROOT_OVERLAP');
  const commaPath = join(root, 'attempt,comma');
  mkdirSync(commaPath);
  assert.throws(() => assertCaptureRootsDisjoint({ attemptRoot: commaPath, credentialHome: credential, evidenceDir: evidence, repoRoot: repo, runRoot: seed }), (error) => error.code === 'CAPTURE_PATH');
  if (process.platform === 'win32') {
    assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.normalizedBindSource('C:\\Synthetic\\Path'), 'c:/synthetic/path');
    assert.equal(RC3_CAPTURE_INTERNALS_FOR_TESTS.normalizedBindSource('c:/synthetic/path'), 'c:/synthetic/path');
  }
  assert.doesNotThrow(() => requireDryOnlyEvidence({ actual_attempt_count: 0, dry_run_count: 1, reservation_count: 0 }));
  assert.throws(() => requireDryOnlyEvidence({ actual_attempt_count: 0, dry_run_count: 1, reservation_count: 1 }), (error) => error.code === 'ACTUAL_ALREADY_RECORDED');
});

test('V16 rejects junction roots, path aliases, and hard-linked evidence files', (t) => {
  const root = tempRoot('linked-paths');
  const repo = join(root, 'repo');
  const credential = join(root, 'credential');
  const evidence = join(root, 'evidence');
  const seed = join(root, 'seed');
  const attempt = join(root, 'attempt');
  for (const pathValue of [repo, credential, evidence, seed, attempt]) mkdirSync(pathValue);
  assert.throws(() => assertCaptureRootsDisjoint({ attemptRoot: attempt, credentialHome: credential, evidenceDir: join(seed, '..', 'seed'), repoRoot: repo, runRoot: seed }), (error) => error.code === 'CAPTURE_ROOT_OVERLAP');
  const junction = join(root, 'seed-junction');
  try {
    symlinkSync(seed, junction, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => assertCaptureRootsDisjoint({ attemptRoot: attempt, credentialHome: credential, evidenceDir: evidence, repoRoot: repo, runRoot: junction }), (error) => error.code === 'CAPTURE_PATH');
  } catch (error) {
    if (error?.code === 'EPERM') t.skip('Host policy does not allow creating the test junction.');
    else throw error;
  }

  const dry = officialDry('hardlink-evidence');
  const artifact = join(dry.evidenceDir, 'attempts', RC3_DRY_RUN_ID, 'artifacts', 'assistant-output.md');
  linkSync(artifact, join(dry.root, 'artifact-hardlink.md'));
  assert.throws(() => validateRouteEvidence({ evidenceDir: dry.evidenceDir, repoRoot: ROOT }), (error) => error.code === 'REFERENCE_TYPE');
});

test('V16 instruments dry-run and validation against external execution surfaces', () => {
  const require = createRequire(import.meta.url);
  const calls = [];
  const originals = [];
  const deny = (label) => (..._args) => {
    calls.push(label);
    throw new Error(`denied external surface: ${label}`);
  };
  const instrument = (moduleName, names) => {
    const module = require(moduleName);
    for (const name of names) {
      if (typeof module[name] !== 'function') continue;
      originals.push([module, name, module[name]]);
      module[name] = deny(`${moduleName}.${name}`);
    }
  };
  instrument('node:child_process', ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync']);
  instrument('node:http', ['get', 'request']);
  instrument('node:https', ['get', 'request']);
  instrument('node:net', ['connect', 'createConnection']);
  instrument('node:tls', ['connect']);
  instrument('node:dgram', ['createSocket']);
  instrument('node:dns', ['lookup', 'resolve', 'resolve4', 'resolve6']);
  instrument('node:worker_threads', ['Worker']);
  const globalOriginals = [];
  for (const name of ['fetch', 'WebSocket', 'EventSource']) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    globalOriginals.push([name, descriptor]);
    Object.defineProperty(globalThis, name, { configurable: true, value: deny(`globalThis.${name}`), writable: true });
  }
  syncBuiltinESMExports();
  try {
    const { evidenceDir } = officialDry('instrumented-denial');
    assert.equal(validateRouteEvidence({ evidenceDir, repoRoot: ROOT }).actual_attempt_count, 0);
  } finally {
    for (const [module, name, value] of originals) module[name] = value;
    for (const [name, descriptor] of globalOriginals) {
      if (descriptor === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, descriptor);
    }
    syncBuiltinESMExports();
  }
  assert.deepEqual(calls, []);
});

test('V16 offline entrypoint sources contain no direct external-surface invocations', () => {
  for (const pathValue of ['lib/recursus-route-v16.mjs', 'prepare-recursus-route-v16.mjs', 'verify-recursus-route-v16.mjs']) {
    const source = readFileSync(join(ROOT, ...pathValue.split('/')), 'utf8');
    assert.doesNotMatch(source, /node:(?:child_process|http|https|net|tls|dns|dgram)|from ['"](?:http|https|net|tls|dns|dgram)['"]/u);
    assert.doesNotMatch(source, /new\s+OpenAICodexAdapter|import\(['"]@deepseek-ai\/|(?:launch|open)(?:Browser|Plugin)|(?:send|start)(?:Telemetry|Analytics)|autoUpdate\s*\(/u);
  }
  const capture = readFileSync(join(ROOT, 'lib', 'recursus-route-capture-v16.mjs'), 'utf8');
  assert.match(capture, /spawnSync/u);
  assert.match(capture, /assertRouteContentSafe\(runnerInputBytes, corpusContext, 'serialized worker input'\)/u);
  assert.doesNotMatch(capture, /codex(?:\.exe)?['"]|claude(?:\.exe)?['"]/iu);
});
