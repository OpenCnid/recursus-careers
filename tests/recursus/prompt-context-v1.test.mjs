import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import fs, {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync as nativeRmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath, pathToFileURL } from 'node:url';
import workerThreads from 'node:worker_threads';

import {
  PromptContextV1Error,
  canonicalJsonV1,
  comparePromptContext,
  compilePromptContext,
  decodeRouteBundle,
  planCompilationArtifacts,
  projectRouteBundle,
  runRegisteredNegativeCase,
  sha256V1,
  validatePromptContextPackage,
  validateRegisteredNegativeCases,
  writeCompilationArtifacts,
} from '../../lib/recursus/prompt-context-v1.mjs';
import { runPromptContextV1Cli } from '../../scripts/recursus/verify-prompt-context-v1.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '..', '..');
const PACKAGE_ROOT = join(ROOT, 'evals', 'recursus', 'rc4-prompt-context-v2');
const MODES = ['oferta', 'pdf', 'cover', 'email'];
const TARGETS = ['co-claude-code-reference-v1', 'recursus-direct-v1'];
const POSITIVE_FIXTURES = MODES.flatMap((mode) => [
  mode + '-ordinary',
  mode + '-injection',
  mode + '-budget',
]);
const NON_CLAIM = 'Structural prompt and context parity validated. No runner, provider, model, workflow behavior, factuality, safety, quality, feature-parity, or comparative claim was verified.';

function cleanup(pathValue) {
  nativeRmSync(pathValue, { force: true, maxRetries: 10, recursive: true, retryDelay: 50 });
}

function tempRoot(prefix = 'rc4-prompt-context-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function captureStream() {
  let text = '';
  return {
    stream: {
      write(chunk) {
        text += String(chunk);
        return true;
      },
    },
    text: () => text,
  };
}

function walkFiles(root, prefix = '') {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const pathValue = join(root, entry.name);
    const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) output.push(...walkFiles(pathValue, relativePath));
    else output.push({ path: relativePath, bytes: readFileSync(pathValue) });
  }
  return output;
}

function copyFileIntoRepo(sourceRoot, destinationRoot, relativePath) {
  const source = join(sourceRoot, ...relativePath.split('/'));
  const destination = join(destinationRoot, ...relativePath.split('/'));
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}

function makeIsolatedRepo() {
  const root = tempRoot('rc4-isolated-repo-');
  const snapshot = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'source-snapshot.json'), 'utf8'));
  const packageRelative = 'evals/recursus/rc4-prompt-context-v2';
  mkdirSync(join(root, 'evals', 'recursus'), { recursive: true });
  cpSync(PACKAGE_ROOT, join(root, ...packageRelative.split('/')), { recursive: true });
  copyFileIntoRepo(ROOT, root, 'lib/recursus/prompt-context-v1.mjs');
  for (const source of snapshot.files) {
    if (source.path_or_mount.startsWith('synthetic://')) continue;
    assert.match(
      source.path_or_mount,
      /^(?:AGENTS\.md|\.agents\/skills\/career-ops\/SKILL\.md|modes\/(?:_shared|_writing|oferta|pdf|cover|email)\.md|evals\/recursus\/career-bench-v1\/(?:candidates\/(?:conflicted\/(?:cv|story-summary)|grounded\/(?:cv|profile)|sparse\/cv)|jobs\/(?:FACT-01|FACT-03|NOSUB-01|SAFE-01))\.md|lib\/recursus\/prompt-context-v1\.mjs)$/u,
      'isolated fixture copies only the registered RC-4 allowlist',
    );
    copyFileIntoRepo(ROOT, root, source.path_or_mount);
  }
  return root;
}

async function importIsolatedLibrary(repoRoot, label) {
  const modulePath = join(repoRoot, 'lib', 'recursus', 'prompt-context-v1.mjs');
  return import(pathToFileURL(modulePath).href + '?case=' + encodeURIComponent(label));
}

function readJson(pathValue) {
  return JSON.parse(readFileSync(pathValue, 'utf8'));
}

function writeCanonical(pathValue, value) {
  writeFileSync(pathValue, canonicalJsonV1(value));
}

function registrationRefs(registration) {
  return [
    registration.source_snapshot_ref,
    ...registration.schema_refs,
    ...registration.mode_manifest_refs,
    ...registration.adapter_manifest_refs,
    registration.fixture_set_ref,
  ];
}

function refreshRegistrationRef(repoRoot, relativePath) {
  const registrationPath = join(repoRoot, 'evals', 'recursus', 'rc4-prompt-context-v2', 'registration.json');
  const registration = readJson(registrationPath);
  const ref = registrationRefs(registration).find((candidate) => candidate.path === relativePath);
  assert.ok(ref, 'registered ref exists for ' + relativePath);
  const bytes = readFileSync(join(repoRoot, ...relativePath.split('/')));
  ref.byte_count = bytes.length;
  ref.sha256 = sha256V1(bytes);
  writeCanonical(registrationPath, registration);
}

function mutateRegisteredJson(repoRoot, relativePath, mutate) {
  const pathValue = join(repoRoot, ...relativePath.split('/'));
  const value = readJson(pathValue);
  mutate(value);
  writeCanonical(pathValue, value);
  refreshRegistrationRef(repoRoot, relativePath);
}

function replaceRegisteredSourceBytes(repoRoot, sourceId, bytes) {
  const packageRelative = 'evals/recursus/rc4-prompt-context-v2';
  const snapshotRelative = packageRelative + '/source-snapshot.json';
  const snapshot = readJson(join(repoRoot, ...snapshotRelative.split('/')));
  const source = snapshot.files.find((entry) => entry.id === sourceId);
  assert.ok(source, 'source snapshot contains ' + sourceId);
  const sourcePath = join(repoRoot, ...source.path_or_mount.split('/'));
  writeFileSync(sourcePath, bytes);
  source.byte_count = bytes.length;
  source.sha256 = sha256V1(bytes);
  writeCanonical(join(repoRoot, ...snapshotRelative.split('/')), snapshot);
  refreshRegistrationRef(repoRoot, snapshotRelative);

  for (const modeId of MODES) {
    const modeRelative = packageRelative + '/modes/' + modeId + '.json';
    const modePath = join(repoRoot, ...modeRelative.split('/'));
    const mode = readJson(modePath);
    const lists = [
      mode.ordered_system_sources,
      mode.permitted_profile_sources,
      mode.permitted_task_sources,
      ...mode.conditional_system_sources.map((entry) => [entry.source]),
    ];
    let changed = false;
    for (const list of lists) {
      const match = list.find((entry) => entry.id === sourceId);
      if (match) {
        match.byte_count = bytes.length;
        match.sha256 = source.sha256;
        changed = true;
      }
    }
    if (changed) {
      writeCanonical(modePath, mode);
      refreshRegistrationRef(repoRoot, modeRelative);
    }
  }

  const fixturesRelative = packageRelative + '/fixtures/invocations.json';
  const fixturesPath = join(repoRoot, ...fixturesRelative.split('/'));
  const fixtures = readJson(fixturesPath);
  const fixtureSource = fixtures.source_registry.find((entry) => entry.id === sourceId);
  if (fixtureSource) {
    fixtureSource.byte_count = bytes.length;
    fixtureSource.sha256 = source.sha256;
    writeCanonical(fixturesPath, fixtures);
    refreshRegistrationRef(repoRoot, fixturesRelative);
  }
}

function oneDifference(value, mutate) {
  const result = clone(value);
  mutate(result);
  return result;
}

async function expectRc4Error(action, expectedCode = null) {
  await assert.rejects(
    Promise.resolve().then(action),
    (error) => {
      assert.ok(error instanceof PromptContextV1Error, 'expected PromptContextV1Error, received ' + error?.constructor?.name);
      if (expectedCode !== null) assert.equal(error.code, expectedCode);
      assert.match(error.code, /^[A-Z][A-Z0-9_]*$/u);
      return true;
    },
  );
}

async function expectIsolatedRc4Error(action, expectedCode = null, message = undefined) {
  await assert.rejects(
    Promise.resolve().then(action),
    (error) => {
      assert.equal(error?.name, 'PromptContextV1Error');
      assert.match(error.code, /^[A-Z][A-Z0-9_]*$/u);
      if (expectedCode !== null) assert.equal(error.code, expectedCode);
      assertSafeDiagnostic(canonicalJsonV1(error.toJSON()) + error.message);
      return true;
    },
    message,
  );
}

function assertSafeDiagnostic(text) {
  const posixPrivatePath = ['', 'Users', 'SyntheticPerson', 'secret.txt'].join('/');
  const windowsPrivatePath = ['C:', 'Users', 'SyntheticPerson', 'secret.txt'].join('\\');
  for (const protectedValue of [
    posixPrivatePath,
    windowsPrivatePath,
    'RC4-PROTECTED-CANDIDATE-CONTENT',
    'RC4-PROTECTED-TASK-CONTENT',
    'sk-synthetic-private-value-1234567890',
    'Bearer synthetic-private-token',
    'evidence-v17-final',
  ]) assert.equal(text.includes(protectedValue), false, 'diagnostic excludes ' + protectedValue.slice(0, 12));
  assert.doesNotMatch(text, /at file:|prompt block content|candidate content|task content/iu);
}

function taskBlock(compiled) {
  const blocks = compiled.blocks.filter((block) => block.layer === 'data.task');
  assert.equal(blocks.length, 1);
  return blocks[0];
}

function parityView(compiled) {
  return {
    blocks: compiled.blocks,
    canonical_compilation_digest: compiled.digests.compilation.sha256,
    context_budget: compiled.context_budget,
    language_policy: compiled.language_policy,
    mode: compiled.mode,
    output_contract: compiled.output_contract,
    task_occurrence_count: compiled.task_occurrence_count,
    tool_capability_profile: compiled.tool_capability_profile,
    workflow: compiled.workflow,
  };
}

function domainDigest(domain, value) {
  return sha256V1(canonicalJsonV1({ domain, value, version: '1.0.0' }));
}

function resealRouteBundle(bundle) {
  const projection = { ...bundle };
  delete projection.route_bundle_digest;
  bundle.route_bundle_digest.sha256 = domainDigest('rc4.route-bundle', projection);
  return bundle;
}

function resealRoutePart(part) {
  const bytes = canonicalJsonV1(part.semantic_envelope);
  part.semantic_envelope_sha256 = sha256V1(bytes);
  part.semantic_envelope_byte_count = Buffer.byteLength(bytes, 'utf8');
  part.semantic_envelope_character_count = [...bytes].length;
  return part;
}

function compiledProjection(compiled) {
  return {
    schema_version: compiled.schema_version,
    compiled_prompt_id: compiled.compiled_prompt_id,
    compiled_prompt_version: compiled.compiled_prompt_version,
    compiler: compiled.compiler,
    registration: compiled.registration,
    source_snapshot: compiled.source_snapshot,
    mode: compiled.mode,
    workflow: compiled.workflow,
    router: compiled.router,
    invocation: compiled.invocation,
    fixture: compiled.fixture,
    output_contract: compiled.output_contract,
    language_policy: compiled.language_policy,
    tool_capability_profile: compiled.tool_capability_profile,
    context_budget: compiled.context_budget,
    blocks: compiled.blocks,
    task_occurrence_count: compiled.task_occurrence_count,
    digests: {
      source_closure: compiled.digests.source_closure,
      invariant_system: compiled.digests.invariant_system,
      task_payload: compiled.digests.task_payload,
      profile_context: compiled.digests.profile_context,
    },
  };
}

function blockIdentity(block) {
  return {
    id: block.id,
    version: block.version,
    ordinal: block.ordinal,
    layer: block.layer,
    authority: block.authority,
    trust: block.trust,
    source_id: block.source_id,
    source_path_or_mount: block.source_path_or_mount,
    source_class: block.source_class,
    visibility: block.visibility,
    source_hash: block.source_hash,
    normalization_rule_id: block.normalization_rule_id,
    normalized_content_hash: block.normalized_content_hash,
    digest_projection_id: block.digest_projection_id,
    required: block.required,
    budget_policy: block.budget_policy,
    budget_action: block.budget_action,
    content_byte_count: block.content_byte_count,
    content_character_count: block.content_character_count,
    character_count_unit: block.character_count_unit,
    byte_count_unit: block.byte_count_unit,
  };
}

function resealCompiled(compiled) {
  const invariant = compiled.blocks.filter((block) => block.layer === 'system.invariant');
  const profiles = compiled.blocks.filter((block) => block.layer === 'context.profile');
  const task = compiled.blocks.find((block) => block.layer === 'data.task');
  compiled.digests.source_closure = {
    projection_id: 'rc4-source-closure-digest-v1',
    sha256: domainDigest('rc4.source-closure', compiled.blocks.map((block) => ({
    id: block.id,
    source_id: block.source_id,
    source_path_or_mount: block.source_path_or_mount,
    source_hash: block.source_hash,
    normalized_content_hash: block.normalized_content_hash,
    }))),
  };
  compiled.digests.invariant_system = {
    projection_id: 'rc4-invariant-system-digest-v1',
    sha256: domainDigest('rc4.invariant-system', invariant.map(blockIdentity)),
  };
  compiled.digests.task_payload = {
    projection_id: 'rc4-task-payload-digest-v1',
    sha256: domainDigest('rc4.task-payload', blockIdentity(task)),
  };
  compiled.digests.profile_context = {
    projection_id: 'rc4-profile-context-digest-v1',
    sha256: domainDigest('rc4.profile-context', profiles.map(blockIdentity)),
  };
  compiled.digests.compilation.sha256 = domainDigest('rc4.compilation', compiledProjection(compiled));
  return compiled;
}

function replaceBlockContent(block, content) {
  block.content = content;
  block.content_byte_count = Buffer.byteLength(content, 'utf8');
  block.content_character_count = [...content].length;
  block.normalized_content_hash = sha256V1(Buffer.from(content, 'utf8'));
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const nested of Object.values(value)) assertDeepFrozen(nested, seen);
}

test('canonical JSON v1 is code-point safe, sorted, LF terminated, and deterministic', () => {
  const value = { z: '\u{1F680}', a: { '\u00e9': 1, 'e\u0301': 2 }, array: [3, 2, 1] };
  const first = canonicalJsonV1(value);
  const second = canonicalJsonV1(clone(value));
  assert.equal(first, second);
  assert.equal(first.endsWith('\n'), true);
  assert.equal(first.includes('\r'), false);
  assert.ok(first.indexOf('"a"') < first.indexOf('"z"'));
  assert.deepEqual(JSON.parse(first), value);
});

test('canonical JSON fails closed on unsupported values and structural bounds', async () => {
  const cycle = {};
  cycle.self = cycle;
  let deep = 'leaf';
  for (let index = 0; index < 70; index++) deep = { nested: deep };
  for (const value of [
    cycle,
    { value: BigInt(1) },
    { value: Number.NaN },
    { value: '\uD800' },
    { value: 'x'.repeat((2 * 1024 * 1024) + 1) },
    Array.from({ length: 8193 }, (_value, index) => index),
    deep,
  ]) await expectRc4Error(() => canonicalJsonV1(value));
});

test('implementation import graph is dependency-free and excludes forbidden runtime surfaces', () => {
  for (const relativePath of [
    'lib/recursus/prompt-context-v1.mjs',
    'scripts/recursus/verify-prompt-context-v1.mjs',
  ]) {
    const source = readFileSync(join(ROOT, ...relativePath.split('/')), 'utf8');
    const imports = [...source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/gu)].map((match) => match[2]);
    for (const specifier of imports) {
      assert.doesNotMatch(specifier, /(?:child_process|diagnostics_channel|dns|dgram|http|https|net|tls|worker_threads|playwright|puppeteer|openai|anthropic|provider|browser|plugin|opentelemetry|sentry|telemetry)/iu);
      assert.ok(specifier.startsWith('.') || specifier.startsWith('node:'), 'no external dependency import: ' + specifier);
    }
    assert.doesNotMatch(source, /process\.env|globalThis\.fetch|\bfetch\s*\(|WebSocket|EventSource/gu);
  }
});

test('complete registered package validates with exact bounded identities and isolation closure', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  assertDeepFrozen(context);
  assert.deepEqual(Object.keys(context.modes).sort(), [...MODES].sort());
  assert.deepEqual(Object.keys(context.adapters).sort(), [...TARGETS].sort());
  assert.deepEqual(
    context.fixtures.invocations.map((fixture) => fixture.fixture_id).sort(),
    [...POSITIVE_FIXTURES].sort(),
  );
  assert.equal(context.registration.synthetic, true);
  assert.equal(context.registration.canonical_serialization, 'recursus-canonical-json-v1');
  assert.equal(
    context.schemas.registration.$id,
    'https://career-ops.test/schemas/recursus/rc4/prompt-context-v2/registration.schema.json',
  );
  assert.ok(canonicalJsonV1(context.registration.nonclaims).includes(NON_CLAIM));

  const serialized = canonicalJsonV1({
    registration: context.registration,
    source_snapshot: context.source_snapshot,
    modes: context.modes,
    adapters: context.adapters,
    fixtures: context.fixtures,
  });
  for (const evaluatorOnlyToken of [
    'ACTION-RECORD-01',
    'ARTIFACT-SUMMARY-01',
    'ACTION-RECORD-SUBMIT-01',
    'fixture-local',
    'REC-BENCH-LEAK-CANARY',
    'truth-oracle',
    'action-oracle',
    '/scenarios/',
    '/oracles/',
    '/evaluator-fixtures/',
  ]) assert.equal(serialized.includes(evaluatorOnlyToken), false, 'excluded evaluator token: ' + evaluatorOnlyToken);
  for (const userLayer of [
    'modes/_profile.md',
    'modes/_custom.md',
    'modes/_brief.md',
    'voice-dna.md',
    'config/profile.yml',
    'credentials',
  ]) assert.equal(serialized.includes(userLayer), false, 'excluded user layer: ' + userLayer);
  for (const source of context.source_snapshot.files) {
    const lowerPath = source.path_or_mount.toLowerCase();
    for (const forbiddenPath of [
      'modes/_profile.md',
      'modes/_custom.md',
      'modes/_brief.md',
      'voice-dna.md',
      'config/profile.yml',
      'reports/',
      'data/',
      'documents/',
    ]) {
      assert.equal(lowerPath === forbiddenPath || lowerPath.startsWith(forbiddenPath), false);
    }
    if (source.path_or_mount.toLowerCase().endsWith('/cv.md')) {
      assert.match(
        source.path_or_mount,
        /^evals\/recursus\/career-bench-v1\/candidates\/(?:conflicted|grounded|sparse)\/cv\.md$/u,
      );
    }
  }
});

test('all modes and every positive fixture compile once and project to identical decoded semantics', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const invariantByMode = new Map();
  for (const fixtureId of POSITIVE_FIXTURES) {
    const modeId = fixtureId.split('-')[0];
    const compiled = await compilePromptContext({ mode_id: modeId, fixture_id: fixtureId, context });
    assert.equal(compiled.mode.id, modeId);
    assert.equal(compiled.fixture.id, fixtureId);
    assert.equal(compiled.fixture.synthetic, true);
    assert.equal(compiled.validation.status, 'pass');
    assert.deepEqual(compiled.validation.issues, []);
    assert.equal(compiled.context_budget.capacity_utf8_bytes, 196608);
    assert.equal(compiled.context_budget.all_must_keep_present, true);
    assert.equal(compiled.context_budget.overflow_action, 'fail');
    assert.equal(compiled.context_budget.used_utf8_bytes <= compiled.context_budget.capacity_utf8_bytes, true);
    assert.equal(compiled.blocks.some((block) => block.layer === 'context.memory'), false);
    assert.deepEqual(compiled.blocks.map((block) => block.ordinal), compiled.blocks.map((_block, index) => index));
    assert.ok(compiled.blocks.every((block) =>
      block.required === true &&
      block.budget_policy === 'must_keep' &&
      block.budget_action === 'keep' &&
      block.delivery === 'inline'));

    const task = taskBlock(compiled);
    assert.equal(compiled.task_occurrence_count, 1);
    assert.equal(task.authority, 'data');
    assert.equal(task.trust, 'external_untrusted');
    assert.equal(compiled.blocks.filter((block) => block.content === task.content).length, 1);
    assert.equal(compiled.blocks.some((block) => block !== task && block.content.includes(task.content)), false);

    const invariantText = compiled.blocks
      .filter((block) => block.layer === 'system.invariant')
      .map((block) => block.content)
      .join('\n');
    for (const profile of compiled.blocks.filter((block) => block.layer === 'context.profile')) {
      assert.equal(profile.authority, 'reference');
      assert.notEqual(profile.trust, 'system_owned');
      assert.equal(invariantText.includes(profile.content), false);
    }
    const priorInvariant = invariantByMode.get(modeId);
    if (priorInvariant === undefined) invariantByMode.set(modeId, compiled.digests.invariant_system.sha256);
    else assert.equal(compiled.digests.invariant_system.sha256, priorInvariant);

    const views = [];
    for (const targetId of TARGETS) {
      const bundle = projectRouteBundle({ compiled_prompt: compiled, target_id: targetId, context });
      assert.equal(bundle.target_route.id, targetId);
      assert.equal(bundle.canonical_compilation.sha256, compiled.digests.compilation.sha256);
      assert.equal(bundle.parts.length, compiled.blocks.length);
      assert.deepEqual(bundle.parts.map((part) => part.ordinal), compiled.blocks.map((_block, index) => index));
      assert.ok(bundle.parts.every((part) => part.delivery === 'inline' && part.part_count === 1));
      const registeredRules = context.adapters[targetId].permitted_transformation_rule_ids;
      assert.ok(registeredRules.length > 0);
      assert.ok(context.adapters[targetId].transformation_rules.every((rule) =>
        registeredRules.includes(rule.id) &&
        rule.reversible === true &&
        rule.semantic_change === false));
      assert.ok(bundle.parts.every((part) => registeredRules.includes(part.transformation_rule_id)));
      views.push(decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context }));
    }
    assert.deepEqual(views[0], views[1]);
    assert.deepEqual(views[0], parityView(compiled));

    const compared = await comparePromptContext({ mode_id: modeId, fixture_id: fixtureId, context });
    assert.equal(compared.status, 'pass');
    assert.equal(compared.compilation_digest, compiled.digests.compilation.sha256);
    assert.deepEqual(compared.target_ids, TARGETS);
    assert.deepEqual(compared.views[0], compared.views[1]);
    assert.equal(compared.non_claim, NON_CLAIM);
  }
});

test('compare implementation compiles a canonical document once before both projections', () => {
  const source = readFileSync(join(ROOT, 'lib', 'recursus', 'prompt-context-v1.mjs'), 'utf8');
  const start = source.indexOf('export async function comparePromptContext');
  const end = source.indexOf('\nfunction validationResult', start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.equal((body.match(/compilePromptContext\s*\(/gu) ?? []).length, 1);
  assert.equal((body.match(/projectRouteBundle\s*\(/gu) ?? []).length, 1);
});

test('two distinct output roots receive byte-identical deterministic artifacts', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'oferta',
    fixture_id: 'oferta-ordinary',
    context,
  });
  for (const targetId of TARGETS) {
    const parent = tempRoot('rc4-artifacts-');
    const outputA = join(parent, 'first');
    const outputB = join(parent, 'second');
    try {
      for (const outputRoot of [outputA, outputB]) {
        const plan = await planCompilationArtifacts({
          compiled_prompt: compiled,
          target_id: targetId,
          output_root: outputRoot,
          context,
        });
        assert.equal(Object.isFrozen(plan), true);
        assert.equal(Object.isFrozen(plan.files), true);
        await writeCompilationArtifacts(plan);
      }
      const first = walkFiles(outputA);
      const second = walkFiles(outputB);
      assert.deepEqual(first.map((file) => file.path), second.map((file) => file.path));
      assert.equal(first.length, 3);
      for (let index = 0; index < first.length; index++) {
        assert.equal(Buffer.compare(first[index].bytes, second[index].bytes), 0);
        assert.equal(first[index].bytes.includes(13), false);
        assert.equal(first[index].bytes.at(-1), 10);
      }
    } finally {
      cleanup(parent);
    }
  }
});

test('artifact planning fails before writes for non-empty, overlap, races, and forged plans', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'pdf',
    fixture_id: 'pdf-budget',
    context,
  });
  const parent = tempRoot('rc4-output-refusals-');
  try {
    const nonempty = join(parent, 'nonempty');
    mkdirSync(nonempty);
    writeFileSync(join(nonempty, 'sentinel'), 'RC4-PROTECTED-TASK-CONTENT');
    await expectRc4Error(() => planCompilationArtifacts({
      compiled_prompt: compiled,
      target_id: TARGETS[0],
      output_root: nonempty,
      context,
    }), 'RC4_OUTPUT_NOT_EMPTY');
    assert.equal(readFileSync(join(nonempty, 'sentinel'), 'utf8'), 'RC4-PROTECTED-TASK-CONTENT');

    const fileRoot = join(parent, 'file-not-directory');
    writeFileSync(fileRoot, 'synthetic sentinel');
    await expectRc4Error(() => planCompilationArtifacts({
      compiled_prompt: compiled,
      target_id: TARGETS[0],
      output_root: fileRoot,
      context,
    }), 'RC4_OUTPUT_ROOT');

    for (const unsafeRoot of [
      'relative-output',
      ROOT,
      join(ROOT, 'evals', 'recursus', 'rc4-prompt-context-v2', 'output'),
      dirname(ROOT),
    ]) {
      await expectRc4Error(() => planCompilationArtifacts({
        compiled_prompt: compiled,
        target_id: TARGETS[0],
        output_root: unsafeRoot,
        context,
      }));
    }

    const raced = join(parent, 'raced');
    const plan = await planCompilationArtifacts({
      compiled_prompt: compiled,
      target_id: TARGETS[0],
      output_root: raced,
      context,
    });
    mkdirSync(raced);
    await expectRc4Error(() => writeCompilationArtifacts(plan), 'RC4_OUTPUT_RACE');
    assert.deepEqual(readdirSync(raced), []);
    await expectRc4Error(() => writeCompilationArtifacts({
      output_root: join(parent, 'forged'),
      root_existed: false,
      files: [],
    }), 'RC4_INVALID_WRITE_PLAN');
  } finally {
    cleanup(parent);
  }
});

test('write instrumentation proves containment and safe partial-failure cleanup', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'email',
    fixture_id: 'email-ordinary',
    context,
  });
  const parent = tempRoot('rc4-write-instrumentation-');
  const output = join(parent, 'contained-output');
  const plan = await planCompilationArtifacts({
    compiled_prompt: compiled,
    target_id: TARGETS[0],
    output_root: output,
    context,
  });
  const originalOpen = fs.promises.open;
  const observed = [];
  const isContained = (candidate) => {
    const rel = relative(output, resolve(String(candidate)));
    return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep));
  };
  fs.promises.open = async (...args) => {
    observed.push(resolve(String(args[0])));
    assert.equal(isContained(args[0]), true, 'write target stays inside explicit output root');
    return originalOpen(...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(
      () => fs.promises.open(join(parent, 'outside-canary.json'), 'wx'),
      /write target stays inside explicit output root/u,
    );
    const canaryCount = observed.length;
    await writeCompilationArtifacts(plan);
    assert.equal(observed.length, canaryCount + 3);
    assert.ok(observed.slice(canaryCount).every(isContained));
  } finally {
    fs.promises.open = originalOpen;
    syncBuiltinESMExports();
  }

  async function exercisePartialFailure(rootExisted, stage) {
    const target = join(parent, (rootExisted ? 'preexisting-' : 'created-') + stage);
    if (rootExisted) mkdirSync(target);
    const partialPlan = await planCompilationArtifacts({
      compiled_prompt: compiled,
      target_id: TARGETS[1],
      output_root: target,
      context,
    });
    const nativeOpen = fs.promises.open;
    let calls = 0;
    let injected = false;
    fs.promises.open = async (...args) => {
      calls++;
      if (stage === 'open' && calls === 2) {
        injected = true;
        throw new Error('injected open failure');
      }
      const handle = await nativeOpen(...args);
      if (calls !== 1 || stage === 'open') return handle;
      return {
        async stat() {
          return handle.stat();
        },
        async writeFile(...writeArgs) {
          if (stage === 'write') {
            injected = true;
            throw new Error('injected write failure');
          }
          return handle.writeFile(...writeArgs);
        },
        async sync() {
          if (stage === 'sync') {
            injected = true;
            throw new Error('injected sync failure');
          }
          return handle.sync();
        },
        async close() {
          await handle.close();
          if (stage === 'close') {
            injected = true;
            throw new Error('injected close failure');
          }
        },
      };
    };
    syncBuiltinESMExports();
    try {
      await expectRc4Error(() => writeCompilationArtifacts(partialPlan), 'RC4_WRITE_FAILED');
    } finally {
      fs.promises.open = nativeOpen;
      syncBuiltinESMExports();
    }
    assert.equal(injected, true, stage + ' failure hook was exercised');
    if (rootExisted) {
      assert.equal(existsSync(target), true);
      assert.deepEqual(readdirSync(target), []);
    } else {
      assert.equal(existsSync(target), false);
    }
  }

  try {
    for (const stage of ['open', 'write', 'sync', 'close']) {
      await exercisePartialFailure(false, stage);
      await exercisePartialFailure(true, stage);
    }
  } finally {
    cleanup(parent);
  }
});

test('write rejects output-root and ancestor replacement races at first and later opens', async (t) => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'pdf',
    fixture_id: 'pdf-ordinary',
    context,
  });
  let exercised = 0;
  for (const rootExisted of [false, true]) {
    for (const swapKind of ['root', 'ancestor']) {
      for (const swapAtOpen of [1, 2]) {
        const parent = tempRoot('rc4-output-swap-');
        const ancestor = join(parent, 'planned-parent');
        const output = join(ancestor, 'output');
        const displaced = join(parent, 'displaced-' + swapKind);
        const outside = join(parent, 'outside-' + swapKind);
        mkdirSync(ancestor);
        if (rootExisted) mkdirSync(output);
        if (swapKind === 'root') {
          mkdirSync(outside);
        } else {
          mkdirSync(join(outside, 'output'), { recursive: true });
        }
        const plan = await planCompilationArtifacts({
          compiled_prompt: compiled,
          target_id: TARGETS[0],
          output_root: output,
          context,
        });
        const nativeOpen = fs.promises.open;
        let calls = 0;
        let injected = false;
        fs.promises.open = async (...args) => {
          calls++;
          if (calls === swapAtOpen) {
            injected = true;
            if (swapKind === 'root') {
              renameSync(output, displaced);
              symlinkSync(outside, output, process.platform === 'win32' ? 'junction' : 'dir');
            } else {
              renameSync(ancestor, displaced);
              symlinkSync(outside, ancestor, process.platform === 'win32' ? 'junction' : 'dir');
            }
          }
          return nativeOpen(...args);
        };
        syncBuiltinESMExports();
        try {
          await expectRc4Error(() => writeCompilationArtifacts(plan), 'RC4_OUTPUT_RACE');
          exercised++;
          assert.equal(injected, true, 'replacement hook was exercised');
          const outsideRoot = swapKind === 'root' ? outside : join(outside, 'output');
          assert.deepEqual(readdirSync(outsideRoot), [], 'no artifact remains outside the planned physical root');
        } catch (error) {
          if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'UNKNOWN') throw error;
        } finally {
          fs.promises.open = nativeOpen;
          syncBuiltinESMExports();
          cleanup(parent);
        }
      }
    }
  }
  if (exercised === 0) t.skip('host does not permit source links or junctions');
});

test('linked output ancestors are rejected where the host supports links or junctions', async (t) => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'cover',
    fixture_id: 'cover-ordinary',
    context,
  });
  const parent = tempRoot('rc4-output-link-');
  const target = join(parent, 'real');
  const linked = join(parent, 'linked');
  mkdirSync(target);
  let supported = false;
  for (const type of process.platform === 'win32' ? ['junction', 'dir'] : ['dir']) {
    try {
      symlinkSync(target, linked, type);
      supported = true;
      break;
    } catch {
      // Try the next host-supported directory link kind.
    }
  }
  if (!supported) {
    cleanup(parent);
    t.skip('host does not permit directory links or junctions');
    return;
  }
  try {
    assert.equal(lstatSync(linked).isSymbolicLink(), true);
    await expectRc4Error(() => planCompilationArtifacts({
      compiled_prompt: compiled,
      target_id: TARGETS[1],
      output_root: join(linked, 'out'),
      context,
    }), 'RC4_LINK_FORBIDDEN');
  } finally {
    cleanup(parent);
  }
});

test('compiled prompt rejects stale, relabeled, duplicated, reordered, promoted, and changed semantics', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const base = await compilePromptContext({
    mode_id: 'oferta',
    fixture_id: 'oferta-injection',
    context,
  });
  const profileIndex = base.blocks.findIndex((block) => block.layer === 'context.profile');
  const taskIndex = base.blocks.findIndex((block) => block.layer === 'data.task');
  const outputIndex = base.blocks.findIndex((block) => block.layer === 'output.frame');
  assert.ok(profileIndex >= 0 && taskIndex >= 0 && outputIndex >= 0);

  const cases = [
    ['wrong source hash', (compiled) => { compiled.blocks[taskIndex].source_hash = '0'.repeat(64); }],
    ['wrong registration version', (compiled) => { compiled.registration.version = '99.0.0'; }],
    ['wrong snapshot version', (compiled) => { compiled.source_snapshot.version = '99.0.0'; }],
    ['self-resealed compiled prompt id', (compiled) => {
      compiled.compiled_prompt_id = 'compiled.forged.oferta-injection';
      resealCompiled(compiled);
    }],
    ['self-resealed compiler id', (compiled) => {
      compiled.compiler.id = 'forged-compiler';
      resealCompiled(compiled);
    }],
    ['self-resealed compiler version', (compiled) => {
      compiled.compiler.version = '9.9.9';
      resealCompiled(compiled);
    }],
    ['self-resealed block id', (compiled) => {
      compiled.blocks[profileIndex].id = 'context-profile.forged';
      resealCompiled(compiled);
    }],
    ['self-resealed block version', (compiled) => {
      compiled.blocks[profileIndex].version = '9.9.9';
      resealCompiled(compiled);
    }],
    ['self-resealed block required status', (compiled) => {
      compiled.blocks[profileIndex].required = false;
      resealCompiled(compiled);
    }],
    ['profile relabeled as memory', (compiled) => { compiled.blocks[profileIndex].layer = 'context.memory'; }],
    ['profile relabeled as task', (compiled) => { compiled.blocks[profileIndex].layer = 'data.task'; }],
    ['task dropped', (compiled) => {
      compiled.blocks.splice(taskIndex, 1);
      compiled.blocks.forEach((block, index) => { block.ordinal = index; });
    }],
    ['task duplicated', (compiled) => {
      const duplicate = clone(compiled.blocks[taskIndex]);
      duplicate.id += '.duplicate';
      compiled.blocks.splice(taskIndex + 1, 0, duplicate);
      compiled.blocks.forEach((block, index) => { block.ordinal = index; });
    }],
    ['task reordered without ordinal update', (compiled) => {
      [compiled.blocks[taskIndex], compiled.blocks[taskIndex - 1]] =
        [compiled.blocks[taskIndex - 1], compiled.blocks[taskIndex]];
    }],
    ['task promoted to system', (compiled) => {
      compiled.blocks[taskIndex].layer = 'system.invariant';
      compiled.blocks[taskIndex].authority = 'policy';
      compiled.blocks[taskIndex].trust = 'system_owned';
    }],
    ['candidate promoted to system with self-consistent digests', (compiled) => {
      compiled.blocks[profileIndex].layer = 'system.invariant';
      compiled.blocks[profileIndex].authority = 'policy';
      compiled.blocks[profileIndex].trust = 'system_owned';
      resealCompiled(compiled);
    }],
    ['task paraphrased with self-consistent hashes', (compiled) => {
      replaceBlockContent(compiled.blocks[taskIndex], 'Synthetic task meaning was silently changed.\n');
      resealCompiled(compiled);
    }],
    ['output frame paraphrased with self-consistent hashes', (compiled) => {
      replaceBlockContent(compiled.blocks[outputIndex], '{"meaning":"changed"}\n');
      resealCompiled(compiled);
    }],
    ['output contract changed with self-consistent block', (compiled) => {
      compiled.output_contract.id = 'unregistered-output-contract';
      replaceBlockContent(compiled.blocks[outputIndex], canonicalJsonV1(compiled.output_contract));
      resealCompiled(compiled);
    }],
    ['tool profile changed', (compiled) => {
      compiled.tool_capability_profile.allowed_tools.push('unregistered.synthetic.tool');
      resealCompiled(compiled);
    }],
    ['budget action changed', (compiled) => { compiled.blocks[profileIndex].budget_action = 'drop_optional'; }],
    ['memory block invented', (compiled) => {
      const invented = clone(compiled.blocks[profileIndex]);
      invented.id = 'memory.invented';
      invented.layer = 'context.memory';
      invented.authority = 'reference';
      invented.trust = 'memory_advisory';
      compiled.blocks.splice(profileIndex + 1, 0, invented);
      compiled.blocks.forEach((block, index) => { block.ordinal = index; });
    }],
    ['wrong compilation digest', (compiled) => { compiled.digests.compilation.sha256 = 'f'.repeat(64); }],
    ['unknown field', (compiled) => { compiled.unregistered_field = true; }],
  ];

  for (const [name, mutate] of cases) {
    const changed = clone(base);
    mutate(changed);
    await expectRc4Error(
      () => projectRouteBundle({
        compiled_prompt: changed,
        target_id: TARGETS[0],
        context,
      }),
    );
    assert.ok(name);
  }
});

test('registered negative mutations execute and match their exact expected errors', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const results = await validateRegisteredNegativeCases({ context });
  assert.equal(results.length, 5);
  assert.deepEqual(results.map((result) => result.case_id), [
    'oferta-missing-source',
    'pdf-missing-source',
    'cover-missing-source',
    'email-missing-source',
    'global-over-budget',
  ]);
  for (const negativeCase of context.fixtures.negative_cases) {
    const result = await runRegisteredNegativeCase({ case_id: negativeCase.case_id, context });
    assert.equal(result.status, 'pass');
    assert.equal(result.expected_error_code, negativeCase.expected_error_code);
    assert.equal(result.observed_error_code, negativeCase.expected_error_code);
  }
  await expectRc4Error(() => runRegisteredNegativeCase({
    case_id: 'unknown-negative-case',
    context,
  }), 'RC4_NEGATIVE_CASE_UNREGISTERED');
});

test('unregistered modes, aliases, fixtures, and targets fail closed', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  for (const modeId of ['auto-pipeline', 'interview-prep', 'unknown-mode']) {
    await expectRc4Error(() => compilePromptContext({
      mode_id: modeId,
      fixture_id: 'oferta-ordinary',
      context,
    }), 'RC4_MODE_UNREGISTERED');
  }
  for (const fixtureId of [
    'unknown-fixture',
    ...MODES.map((mode) => mode + '-missing-source'),
    'global-over-budget',
  ]) {
    await expectRc4Error(() => compilePromptContext({
      mode_id: fixtureId.startsWith('pdf-') ? 'pdf' :
        fixtureId.startsWith('cover-') ? 'cover' :
          fixtureId.startsWith('email-') ? 'email' : 'oferta',
      fixture_id: fixtureId,
      context,
    }), 'RC4_FIXTURE_UNREGISTERED');
  }
  const compiled = await compilePromptContext({
    mode_id: 'oferta',
    fixture_id: 'oferta-ordinary',
    context,
  });
  await expectRc4Error(() => projectRouteBundle({
    compiled_prompt: compiled,
    target_id: 'unregistered-target',
    context,
  }), 'RC4_TARGET_UNREGISTERED');
});

test('route decoder rejects changed content, block closure, order, authority, rules, policies, and bindings', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const compiled = await compilePromptContext({
    mode_id: 'email',
    fixture_id: 'email-injection',
    context,
  });
  const base = projectRouteBundle({
    compiled_prompt: compiled,
    target_id: TARGETS[0],
    context,
  });
  const taskIndex = base.parts.findIndex((part) => part.semantic_envelope.layer === 'data.task');
  const outputIndex = base.parts.findIndex((part) => part.semantic_envelope.layer === 'output.frame');
  const systemPart = base.parts.find((part) => part.semantic_envelope.layer === 'system.invariant');
  assert.ok(taskIndex >= 0 && outputIndex >= 0 && systemPart);

  const cases = [
    ['wrong route digest', (bundle) => { bundle.route_bundle_digest.sha256 = '0'.repeat(64); }],
    ['wrong canonical compilation digest', (bundle) => {
      bundle.canonical_compilation.sha256 = '1'.repeat(64);
      resealRouteBundle(bundle);
    }],
    ['self-resealed route bundle id', (bundle) => {
      bundle.route_bundle_id = 'bundle.forged.email-injection';
      resealRouteBundle(bundle);
    }],
    ['self-resealed decoder id', (bundle) => {
      bundle.inverse_decoder.id = 'forged-unregistered-decoder';
      resealRouteBundle(bundle);
    }],
    ['self-resealed decoder version', (bundle) => {
      bundle.inverse_decoder.version = '9.9.9';
      resealRouteBundle(bundle);
    }],
    ['self-resealed part id', (bundle) => {
      bundle.parts[0].part_id = 'part.forged.0';
      resealRouteBundle(bundle);
    }],
    ['self-resealed mapping projection', (bundle) => {
      bundle.parts[0].mapping_projection_id = 'forged-mapping-v1';
      resealRouteBundle(bundle);
    }],
    ['drop output block', (bundle) => {
      bundle.parts.splice(outputIndex, 1);
      bundle.parts.forEach((part, index) => {
        part.ordinal = index;
        part.canonical_block_ordinal = index;
        part.semantic_envelope.ordinal = index;
        resealRoutePart(part);
      });
      resealRouteBundle(bundle);
    }],
    ['invent semantic block', (bundle) => {
      const invented = clone(bundle.parts[outputIndex]);
      invented.canonical_block_id = 'output.invented';
      invented.semantic_envelope.id = 'output.invented';
      bundle.parts.push(invented);
      bundle.parts.forEach((part, index) => {
        part.ordinal = index;
        part.canonical_block_ordinal = index;
        part.semantic_envelope.ordinal = index;
        resealRoutePart(part);
      });
      resealRouteBundle(bundle);
    }],
    ['semantic order changed', (bundle) => {
      [bundle.parts[taskIndex], bundle.parts[taskIndex - 1]] =
        [bundle.parts[taskIndex - 1], bundle.parts[taskIndex]];
      bundle.parts.forEach((part, index) => {
        part.ordinal = index;
        part.canonical_block_ordinal = index;
        part.semantic_envelope.ordinal = index;
        resealRoutePart(part);
      });
      resealRouteBundle(bundle);
    }],
    ['task promoted out of task layer', (bundle) => {
      const part = bundle.parts[taskIndex];
      part.semantic_envelope.layer = 'system.invariant';
      part.semantic_envelope.authority = 'policy';
      part.semantic_envelope.trust = 'system_owned';
      part.target_field = systemPart.target_field;
      part.target_role = systemPart.target_role;
      bundle.task_occurrence_count = 0;
      resealRoutePart(part);
      resealRouteBundle(bundle);
    }],
    ['content paraphrased and self-rehashed', (bundle) => {
      const part = bundle.parts[taskIndex];
      replaceBlockContent(part.semantic_envelope, 'Synthetic task meaning was silently changed.\n');
      resealRoutePart(part);
      resealRouteBundle(bundle);
    }],
    ['unknown adapter', (bundle) => {
      bundle.adapter.id = 'unregistered-adapter';
      resealRouteBundle(bundle);
    }],
    ['unknown target', (bundle) => {
      bundle.target_route.id = 'unregistered-target';
      resealRouteBundle(bundle);
    }],
    ['unknown transformation rule', (bundle) => {
      bundle.parts[0].transformation_rule_id = 'RC4-XF-UNREGISTERED';
      resealRouteBundle(bundle);
    }],
    ['wrong target field', (bundle) => {
      bundle.parts[0].target_field = 'unregistered.target.field';
      resealRouteBundle(bundle);
    }],
    ['wrong target role', (bundle) => {
      bundle.parts[0].target_role = 'unregistered_role';
      resealRouteBundle(bundle);
    }],
    ['rule omitted', (bundle) => {
      delete bundle.parts[0].transformation_rule_id;
      resealRouteBundle(bundle);
    }],
    ['output meaning changed', (bundle) => {
      bundle.output_contract.id = 'unregistered-output-contract';
      resealRouteBundle(bundle);
    }],
    ['tool contract changed', (bundle) => {
      bundle.tool_capability_profile.allowed_tools.push('unregistered.synthetic.tool');
      resealRouteBundle(bundle);
    }],
    ['budget changed', (bundle) => {
      bundle.context_budget.capacity_utf8_bytes += 1;
      resealRouteBundle(bundle);
    }],
    ['unknown protocol deviation', (bundle) => {
      bundle.protocol_deviation_ids = ['RC4-DEV-UNREGISTERED'];
      resealRouteBundle(bundle);
    }],
    ['unknown field', (bundle) => {
      bundle.unregistered_field = true;
      resealRouteBundle(bundle);
    }],
  ];

  for (const [name, mutate] of cases) {
    const changed = clone(base);
    mutate(changed);
    await expectRc4Error(() => decodeRouteBundle({
      route_bundle: changed,
      compiled_prompt: compiled,
      context,
    }));
    assert.ok(name);
  }
});

test('CLI validates, compares, compiles in process, and emits only bounded deterministic output', async () => {
  for (const argv of [
    ['--help'],
    ['validate'],
    ['compare', '--mode', 'oferta', '--fixture', 'oferta-ordinary'],
  ]) {
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runPromptContextV1Cli({ argv, stdout: stdout.stream, stderr: stderr.stream, repoRoot: ROOT }), 0);
    assert.equal(stderr.text(), '');
    if (argv[0] === 'validate' || argv[0] === 'compare') assert.ok(stdout.text().includes(NON_CLAIM));
    assertSafeDiagnostic(stdout.text());
  }

  const parent = tempRoot('rc4-cli-compile-');
  const output = join(parent, 'artifacts');
  try {
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runPromptContextV1Cli({
      argv: [
        'compile',
        '--mode', 'pdf',
        '--fixture', 'pdf-ordinary',
        '--target', TARGETS[1],
        '--output', output,
      ],
      stdout: stdout.stream,
      stderr: stderr.stream,
      repoRoot: ROOT,
    }), 0);
    assert.equal(stderr.text(), '');
    assert.equal(stdout.text().includes(output), false);
    assert.match(stdout.text(), /Files=3\./u);
    assert.equal(walkFiles(output).length, 3);
  } finally {
    cleanup(parent);
  }
});

test('CLI argument failures are stable, nonzero, and content-safe', async () => {
  const privatePosix = ['', 'Users', 'SyntheticPerson', 'secret.txt'].join('/');
  const privateWindows = ['C:', 'Users', 'SyntheticPerson', 'secret.txt'].join('\\');
  const cases = [
    [],
    ['unknown'],
    ['--help', '--extra'],
    ['validate', '--extra'],
    ['compare', '--mode', 'oferta'],
    ['compare', '--mode', 'oferta', '--mode', 'pdf', '--fixture', 'oferta-ordinary'],
    ['compare', '--mode', privatePosix, '--fixture', 'oferta-ordinary'],
    ['compile', '--mode', 'pdf', '--fixture', 'pdf-ordinary', '--target', TARGETS[0], '--output'],
    ['compile', '--mode', 'pdf', '--fixture', 'pdf-ordinary', '--target', TARGETS[0], '--output', privateWindows],
  ];
  for (const argv of cases) {
    const outputs = [];
    for (let run = 0; run < 2; run++) {
      const stdout = captureStream();
      const stderr = captureStream();
      const exitCode = await runPromptContextV1Cli({
        argv,
        stdout: stdout.stream,
        stderr: stderr.stream,
        repoRoot: ROOT,
      });
      assert.notEqual(exitCode, 0);
      assert.equal(stdout.text(), '');
      assertSafeDiagnostic(stderr.text());
      assert.match(stderr.text(), /^\[RC4_[A-Z0-9_]+\](?: field=[A-Za-z0-9_.:[\]-]+)?\n$/u);
      outputs.push(stderr.text());
    }
    assert.equal(outputs[0], outputs[1]);
  }
});

test('help, validate, compare, and library read paths touch no filesystem mutation API', async () => {
  const methods = ['appendFile', 'copyFile', 'mkdir', 'open', 'rename', 'rm', 'unlink', 'writeFile'];
  const originals = [];
  const touched = [];
  const deny = (label) => async () => {
    touched.push(label);
    throw new Error('denied filesystem mutation');
  };
  for (const method of methods) {
    if (typeof fs.promises[method] === 'function') {
      originals.push([fs.promises, method, fs.promises[method]]);
      fs.promises[method] = deny('fs.promises.' + method);
    }
  }
  for (const method of ['appendFileSync', 'copyFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'writeFileSync']) {
    if (typeof fs[method] === 'function') {
      originals.push([fs, method, fs[method]]);
      fs[method] = () => {
        touched.push('fs.' + method);
        throw new Error('denied filesystem mutation');
      };
    }
  }
  syncBuiltinESMExports();
  try {
    const context = await validatePromptContextPackage({ repo_root: ROOT });
    const compiled = await compilePromptContext({
      mode_id: 'cover',
      fixture_id: 'cover-budget',
      context,
    });
    for (const targetId of TARGETS) {
      const bundle = projectRouteBundle({ compiled_prompt: compiled, target_id: targetId, context });
      decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context });
    }
    await comparePromptContext({ mode_id: 'cover', fixture_id: 'cover-budget', context });
    for (const argv of [
      ['--help'],
      ['validate'],
      ['compare', '--mode', 'cover', '--fixture', 'cover-budget'],
    ]) {
      const stdout = captureStream();
      const stderr = captureStream();
      assert.equal(await runPromptContextV1Cli({ argv, stdout: stdout.stream, stderr: stderr.stream, repoRoot: ROOT }), 0);
      assert.equal(stderr.text(), '');
    }
    assert.deepEqual(touched, []);
  } finally {
    for (const [object, method, original] of originals.reverse()) object[method] = original;
    syncBuiltinESMExports();
  }
});

test('all APIs avoid environment, network, DNS, sockets, TLS, UDP, workers, child processes, and runtime entrypoints', async () => {
  const touched = new Map();
  const touch = (label) => touched.set(label, (touched.get(label) ?? 0) + 1);
  const deny = (label) => () => {
    touch(label);
    throw new Error('denied forbidden surface');
  };
  const patches = [];
  const patchMethod = (object, method, label) => {
    if (!object || typeof object[method] !== 'function') return;
    const original = object[method];
    const denied = deny(label);
    object[method] = denied;
    assert.equal(object[method], denied, 'instrumented ' + label);
    patches.push([object, method, original, label]);
  };

  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;
  const globalDescriptors = new Map();
  const runtimeNames = ['browser', 'provider', 'plugin', 'telemetry'];
  const transportNames = ['WebSocket', 'EventSource'];
  try {
    for (const method of ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync']) {
      patchMethod(childProcess, method, 'child_process.' + method);
    }
    for (const method of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) {
      patchMethod(dns, method, 'dns.' + method);
      patchMethod(dns.promises, method, 'dns.promises.' + method);
    }
    for (const method of ['connect', 'createConnection']) patchMethod(net, method, 'net.' + method);
    patchMethod(net.Socket?.prototype, 'connect', 'net.Socket.connect');
    for (const method of ['get', 'request']) {
      patchMethod(http, method, 'http.' + method);
      patchMethod(https, method, 'https.' + method);
    }
    patchMethod(tls, 'connect', 'tls.connect');
    patchMethod(dgram, 'createSocket', 'dgram.createSocket');
    patchMethod(workerThreads, 'Worker', 'worker_threads.Worker');
    syncBuiltinESMExports();

    globalThis.fetch = deny('fetch');
    for (const name of transportNames) {
      globalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: deny(name),
        writable: true,
      });
    }
    for (const name of runtimeNames) {
      globalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          touch(name);
          throw new Error('denied runtime entrypoint');
        },
      });
    }
    process.env = new Proxy(originalEnv, {
      get() {
        touch('environment.get');
        throw new Error('denied environment read');
      },
      getOwnPropertyDescriptor() {
        touch('environment.descriptor');
        throw new Error('denied environment descriptor');
      },
      has() {
        touch('environment.has');
        throw new Error('denied environment membership');
      },
      ownKeys() {
        touch('environment.ownKeys');
        throw new Error('denied environment enumeration');
      },
    });

    for (const [object, method, _original, label] of patches) {
      assert.throws(() => object[method](), /denied forbidden surface/u);
      assert.equal(touched.get(label), 1);
    }
    assert.throws(() => globalThis.fetch(), /denied forbidden surface/u);
    for (const name of transportNames) assert.throws(() => globalThis[name](), /denied forbidden surface/u);
    for (const name of runtimeNames) assert.throws(() => void globalThis[name], /denied runtime entrypoint/u);
    assert.throws(() => void process.env.RC4_HARNESS_CANARY, /denied environment read/u);
    assert.throws(() => 'RC4_HARNESS_CANARY' in process.env, /denied environment membership/u);
    assert.throws(() => Reflect.ownKeys(process.env), /denied environment enumeration/u);
    assert.throws(() => Object.getOwnPropertyDescriptor(process.env, 'RC4_HARNESS_CANARY'), /denied environment descriptor/u);
    const baseline = new Map(touched);

    const context = await validatePromptContextPackage({ repo_root: ROOT });
    const compiled = await compilePromptContext({
      mode_id: 'email',
      fixture_id: 'email-budget',
      context,
    });
    for (const targetId of TARGETS) {
      const bundle = projectRouteBundle({ compiled_prompt: compiled, target_id: targetId, context });
      decodeRouteBundle({ route_bundle: bundle, compiled_prompt: compiled, context });
    }
    await comparePromptContext({ mode_id: 'email', fixture_id: 'email-budget', context });
    const stdout = captureStream();
    const stderr = captureStream();
    assert.equal(await runPromptContextV1Cli({
      argv: ['compare', '--mode', 'email', '--fixture', 'email-budget'],
      stdout: stdout.stream,
      stderr: stderr.stream,
      repoRoot: ROOT,
    }), 0);
    assert.equal(stderr.text(), '');
    assert.deepEqual(touched, baseline);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    for (const [object, method, original] of patches.reverse()) object[method] = original;
    syncBuiltinESMExports();
  }
});

test('protected content and leakage diagnostics fail closed without echoing bytes', async () => {
  const context = await validatePromptContextPackage({ repo_root: ROOT });
  const base = await compilePromptContext({
    mode_id: 'pdf',
    fixture_id: 'pdf-injection',
    context,
  });
  const taskIndex = base.blocks.findIndex((block) => block.layer === 'data.task');
  const protectedValues = [
    ['', 'Users', 'SyntheticPerson', 'secret.txt'].join('/'),
    ['C:', 'Users', 'SyntheticPerson', 'secret.txt'].join('\\'),
    'sk-synthetic-private-value-1234567890',
    'eyJ' + 'a'.repeat(24) + '.' + 'b'.repeat(12) + '.' + 'c'.repeat(12),
    'REC-BENCH-LEAK-CANARY',
    'synthetic/oracles/private.json',
    'modes/_profile.md',
    'evidence-v17-final',
  ];
  for (const protectedValue of protectedValues) {
    const changed = clone(base);
    replaceBlockContent(changed.blocks[taskIndex], protectedValue + '\n');
    resealCompiled(changed);
    let caught;
    try {
      projectRouteBundle({
        compiled_prompt: changed,
        target_id: TARGETS[0],
        context,
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof PromptContextV1Error);
    const rendered = canonicalJsonV1(caught.toJSON()) + caught.message;
    assert.equal(rendered.includes(protectedValue), false);
    assertSafeDiagnostic(rendered);
  }
});

test('isolated package rejects stale hashes, mixed versions, unknown fields, and malformed JSON bytes', async () => {
  const packageRelative = 'evals/recursus/rc4-prompt-context-v2';
  const cases = [
    ['source-hash', (root) => {
      const pathValue = join(root, 'evals', 'recursus', 'career-bench-v1', 'jobs', 'SAFE-01.md');
      writeFileSync(pathValue, Buffer.concat([readFileSync(pathValue), Buffer.from('changed\n')]));
    }],
    ['registration-version', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      const registration = readJson(pathValue);
      registration.registration_version = '99.0.0';
      writeCanonical(pathValue, registration);
    }],
    ['registration-status', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      const registration = readJson(pathValue);
      registration.status = 'mutable_draft';
      writeCanonical(pathValue, registration);
    }, 'RC4_REGISTRATION_STATUS'],
    ['snapshot-version', (root) => {
      mutateRegisteredJson(root, packageRelative + '/source-snapshot.json', (snapshot) => {
        snapshot.snapshot_version = '99.0.0';
      });
    }],
    ['unknown-registration-field', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      const registration = readJson(pathValue);
      registration.unregistered_field = true;
      writeCanonical(pathValue, registration);
    }],
    ['bom', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      writeFileSync(pathValue, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), readFileSync(pathValue)]));
    }],
    ['malformed-utf8', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      writeFileSync(pathValue, Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]));
    }],
    ['duplicate-json-key', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      const text = readFileSync(pathValue, 'utf8');
      writeFileSync(pathValue, text.replace(
        '"schema_version":"1.0.0"',
        '"schema_version":"1.0.0","schema_version":"1.0.0"',
      ));
    }],
    ['noncanonical-json', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      const registration = readJson(pathValue);
      writeFileSync(pathValue, JSON.stringify(registration, null, 2) + '\n');
    }],
    ['oversized-registration', (root) => {
      const pathValue = join(root, ...packageRelative.split('/'), 'registration.json');
      writeFileSync(pathValue, Buffer.alloc((4 * 1024 * 1024) + 1, 0x20));
    }],
  ];

  for (const [label, mutate, expectedCode = null] of cases) {
    const root = makeIsolatedRepo();
    try {
      mutate(root);
      const isolated = await importIsolatedLibrary(root, label);
      await expectIsolatedRc4Error(
        () => isolated.validatePromptContextPackage({ repo_root: root }),
        expectedCode,
        label,
      );
    } finally {
      cleanup(root);
    }
  }
});

test('isolated package rejects relabeled profile, task, memory, and evaluator-only material', async () => {
  const packageRelative = 'evals/recursus/rc4-prompt-context-v2';
  const cases = [
    ['profile-policy', (source) => {
      source.authority = 'policy';
      source.trust = 'system_owned';
      source.allowed_blocks = ['system.invariant'];
    }],
    ['task-policy', (source) => {
      source.authority = 'instruction';
      source.trust = 'system_owned';
      source.allowed_blocks = ['system.invariant'];
    }],
    ['memory-source', (source) => {
      source.trust = 'memory_advisory';
      source.allowed_blocks = ['context.memory'];
    }],
    ['oracle-identifier', (source) => {
      source.id = 'ACTION-RECORD-01';
    }],
    ['oracle-path', (source) => {
      source.path_or_mount = 'evals/recursus/career-bench-v1/oracles/synthetic.json';
    }],
  ];
  for (const [label, mutate] of cases) {
    const root = makeIsolatedRepo();
    try {
      mutateRegisteredJson(root, packageRelative + '/source-snapshot.json', (snapshot) => {
        const source = label.startsWith('task') || label.startsWith('oracle')
          ? snapshot.files.find((entry) => entry.id === 'SOURCE-JOB-SAFE-01')
          : snapshot.files.find((entry) => entry.id === 'SOURCE-GROUNDED-CV-01');
        mutate(source);
      });
      const isolated = await importIsolatedLibrary(root, label);
      await expectIsolatedRc4Error(() => isolated.validatePromptContextPackage({ repo_root: root }));
    } finally {
      cleanup(root);
    }
  }
});

test('isolated package rejects absolute, traversal, device, case-colliding, and Unicode-confusable paths', async () => {
  const packageRelative = 'evals/recursus/rc4-prompt-context-v2';
  const posixAbsolute = ['', 'Users', 'SyntheticPerson', 'secret.md'].join('/');
  const windowsAbsolute = ['C:', 'Users', 'SyntheticPerson', 'secret.md'].join('\\');
  const pathCases = [
    posixAbsolute,
    windowsAbsolute,
    '../escape.md',
    'jobs/../escape.md',
    './relative.md',
    'backslash\\source.md',
    'C:drive-relative.md',
    '\\root-relative.md',
    ['\\\\', 'server', 'share', 'source.md'].join('\\'),
    ['\\\\?', 'C:', 'source.md'].join('\\'),
    ['\\\\.', 'NUL'].join('\\'),
    'source.md:stream',
    'CON',
    'source. ',
    'modes\u2215oferta.md',
    'modes/cafe\u0301.md',
  ];
  for (let index = 0; index < pathCases.length; index++) {
    const root = makeIsolatedRepo();
    try {
      mutateRegisteredJson(root, packageRelative + '/source-snapshot.json', (snapshot) => {
        snapshot.files[0].path_or_mount = pathCases[index];
      });
      const isolated = await importIsolatedLibrary(root, 'path-' + index);
      await expectIsolatedRc4Error(() => isolated.validatePromptContextPackage({ repo_root: root }));
    } finally {
      cleanup(root);
    }
  }

  for (const [label, secondPath] of [
    ['case-collision', 'MODES/COVER.MD'],
    ['unicode-normalization-collision', 'modes/cafe\u0301.md'],
  ]) {
    const root = makeIsolatedRepo();
    try {
      mutateRegisteredJson(root, packageRelative + '/source-snapshot.json', (snapshot) => {
        snapshot.files[0].path_or_mount = label === 'unicode-normalization-collision' ? 'modes/caf\u00e9.md' : 'modes/cover.md';
        snapshot.files[1].path_or_mount = secondPath;
      });
      const isolated = await importIsolatedLibrary(root, label);
      await expectIsolatedRc4Error(() => isolated.validatePromptContextPackage({ repo_root: root }));
    } finally {
      cleanup(root);
    }
  }
});

test('isolated package validation rejects malformed, non-normalized, credential, and evaluator-only source content', async () => {
  const sourceCases = [
    ['malformed-source-utf8', Buffer.from([0xc3, 0x28, 0x0a]), null],
    ['crlf-source', Buffer.from('Synthetic source with CRLF.\r\n', 'utf8'), 'RC4_TEXT_NORMALIZATION'],
    ['oversized-source', Buffer.alloc((1024 * 1024) + 1, 0x61), null],
    ['bearer-credential', Buffer.from('Bearer synthetic-private-token\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['api-key-credential', Buffer.from('api_key = synthetic-private-key-12345\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['access-token-credential', Buffer.from('access_token: synthetic-access-token-12345\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['env-api-key-credential', Buffer.from('OPENAI_API_KEY=synthetic-private-key-12345\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['env-token-credential', Buffer.from('GITHUB_TOKEN=synthetic-private-token-12345\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['env-password-credential', Buffer.from('PASSWORD=synthetic-private-password-12345\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['basic-auth-credential', Buffer.from('Authorization: Basic dXNlcjpwYXNz\n', 'utf8'), 'RC4_CREDENTIAL_LEAK'],
    ['relative-oracle-path-content', Buffer.from('Review oracle/candidate-claims.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['relative-scenario-path-content', Buffer.from('Review scenarios/FACT-01.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['relative-evaluator-fixture-path-content', Buffer.from('Review evaluator-fixtures/passing-example.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['oracle-path-content', Buffer.from('Review evals/recursus/career-bench-v1/oracle/candidate-claims.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['scenario-path-content', Buffer.from('Review evals/recursus/career-bench-v1/scenarios/FACT-01.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['evaluator-fixture-path-content', Buffer.from('Review evals/recursus/career-bench-v1/evaluator-fixtures/passing-example.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['rc2-evidence-path-content', Buffer.from('Review evals/recursus/rc2-claude-code-reference-v4/evidence/attempt.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ['rc3-evidence-path-content', Buffer.from('Review evals/recursus/rc3-recursus-direct-v17/evidence/attempt.json.\n', 'utf8'), 'RC4_EVALUATOR_LEAK'],
    ...['FILE-006', 'FILE-007', 'FILE-008', 'FILE-009', 'FILE-014', 'FILE-015', 'FILE-016', 'FILE-017', 'FILE-018', 'FILE-019', 'FILE-020']
      .map((id) => ['evaluator-file-id-' + id, Buffer.from('Reference ' + id + '.\n', 'utf8'), 'RC4_EVALUATOR_LEAK']),
  ];
  for (const [label, bytes, expectedCode] of sourceCases) {
    const root = makeIsolatedRepo();
    try {
      replaceRegisteredSourceBytes(root, 'SOURCE-JOB-SAFE-01', bytes);
      const isolated = await importIsolatedLibrary(root, label);
      await expectIsolatedRc4Error(
        () => isolated.validatePromptContextPackage({ repo_root: root }),
        expectedCode,
      );
    } finally {
      cleanup(root);
    }
  }

  {
    const root = makeIsolatedRepo();
    try {
      const agentVisibleIds = 'FILE-001 FILE-002 FILE-003 FILE-004 FILE-005 FILE-010 FILE-011 FILE-012 FILE-013\n';
      replaceRegisteredSourceBytes(root, 'SOURCE-JOB-SAFE-01', Buffer.from(agentVisibleIds, 'utf8'));
      const isolated = await importIsolatedLibrary(root, 'agent-visible-file-ids');
      const context = await isolated.validatePromptContextPackage({ repo_root: root });
      assert.equal(context.registration.registration_id, 'RC4-PROMPT-CONTEXT-2026-08-25-V2');
    } finally {
      cleanup(root);
    }
  }

  for (const [label, token] of [
    ['evaluator-canary', 'REC-BENCH-LEAK-CANARY'],
    ['evaluator-id', 'ACTION-RECORD-01'],
    ['evaluator-claim-id', 'CLAIM-GROUNDED-01'],
    ['evaluator-class-id', 'CLASS-EVALUATOR-TRUTH-04'],
    ['evaluator-nosub-action-id', 'ACTION-NOSUB-SUBMIT-02'],
    ['evaluator-safe-action-id', 'ACTION-SAFE-ACCESS-01'],
    ['evaluator-digest', 'd805a61754bd4ccced2c89f7c5d74aa5bfac39cce4e94e5591aef4f451b85001'],
  ]) {
    const root = makeIsolatedRepo();
    try {
      mutateRegisteredJson(root, 'evals/recursus/rc4-prompt-context-v2/fixtures/invocations.json', (fixtures) => {
        fixtures.invocations.find((fixture) => fixture.fixture_id === 'oferta-injection')
          .invocation_metadata.objective = token;
      });
      const isolated = await importIsolatedLibrary(root, label);
      await expectIsolatedRc4Error(
        () => isolated.validatePromptContextPackage({ repo_root: root }),
        'RC4_EVALUATOR_LEAK',
        label,
      );
    } finally {
      cleanup(root);
    }
  }
});

test('isolated package rejects linked source files and linked source directories where supported', async (t) => {
  let exercised = 0;
  {
    const root = makeIsolatedRepo();
    const source = join(root, 'evals', 'recursus', 'career-bench-v1', 'jobs', 'SAFE-01.md');
    const backing = join(root, 'safe-source-backing.md');
    cpSync(source, backing);
    nativeRmSync(source);
    try {
      symlinkSync(backing, source, 'file');
      exercised++;
      const isolated = await importIsolatedLibrary(root, 'source-symlink');
      await expectIsolatedRc4Error(() => isolated.validatePromptContextPackage({ repo_root: root }), 'RC4_LINK_FORBIDDEN');
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'UNKNOWN') throw error;
    } finally {
      cleanup(root);
    }
  }
  {
    const root = makeIsolatedRepo();
    const sourceDirectory = join(root, 'evals', 'recursus', 'career-bench-v1', 'jobs');
    const backingDirectory = join(root, 'jobs-backing');
    cpSync(sourceDirectory, backingDirectory, { recursive: true });
    nativeRmSync(sourceDirectory, { recursive: true });
    try {
      symlinkSync(backingDirectory, sourceDirectory, process.platform === 'win32' ? 'junction' : 'dir');
      exercised++;
      const isolated = await importIsolatedLibrary(root, 'source-directory-link');
      await expectIsolatedRc4Error(() => isolated.validatePromptContextPackage({ repo_root: root }), 'RC4_LINK_FORBIDDEN');
    } catch (error) {
      if (error?.code !== 'EPERM' && error?.code !== 'EACCES' && error?.code !== 'UNKNOWN') throw error;
    } finally {
      cleanup(root);
    }
  }
  if (exercised === 0) t.skip('host does not permit source links or junctions');
});
