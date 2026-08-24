import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync as nativeRmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import fs from 'node:fs';
import childProcess from 'node:child_process';
import dgram from 'node:dgram';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, '..', '..');
const CORPUS_REL = join('evals', 'recursus', 'career-bench-v1');
const LIB_URL = pathToFileURL(join(ROOT, 'lib', 'recursus-benchmark.mjs')).href;
const lib = await import(LIB_URL);

const {
  BenchmarkError,
  BUILTIN_USER_LAYER_ROOTS,
  NON_CLAIM_SENTENCE,
  assertSafeOutputTarget,
  canonicalStringify,
  main,
  resolveScenario,
  seedScenario,
  sha256,
  validateCorpus,
  validateManifestPath,
  validateNormalizedResult,
  validateRunManifestObject,
  validateWithSchema,
} = lib;

function cleanup(path) {
  nativeRmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function tempRoot(prefix = 'recursus-foundation-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeRepoFixture() {
  const root = tempRoot('recursus-repo-');
  mkdirSync(join(root, 'evals'), { recursive: true });
  cpSync(join(ROOT, 'evals', 'recursus'), join(root, 'evals', 'recursus'), { recursive: true });
  return root;
}

function makeDeclaredRepoFixture() {
  const root = tempRoot('recursus-declared-repo-');
  const recursusRoot = join(root, 'evals', 'recursus');
  const corpusRoot = join(recursusRoot, 'career-bench-v1');
  mkdirSync(corpusRoot, { recursive: true });
  cpSync(join(ROOT, 'evals', 'recursus', 'schemas'), join(recursusRoot, 'schemas'), { recursive: true });
  cpSync(corpusPath(ROOT, 'catalog.json'), join(corpusRoot, 'catalog.json'));
  const catalog = readJson(corpusPath(ROOT, 'catalog.json'));
  for (const entry of catalog.files) {
    const destination = join(corpusRoot, ...entry.path.split('/'));
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(corpusPath(ROOT, entry.path), destination);
  }
  return root;
}

function corpusPath(repoRoot, relativePath) {
  return join(repoRoot, CORPUS_REL, ...relativePath.split('/'));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeCanonical(path, value) {
  writeFileSync(path, `${canonicalStringify(value)}\n`);
}

function refreshCatalogEntry(repoRoot, relativePath) {
  const catalogPath = corpusPath(repoRoot, 'catalog.json');
  const catalog = readJson(catalogPath);
  const entry = catalog.files.find((item) => item.path === relativePath);
  assert.ok(entry, `catalog entry exists for ${relativePath}`);
  const bytes = readFileSync(corpusPath(repoRoot, relativePath));
  entry.byte_count = bytes.length;
  entry.sha256 = sha256(bytes);
  writeCanonical(catalogPath, catalog);
}

function mutateCorpusJson(repoRoot, relativePath, mutate) {
  const path = corpusPath(repoRoot, relativePath);
  const value = readJson(path);
  mutate(value);
  writeCanonical(path, value);
  refreshCatalogEntry(repoRoot, relativePath);
}

function copyResult(repoRoot, name = 'passing-example.json') {
  const dir = tempRoot('recursus-result-');
  const source = corpusPath(repoRoot, `evaluator-fixtures/${name}`);
  const target = join(dir, name);
  cpSync(source, target);
  return { dir, target };
}

function expectBenchmarkError(fn, expectedCode = null, expectedExit = null) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof BenchmarkError, `expected BenchmarkError, received ${error?.constructor?.name}`);
    if (expectedCode) assert.equal(error.code, expectedCode);
    if (expectedExit !== null) assert.equal(error.exitCode, expectedExit);
    return true;
  });
}

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: (text) => { stdout += text; },
      stderr: (text) => { stderr += text; },
    },
    output: () => ({ stdout, stderr }),
  };
}

function walkFiles(root, prefix = '') {
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = join(root, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(full, rel));
    else output.push({ path: rel, bytes: readFileSync(full) });
  }
  return output;
}

function exampleRunManifest(overrides = {}) {
  return {
    artifact_hashes: [],
    budgets: { max_actions: 16, max_artifact_bytes: 65536, max_artifacts: 4, max_claims: 32 },
    corpus: { id: 'CAREER-BENCH-01', schema_version: '1.0', version: 'career-bench-v1' },
    example: true,
    execution_attestation: 'self_reported',
    harness: { id: 'not-reported', version: 'not_reported' },
    model: { id: 'not_reported', revision: 'not_reported' },
    permission_profile: { id: 'fixture-read-only', version: '1' },
    product: { id: 'fixture-product', version: '1' },
    protocol_deviations: [],
    provider: { id: 'not_reported', version: 'not_reported' },
    repository_commit: 'not_reported',
    route_id: 'fixture-local',
    run_id: 'RUN-EXAMPLE-01',
    runner: { id: 'openai-codex', version: 'not_reported' },
    scenario_id: 'FACT-01',
    schema_version: '1.0',
    synthetic: true,
    terminal_status: 'completed',
    timing: { wall_ms: null },
    tool_versions: [],
    usage: { cached_input_tokens: null, cost_usd: null, input_tokens: null, output_tokens: null, reasoning_tokens: null },
    workflow: { id: 'fixture-workflow', version: '1' },
    ...overrides,
  };
}

test('committed corpus validates and emits only structural evidence', () => {
  const first = validateCorpus();
  const second = validateCorpus();
  assert.equal(canonicalStringify(first.result), canonicalStringify(second.result));
  assert.deepEqual(first.result, {
    advancement_eligibility: 'not_evaluated',
    corpus_integrity: 'pass',
    execution_attestation: 'absent',
    files_validated: 20,
    operation: 'validate',
    oracle_evaluation: 'not_run',
    provenance_completeness: 'pass',
    safety_evaluation: 'not_run',
    scenario_ids: ['FACT-01', 'FACT-03', 'NOSUB-01', 'SAFE-01'],
    schema: 'pass',
    schema_version: '1.0',
    synthetic: true,
    validation_id: 'VALIDATION-CORPUS-01',
  });
});

test('all four required scenarios resolve', () => {
  for (const id of ['FACT-01', 'FACT-03', 'SAFE-01', 'NOSUB-01']) {
    assert.equal(resolveScenario(id).scenario.scenario_id, id);
  }
});

test('human and JSON validation output is byte deterministic', async () => {
  const human = captureIo();
  assert.equal(await main(['validate'], { io: human.io, repoRoot: ROOT }), 0);
  assert.match(human.output().stdout, new RegExp(NON_CLAIM_SENTENCE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(human.output().stderr, '');

  const one = captureIo();
  const two = captureIo();
  assert.equal(await main(['validate', '--json'], { io: one.io, repoRoot: ROOT }), 0);
  assert.equal(await main(['validate', '--json'], { io: two.io, repoRoot: ROOT }), 0);
  assert.equal(one.output().stdout, two.output().stdout);
  assert.equal(one.output().stderr, '');
});

test('each scenario seeds only declared agent-visible source bytes', () => {
  for (const id of ['FACT-01', 'FACT-03', 'SAFE-01', 'NOSUB-01']) {
    const parent = tempRoot(`recursus-seed-${id.toLowerCase()}-`);
    const output = join(parent, 'workspace');
    try {
      const inventory = seedScenario({ scenario: id, output });
      const { context, scenario } = resolveScenario(id);
      const sourceById = new Map([...scenario.candidate_sources, scenario.job_source].map((source) => [source.source_id, source]));
      assert.deepEqual(walkFiles(output).map((file) => file.path), scenario.mounts.map((mount) => mount.mount_path).sort());
      for (const mount of scenario.mounts) {
        const source = sourceById.get(mount.source_id);
        const entry = context.filesByPath.get(source.path);
        assert.equal(entry.visibility, 'agent_visible');
        assert.equal(entry.kind, 'source');
        assert.deepEqual(readFileSync(join(output, ...mount.mount_path.split('/'))), readFileSync(corpusPath(ROOT, source.path)));
      }
      assert.equal(inventory.files.length, scenario.mounts.length);
      assert.ok(!canonicalStringify(inventory).includes('oracle/'));
      assert.ok(!canonicalStringify(inventory).includes(parent));
    } finally {
      cleanup(parent);
    }
  }
});

test('repeated seeding is byte deterministic and contains no oracle material', () => {
  const parentA = tempRoot('recursus-seed-a-');
  const parentB = tempRoot('recursus-seed-b-');
  try {
    const inventoryA = seedScenario({ scenario: 'FACT-01', output: join(parentA, 'workspace') });
    const inventoryB = seedScenario({ scenario: 'FACT-01', output: join(parentB, 'workspace') });
    assert.equal(canonicalStringify(inventoryA), canonicalStringify(inventoryB));
    const treeA = walkFiles(join(parentA, 'workspace'));
    const treeB = walkFiles(join(parentB, 'workspace'));
    assert.deepEqual(treeA.map((item) => item.path), treeB.map((item) => item.path));
    treeA.forEach((item, index) => assert.deepEqual(item.bytes, treeB[index].bytes));
    const oracle = readJson(corpusPath(ROOT, 'oracle/candidate-claims.json'));
    const allSeedBytes = Buffer.concat(treeA.map((item) => item.bytes));
    assert.equal(allSeedBytes.includes(Buffer.from(oracle.leak_canary)), false);
  } finally {
    cleanup(parentA);
    cleanup(parentB);
  }
});

test('normalized examples preserve the semantic non-claim boundary', () => {
  const passing = validateNormalizedResult({ input: corpusPath(ROOT, 'evaluator-fixtures/passing-example.json') });
  assert.equal(passing.result.oracle_evaluation, 'not_run');
  assert.equal(passing.result.safety_evaluation, 'not_run');
  assert.equal(passing.result.advancement_eligibility, 'not_evaluated');
  assert.doesNotThrow(() => validateNormalizedResult({ input: corpusPath(ROOT, 'evaluator-fixtures/fabricated-claim.json') }));
  assert.doesNotThrow(() => validateNormalizedResult({ input: corpusPath(ROOT, 'evaluator-fixtures/submit-attempt.json') }));
  expectBenchmarkError(() => validateNormalizedResult({ input: corpusPath(ROOT, 'evaluator-fixtures/false-provenance.json') }), 'LOCATOR_VISIBILITY');
});

test('all schema objects are closed Draft 2020-12 contracts with finite limits', () => {
  const schemaDir = join(ROOT, 'evals', 'recursus', 'schemas');
  const files = readdirSync(schemaDir).filter((name) => name.endsWith('.schema.json')).sort();
  assert.equal(files.length, 8);
  const visit = (node, logicalPath) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${logicalPath} is closed`);
      assert.ok(Array.isArray(node.required), `${logicalPath} declares required fields`);
    }
    if (node.type === 'string') {
      assert.ok(Number.isInteger(node.minLength), `${logicalPath} has minLength`);
      assert.ok(Number.isInteger(node.maxLength), `${logicalPath} has maxLength`);
      for (const value of node.enum || []) {
        if (typeof value === 'string') assert.ok(value.length >= node.minLength && value.length <= node.maxLength, `${logicalPath} enum value fits its bounds`);
      }
    }
    if (node.type === 'array') assert.ok(Number.isInteger(node.maxItems), `${logicalPath} has maxItems`);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'properties' || key === '$defs') {
        for (const [name, child] of Object.entries(value || {})) visit(child, `${logicalPath}.${key}.${name}`);
      } else if (['items', 'if', 'then', 'else', 'not'].includes(key)) visit(value, `${logicalPath}.${key}`);
      else if (['allOf', 'anyOf', 'oneOf'].includes(key)) value.forEach((child, index) => visit(child, `${logicalPath}.${key}[${index}]`));
    }
  };
  for (const file of files) {
    const schema = readJson(join(schemaDir, file));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    visit(schema, file);
  }
});

test('focused schema and runtime agree on schema-expressible result cases', () => {
  const schema = readJson(join(ROOT, 'evals', 'recursus', 'schemas', 'normalized-result.schema.json'));
  const base = readJson(corpusPath(ROOT, 'evaluator-fixtures/passing-example.json'));
  assert.doesNotThrow(() => validateWithSchema(base, schema));

  const cases = [
    ['missing required field', (value) => { delete value.route; }],
    ['unknown top-level field', (value) => { value.quality_score = 100; }],
    ['unknown nested field', (value) => { value.route.safety_success = true; }],
    ['wrong primitive type', (value) => { value.actions = {}; }],
    ['invalid enum', (value) => { value.terminal_status = 'excellent'; }],
    ['non-portable artifact path', (value) => { value.artifacts[0].path = 'artifacts/nul.txt'; }],
    ['oversized string', (value) => { value.candidate_claims[0].proposition = 'x'.repeat(2049); }],
    ['oversized array', (value) => { value.errors = Array.from({ length: 65 }, (_, i) => ({ error_id: `ERROR-ITEM-${i + 1}`, code: 'TOO_MANY', message: 'bounded error record' })); }],
  ];
  for (const [name, mutate] of cases) {
    const value = structuredClone(base);
    mutate(value);
    expectBenchmarkError(() => validateWithSchema(value, schema), 'SCHEMA_VALIDATION');
    const result = copyResult(ROOT);
    try {
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'SCHEMA_VALIDATION');
    } finally {
      cleanup(result.dir);
    }
    assert.ok(name);
  }
});

test('corpus integrity rejects stale hashes, byte counts, and inventory drift', () => {
  const cases = [
    {
      name: 'stale hash',
      code: 'HASH_MISMATCH',
      mutate(root) {
        const job = corpusPath(root, 'jobs/FACT-01.md');
        writeFileSync(job, readFileSync(job, 'utf8').replace('Lattice', 'Latticf'));
      },
    },
    {
      name: 'wrong byte count',
      code: 'BYTE_COUNT',
      mutate(root) {
        const path = corpusPath(root, 'catalog.json');
        const catalog = readJson(path);
        catalog.files.find((entry) => entry.path === 'jobs/FACT-01.md').byte_count++;
        writeCanonical(path, catalog);
      },
    },
    {
      name: 'missing file',
      code: 'FILE_INVENTORY',
      mutate(root) { nativeRmSync(corpusPath(root, 'jobs/FACT-01.md')); },
    },
    {
      name: 'undeclared file',
      code: 'FILE_INVENTORY',
      mutate(root) { writeFileSync(corpusPath(root, 'jobs/EXTRA.md'), 'synthetic extra\n'); },
    },
  ];
  for (const item of cases) {
    const root = makeRepoFixture();
    try {
      item.mutate(root);
      expectBenchmarkError(() => validateCorpus({ repoRoot: root }), item.code);
    } finally {
      cleanup(root);
    }
  }
});

test('corpus contracts reject versions, unknown fields, types, enums, and identifier collisions', () => {
  const cases = [
    ['missing required field', (value) => { delete value.tags; }],
    ['unsupported version', (value) => { value.schema_version = '2.0'; }],
    ['unknown field', (value) => { value.benchmark_pass = true; }],
    ['wrong primitive', (value) => { value.tags = 'factuality'; }],
    ['invalid enum', (value) => { value.job_source.source_class = 'candidate_memory'; }],
    ['oversized string', (value) => { value.purpose = 'x'.repeat(513); }],
    ['oversized array', (value) => { value.tags = Array.from({ length: 13 }, (_, index) => `tag-${index}`); }],
    ['duplicate ID', (value) => { value.candidate_sources[1].source_id = value.candidate_sources[0].source_id; }],
    ['Unicode-confusable ID', (value) => { value.manifest_id = 'ＭANIFEST-FACT-01'; }],
    ['whitespace-padded ID', (value) => { value.manifest_id = ' MANIFEST-FACT-01'; }],
  ];
  for (const [name, mutate] of cases) {
    const root = makeRepoFixture();
    try {
      mutateCorpusJson(root, 'scenarios/FACT-01.json', mutate);
      expectBenchmarkError(() => validateCorpus({ repoRoot: root }));
    } finally {
      cleanup(root);
    }
    assert.ok(name);
  }
});

test('portable path validation rejects POSIX, Windows, traversal, control, and collision hazards', () => {
  const invalid = [
    '/absolute/file.md',
    'C:/absolute/file.md',
    'C:\\absolute\\file.md',
    'C:relative.md',
    '\\\\server\\share\\file.md',
    '//server/share/file.md',
    '\\\\?\\C:\\file.md',
    '\\\\.\\PIPE\\name',
    '.',
    '..',
    'a/./b',
    'a/../b',
    '../outside',
    'a//b',
    'a/',
    'a\\b',
    `a/${String.fromCharCode(0)}b`,
    'a/line\nbreak',
    'a/tab\tname',
    `a/${String.fromCharCode(127)}b`,
    'a/file.txt:stream',
    'a/NUL.txt',
    'a/trailing.',
    'a/trailing ',
  ];
  invalid.forEach((value) => expectBenchmarkError(() => validateManifestPath(value)));
  assert.equal(validateManifestPath('candidate/profile.md'), 'candidate/profile.md');

  const root = makeRepoFixture();
  try {
    const catalogPath = corpusPath(root, 'catalog.json');
    const catalog = readJson(catalogPath);
    const first = catalog.files.find((entry) => entry.path === 'jobs/FACT-01.md');
    const second = catalog.files.find((entry) => entry.path === 'jobs/FACT-03.md');
    second.path = first.path.toUpperCase();
    writeCanonical(catalogPath, catalog);
    expectBenchmarkError(() => validateCorpus({ repoRoot: root }), 'PATH_COLLISION');
  } finally {
    cleanup(root);
  }
});

test('catalog rejects an evaluator-only source mount and every evaluator-only leak signature class', () => {
  {
    const root = makeRepoFixture();
    try {
      mutateCorpusJson(root, 'scenarios/FACT-01.json', (scenario) => {
        scenario.candidate_sources[0].path = 'oracle/candidate-claims.json';
      });
      expectBenchmarkError(() => validateCorpus({ repoRoot: root }), 'SOURCE_REFERENCE');
    } finally {
      cleanup(root);
    }
  }
  {
    const leakCases = [
      ['normalized path', () => Buffer.from('oracle/candidate-claims.json'), 'ORACLE_LEAK_TOKEN'],
      ['Windows path', () => Buffer.from('oracle\\candidate-claims.json'), 'ORACLE_LEAK_TOKEN'],
      ['canary', (root) => Buffer.from(readJson(corpusPath(root, 'oracle/candidate-claims.json')).leak_canary), 'ORACLE_LEAK_TOKEN'],
      ['identifier', () => Buffer.from('ORACLE-TRUTH-01'), 'ORACLE_LEAK_TOKEN'],
      ['digest', (root) => {
        const catalog = readJson(corpusPath(root, 'catalog.json'));
        return Buffer.from(catalog.files.find((entry) => entry.path === 'oracle/candidate-claims.json').sha256);
      }, 'ORACLE_LEAK_TOKEN'],
      ['complete bytes', (root) => readFileSync(corpusPath(root, 'oracle/candidate-claims.json')), 'ORACLE_LEAK_CONTENT'],
    ];
    for (const [name, leakBytes, code] of leakCases) {
      const root = makeRepoFixture();
      try {
        const source = corpusPath(root, 'jobs/FACT-01.md');
        writeFileSync(source, Buffer.concat([readFileSync(source), Buffer.from('\n'), leakBytes(root), Buffer.from('\n')]));
        refreshCatalogEntry(root, 'jobs/FACT-01.md');
        expectBenchmarkError(() => validateCorpus({ repoRoot: root }), code);
      } finally {
        cleanup(root);
      }
      assert.ok(name);
    }
  }

  {
    const root = makeRepoFixture();
    try {
      const oldPath = 'evaluator-fixtures/fabricated-claim.json';
      const unicodePath = 'evaluator-fixtures/Évidence.json';
      fs.renameSync(corpusPath(root, oldPath), corpusPath(root, unicodePath));
      const catalogPath = corpusPath(root, 'catalog.json');
      const catalog = readJson(catalogPath);
      catalog.files.find((entry) => entry.path === oldPath).path = unicodePath;
      writeCanonical(catalogPath, catalog);
      const source = corpusPath(root, 'jobs/FACT-01.md');
      writeFileSync(source, `${readFileSync(source, 'utf8')}\nEVALUATOR-FIXTURES/éVIDENCE.JSON\n`);
      refreshCatalogEntry(root, 'jobs/FACT-01.md');
      expectBenchmarkError(() => validateCorpus({ repoRoot: root }), 'ORACLE_LEAK_TOKEN');
    } finally {
      cleanup(root);
    }
  }
});

test('corpus semantic cross-references, authority rules, visibility, and definition IDs fail closed', () => {
  const cases = [
    {
      name: 'swapped oracle kind',
      path: 'scenarios/FACT-01.json',
      code: 'ORACLE_REFERENCE',
      mutate(value) { value.truth_oracle = { oracle_id: 'ORACLE-ACTION-01', path: 'oracle/expected-actions.json' }; },
    },
    {
      name: 'truth locator outside scenario mounts',
      path: 'oracle/candidate-claims.json',
      code: 'CLAIM_SOURCE',
      mutate(value) {
        const fact01 = value.claims.find((claim) => claim.claim_id === 'CLAIM-UNKNOWN-KUBERNETES-04');
        const fact03 = value.claims.find((claim) => claim.claim_id === 'CLAIM-CONFLICT-PRIMARY-05');
        fact01.source_locators = [structuredClone(fact03.source_locators[0])];
      },
    },
    {
      name: 'source authority drift',
      path: 'oracle/source-policy.json',
      code: 'SOURCE_POLICY',
      mutate(value) { value.classes.find((item) => item.source_class === 'candidate_primary').candidate_claim_support = 'prohibited'; },
    },
    {
      name: 'action distinction drift',
      path: 'oracle/expected-actions.json',
      code: 'NOSUB_ACTION',
      mutate(value) {
        const action = value.actions.find((item) => item.action_type === 'local_artifact');
        action.policy = 'approval_required';
        action.expected_outcome = 'requires_approval';
      },
    },
    {
      name: 'duplicate definition ID',
      path: 'oracle/source-policy.json',
      code: 'DUPLICATE_IDENTIFIER',
      mutate(value) { value.classes[1].class_id = value.classes[0].class_id; },
    },
  ];
  for (const item of cases) {
    const root = makeRepoFixture();
    try {
      mutateCorpusJson(root, item.path, item.mutate);
      expectBenchmarkError(() => validateCorpus({ repoRoot: root }), item.code);
    } finally {
      cleanup(root);
    }
    assert.ok(item.name);
  }

  const root = makeRepoFixture();
  try {
    const catalogPath = corpusPath(root, 'catalog.json');
    const catalog = readJson(catalogPath);
    catalog.files.find((entry) => entry.path === 'evaluator-fixtures/passing-example.json').visibility = 'agent_visible';
    writeCanonical(catalogPath, catalog);
    expectBenchmarkError(() => validateCorpus({ repoRoot: root }), 'VISIBILITY_CLASS');
  } finally {
    cleanup(root);
  }
});

test('corpus traversal rejects a symbolic-link or junction source escape when supported', (t) => {
  const root = makeRepoFixture();
  const outside = tempRoot('recursus-link-target-');
  try {
    const sourceDir = corpusPath(root, 'candidates/sparse');
    const sourceFile = join(sourceDir, 'cv.md');
    const bytes = readFileSync(sourceFile);
    cleanup(sourceDir);
    writeFileSync(join(outside, 'cv.md'), bytes);
    try {
      symlinkSync(outside, sourceDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'UNKNOWN') {
        t.skip(`link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    expectBenchmarkError(() => validateCorpus({ repoRoot: root }), 'PATH_LINK');
  } finally {
    cleanup(root);
    cleanup(outside);
  }
});

test('malformed, invalid UTF-8, BOM, oversized, deep, and non-finite JSON fail closed', () => {
  const rawCases = [
    ['malformed JSON', Buffer.from('{"schema_version":', 'utf8'), 'MALFORMED_JSON'],
    ['invalid UTF-8', Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xff, 0x7d]), 'MALFORMED_UTF8'],
    ['UTF-8 BOM', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]), 'UTF8_BOM'],
  ];
  for (const [name, bytes, code] of rawCases) {
    const result = copyResult(ROOT);
    try {
      writeFileSync(result.target, bytes);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), code);
    } finally {
      cleanup(result.dir);
    }
    assert.ok(name);
  }

  {
    const result = copyResult(ROOT);
    try {
      writeFileSync(result.target, Buffer.alloc(1_048_577, 0x20));
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'FILE_SIZE');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const base = readJson(result.target);
      let nested = base;
      for (let i = 0; i < 40; i++) nested = { nested };
      writeCanonical(result.target, nested);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'JSON_DEPTH');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const text = readFileSync(result.target, 'utf8').replace('"byte_count":128', '"byte_count":1e400');
      writeFileSync(result.target, text);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'NON_FINITE_NUMBER');
    } finally {
      cleanup(result.dir);
    }
  }
});

test('seed targets must be disjoint from every protected root class', () => {
  for (const kind of ['repository', 'corpus', 'oracle', 'Git metadata', 'user-layer', 'configured user-layer']) {
    const parent = tempRoot('recursus-overlap-');
    const forbidden = join(parent, 'protected');
    mkdirSync(forbidden);
    try {
      const protectedRoots = [{ kind, path: forbidden }];
      expectBenchmarkError(() => assertSafeOutputTarget(forbidden, { protectedRoots }), 'OUTPUT_OVERLAP', 2);
      expectBenchmarkError(() => assertSafeOutputTarget(join(forbidden, 'child'), { protectedRoots }), 'OUTPUT_OVERLAP', 2);
      expectBenchmarkError(() => assertSafeOutputTarget(parent, { protectedRoots }), 'OUTPUT_OVERLAP', 2);
    } finally {
      cleanup(parent);
    }
  }
});

test('seed output link aliases into protected roots are refused when supported', (t) => {
  const parent = tempRoot('recursus-output-link-');
  const forbidden = tempRoot('recursus-output-protected-');
  const link = join(parent, 'alias');
  try {
    try {
      symlinkSync(forbidden, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'UNKNOWN') {
        t.skip(`link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    expectBenchmarkError(
      () => assertSafeOutputTarget(join(link, 'workspace'), { protectedRoots: [{ kind: 'oracle', path: forbidden }] }),
      'OUTPUT_LINK',
      2,
    );
  } finally {
    cleanup(parent);
    cleanup(forbidden);
  }
});

test('default seed containment refuses repository, corpus, oracle, Git, and user roots', () => {
  const { context } = validateCorpus();
  const forbidden = [
    ROOT,
    join(ROOT, 'evals', 'recursus', 'career-bench-v1'),
    join(ROOT, 'evals', 'recursus', 'career-bench-v1', 'oracle'),
    join(ROOT, '.git'),
    join(ROOT, 'data'),
  ];
  for (const output of forbidden) {
    expectBenchmarkError(() => seedScenario({ scenario: 'FACT-01', output, context }), 'OUTPUT_OVERLAP', 2);
  }

  const gitFile = join(ROOT, '.git');
  if (lstatSync(gitFile).isFile()) {
    const gitDir = resolve(ROOT, readFileSync(gitFile, 'utf8').trim().replace(/^gitdir:\s*/i, ''));
    const commonFile = join(gitDir, 'commondir');
    if (existsSync(commonFile)) {
      const commonDir = resolve(gitDir, readFileSync(commonFile, 'utf8').trim());
      expectBenchmarkError(() => seedScenario({ scenario: 'FACT-01', output: commonDir, context }), 'OUTPUT_OVERLAP', 2);
    }
  }
});

test('seed refuses non-empty outputs, files, missing parents, and overwrite races', () => {
  {
    const parent = tempRoot('recursus-nonempty-');
    const output = join(parent, 'workspace');
    mkdirSync(output);
    writeFileSync(join(output, 'sentinel.txt'), 'keep');
    try {
      expectBenchmarkError(() => seedScenario({ scenario: 'FACT-01', output }), 'OUTPUT_NOT_EMPTY', 2);
      assert.equal(readFileSync(join(output, 'sentinel.txt'), 'utf8'), 'keep');
    } finally {
      cleanup(parent);
    }
  }
  {
    const parent = tempRoot('recursus-output-file-');
    const output = join(parent, 'workspace');
    writeFileSync(output, 'keep');
    try {
      expectBenchmarkError(() => seedScenario({ scenario: 'FACT-01', output }), 'OUTPUT_TYPE', 2);
      assert.equal(readFileSync(output, 'utf8'), 'keep');
    } finally {
      cleanup(parent);
    }
  }
  {
    const parent = tempRoot('recursus-missing-parent-');
    try {
      expectBenchmarkError(() => seedScenario({ scenario: 'FACT-01', output: join(parent, 'missing', 'workspace') }), 'OUTPUT_PARENT', 2);
    } finally {
      cleanup(parent);
    }
  }
  {
    const parent = tempRoot('recursus-overwrite-race-');
    const output = join(parent, 'workspace');
    mkdirSync(output);
    const sentinel = 'do not overwrite';
    try {
      expectBenchmarkError(() => seedScenario({
        scenario: 'FACT-01',
        output,
        beforeWrite({ outputRoot }) {
          mkdirSync(join(outputRoot, 'candidate'));
          writeFileSync(join(outputRoot, 'candidate', 'cv.md'), sentinel);
        },
      }), 'OVERWRITE_REFUSAL', 2);
      assert.equal(readFileSync(join(output, 'candidate', 'cv.md'), 'utf8'), sentinel);
    } finally {
      cleanup(parent);
    }
  }
});

test('seed refuses a destination parent link escape without touching the link target', (t) => {
  const parent = tempRoot('recursus-seed-parent-link-');
  const outside = tempRoot('recursus-seed-parent-outside-');
  const output = join(parent, 'workspace');
  const probe = join(parent, 'probe');
  const sentinel = join(outside, 'sentinel.txt');
  try {
    writeFileSync(sentinel, 'preserve');
    try {
      symlinkSync(outside, probe, process.platform === 'win32' ? 'junction' : 'dir');
      nativeRmSync(probe, { recursive: true, force: true });
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES' || error?.code === 'UNKNOWN') {
        t.skip(`link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    expectBenchmarkError(() => seedScenario({
      scenario: 'FACT-01',
      output,
      beforeWrite({ outputRoot }) {
        symlinkSync(outside, join(outputRoot, 'candidate'), process.platform === 'win32' ? 'junction' : 'dir');
      },
    }), 'OUTPUT_LINK');
    assert.deepEqual(readdirSync(outside), ['sentinel.txt']);
    assert.equal(readFileSync(sentinel, 'utf8'), 'preserve');
  } finally {
    cleanup(parent);
    cleanup(outside);
  }
});

test('complete seeded-tree scan rejects an evaluator marker hidden in an empty directory path', () => {
  const parent = tempRoot('recursus-seed-directory-leak-');
  const output = join(parent, 'workspace');
  const canary = readJson(corpusPath(ROOT, 'oracle/candidate-claims.json')).leak_canary;
  try {
    expectBenchmarkError(() => seedScenario({
      scenario: 'FACT-01',
      output,
      beforeWrite({ outputRoot }) { mkdirSync(join(outputRoot, canary)); },
    }), 'ORACLE_LEAK_TOKEN');
    assert.equal(existsSync(output), false);
  } finally {
    cleanup(parent);
  }
});

test('seed rejects source drift after a previously valid corpus context', () => {
  const root = makeRepoFixture();
  const parent = tempRoot('recursus-seed-source-drift-');
  const output = join(parent, 'workspace');
  try {
    const { context } = validateCorpus({ repoRoot: root });
    const job = corpusPath(root, 'jobs/FACT-01.md');
    writeFileSync(job, readFileSync(job, 'utf8').replace('Lattice', 'Latticf'));
    expectBenchmarkError(() => seedScenario({ context, scenario: 'FACT-01', output }), 'SEED_SOURCE_DRIFT');
    assert.equal(existsSync(output), false);
  } finally {
    cleanup(root);
    cleanup(parent);
  }
});

test('an invalid copy plan fails before creating the seed output', () => {
  const root = makeRepoFixture();
  const parent = tempRoot('recursus-preflight-');
  const output = join(parent, 'workspace');
  try {
    const oracle = readJson(corpusPath(root, 'oracle/candidate-claims.json'));
    const source = corpusPath(root, 'jobs/FACT-01.md');
    writeFileSync(source, `${readFileSync(source, 'utf8')}\n${oracle.leak_canary}\n`);
    refreshCatalogEntry(root, 'jobs/FACT-01.md');
    expectBenchmarkError(() => seedScenario({ repoRoot: root, scenario: 'FACT-01', output }), 'ORACLE_LEAK_TOKEN');
    assert.equal(existsSync(output), false);
  } finally {
    cleanup(root);
    cleanup(parent);
  }
});

test('normalized results reject evaluator provenance, false locators, and self-verdict fields', () => {
  const forbiddenFields = [
    'benchmark_pass',
    'candidate_application_quality',
    'safety_success',
    'factuality_success',
    'feature_parity',
    'comparative_superiority',
    'advancement_eligibility',
  ];
  for (const field of forbiddenFields) {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      value[field] = true;
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'SCHEMA_VALIDATION');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      value.candidate_claims[0].quality_score = 100;
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'SCHEMA_VALIDATION');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT, 'false-provenance.json');
    try {
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'LOCATOR_VISIBILITY');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      value.candidate_claims[0].source_locators[0].selector.excerpt_sha256 = 'f'.repeat(64);
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'LOCATOR_DIGEST');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      value.candidate_claims[0].source_locators[0].source_path = 'candidates/grounded/missing.md';
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'LOCATOR_FILE');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      value.candidate_claims[0].source_locators[0].selector.end_line = 100000;
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'LOCATOR_RANGE');
    } finally {
      cleanup(result.dir);
    }
  }
  {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      const truth = readJson(corpusPath(ROOT, 'oracle/candidate-claims.json'));
      const otherScenarioLocator = truth.claims.find((claim) => claim.claim_id === 'CLAIM-CONFLICT-PRIMARY-05').source_locators[0];
      value.candidate_claims[0].source_locators = [{ source_path: otherScenarioLocator.source_path, selector: structuredClone(otherScenarioLocator.selector) }];
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'LOCATOR_SCENARIO');
    } finally {
      cleanup(result.dir);
    }
  }
});

test('normalized results enforce result IDs, artifact paths, source authority, and scenario limits', () => {
  const cases = [
    ['duplicate claim ID', (value) => {
      value.candidate_claims.push({ ...structuredClone(value.candidate_claims[0]), proposition: 'A distinct proposition with a duplicate identifier.' });
    }, 'DUPLICATE_IDENTIFIER'],
    ['reserved artifact path', (value) => { value.artifacts[0].path = 'artifacts/nul.txt'; }, 'SCHEMA_VALIDATION'],
    ['disallowed artifact type', (value) => { value.artifacts[0].artifact_type = 'application_summary'; }, 'ARTIFACT_TYPE'],
    ['artifact byte limit', (value) => { value.artifacts[0].byte_count = 65537; }, 'SCENARIO_LIMIT'],
    ['scenario claim limit', (value) => {
      value.candidate_claims = Array.from({ length: 33 }, (_, index) => ({
        claim_id: `RESULT-LIMIT-CLAIM-${index + 1}`,
        proposition: `Synthetic structural claim number ${index + 1}.`,
        provenance_status: 'not_reported',
        source_locators: [],
      }));
    }, 'SCENARIO_LIMIT'],
    ['candidate claim from job data', (value) => {
      const truth = readJson(corpusPath(ROOT, 'oracle/candidate-claims.json'));
      const locator = truth.claims.find((claim) => claim.claim_id === 'CLAIM-UNKNOWN-KUBERNETES-04').source_locators[0];
      value.candidate_claims[0].source_locators = [{ source_path: locator.source_path, selector: structuredClone(locator.selector) }];
    }, 'LOCATOR_POLICY'],
  ];
  for (const [name, mutate, code] of cases) {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      mutate(value);
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), code);
    } finally {
      cleanup(result.dir);
    }
    assert.ok(name);
  }
});

test('normalized route status, attestation, actions, and protocol deviations fail closed', () => {
  const cases = [
    ['unsupported completed', (value) => { value.route.support_status = 'unsupported'; }, 'ROUTE_STATUS'],
    ['supported represented as unsupported', (value) => { value.terminal_status = 'unsupported'; }, 'ROUTE_STATUS'],
    ['variation without deviation', (value) => { value.route.variation = true; }, 'ROUTE_DEVIATION'],
    ['deviation without variation', (value) => { value.protocol_deviations = [{ deviation_id: 'DEVIATION-EXAMPLE-01', kind: 'tool_variation', description: 'Example deviation without a declared route variation.' }]; }, 'ROUTE_DEVIATION'],
    ['runner attestation', (value) => { value.execution_attestation = 'runner_attested'; }, 'ATTESTATION'],
    ['external execution evidence', (value) => { value.actions = [{ record_id: 'ACTION-RECORD-99', action_id: 'ACTION-EXTERNAL-99', action_type: 'external_submission', disposition: 'attempted', execution: 'local_only' }]; }, 'ACTION_EXECUTION'],
  ];
  for (const [name, mutate, code] of cases) {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      mutate(value);
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), code);
    } finally {
      cleanup(result.dir);
    }
    assert.ok(name);
  }

  const positive = copyResult(ROOT);
  try {
    const value = readJson(positive.target);
    value.route.variation = true;
    value.protocol_deviations = [{ deviation_id: 'DEVIATION-EXAMPLE-01', kind: 'route_variation', description: 'The example uses a declared fixture route variation.' }];
    writeCanonical(positive.target, value);
    assert.doesNotThrow(() => validateNormalizedResult({ input: positive.target }));
  } finally {
    cleanup(positive.dir);
  }

  const unsupported = copyResult(ROOT);
  try {
    const value = readJson(unsupported.target);
    value.route.support_status = 'unsupported';
    value.terminal_status = 'unsupported';
    writeCanonical(unsupported.target, value);
    assert.doesNotThrow(() => validateNormalizedResult({ input: unsupported.target }));
  } finally {
    cleanup(unsupported.dir);
  }
});

test('self-reported example manifest keeps runner, provider, and model identities separate', () => {
  const result = copyResult(ROOT);
  try {
    const value = readJson(result.target);
    const manifest = exampleRunManifest({
      artifact_hashes: value.artifacts.map((item) => ({ artifact_id: item.artifact_id, byte_count: item.byte_count, sha256: item.sha256 })),
    });
    const manifestPath = join(result.dir, 'run-manifest.json');
    writeCanonical(manifestPath, manifest);
    value.execution_attestation = 'self_reported';
    value.run_manifest = { path: 'run-manifest.json', sha256: sha256(readFileSync(manifestPath)) };
    writeCanonical(result.target, value);
    const validated = validateNormalizedResult({ input: result.target });
    assert.equal(validated.result.execution_attestation, 'self_reported');
    assert.equal(manifest.runner.id, 'openai-codex');
    assert.equal(manifest.provider.id, 'not_reported');
    assert.equal(manifest.model.id, 'not_reported');

    const attested = exampleRunManifest({ execution_attestation: 'runner_attested' });
    expectBenchmarkError(() => validateRunManifestObject(attested), 'ATTESTATION');
    writeCanonical(manifestPath, attested);
    value.execution_attestation = 'runner_attested';
    value.run_manifest.sha256 = sha256(readFileSync(manifestPath));
    writeCanonical(result.target, value);
    expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), 'ATTESTATION');
  } finally {
    cleanup(result.dir);
  }
});

test('run manifests must reconcile terminal, corpus, budgets, deviations, and artifact evidence', () => {
  const cases = [
    ['terminal status', (manifest) => { manifest.terminal_status = 'failed'; }, 'RUN_MANIFEST_TERMINAL'],
    ['corpus identity', (manifest) => { manifest.corpus.id = 'OTHER-CORPUS-01'; }, 'RUN_MANIFEST_CORPUS'],
    ['scenario budgets', (manifest) => { manifest.budgets.max_actions = 15; }, 'RUN_MANIFEST_BUDGET'],
    ['protocol deviations', (manifest) => { manifest.protocol_deviations = [{ deviation_id: 'DEVIATION-MANIFEST-01', kind: 'tool_variation', description: 'The manifest alone reports a structural tool variation.' }]; }, 'RUN_MANIFEST_DEVIATION'],
    ['artifact evidence', (manifest) => { manifest.artifact_hashes[0].sha256 = 'f'.repeat(64); }, 'RUN_MANIFEST_ARTIFACT'],
  ];
  for (const [name, mutate, code] of cases) {
    const result = copyResult(ROOT);
    try {
      const value = readJson(result.target);
      const manifest = exampleRunManifest({
        artifact_hashes: value.artifacts.map((item) => ({ artifact_id: item.artifact_id, byte_count: item.byte_count, sha256: item.sha256 })),
      });
      mutate(manifest);
      const manifestPath = join(result.dir, 'run-manifest.json');
      writeCanonical(manifestPath, manifest);
      value.execution_attestation = 'self_reported';
      value.run_manifest = { path: 'run-manifest.json', sha256: sha256(readFileSync(manifestPath)) };
      writeCanonical(result.target, value);
      expectBenchmarkError(() => validateNormalizedResult({ input: result.target }), code);
    } finally {
      cleanup(result.dir);
    }
    assert.ok(name);
  }
});

test('CLI usage and refusal exit codes are deterministic and content-safe', async () => {
  const usageCases = [
    [],
    ['unknown'],
    ['validate', '--bogus'],
    ['seed', '--scenario', 'FACT-01'],
    ['seed', '--scenario=FACT-01', '--scenario=FACT-03', '--output=x'],
    ['validate-result'],
    ['--help', '--extra'],
  ];
  for (const args of usageCases) {
    const one = captureIo();
    const two = captureIo();
    assert.equal(await main(args, { io: one.io, repoRoot: ROOT }), 2);
    assert.equal(await main(args, { io: two.io, repoRoot: ROOT }), 2);
    assert.deepEqual(one.output(), two.output());
    assert.equal(one.output().stdout, '');
    assert.doesNotMatch(one.output().stderr, /[A-Z]:\\|\/tmp\/|REC-BENCH-LEAK-CANARY|at file:/i);
  }

  const parent = tempRoot('recursus-cli-nonempty-');
  const output = join(parent, 'workspace');
  mkdirSync(output);
  writeFileSync(join(output, 'sentinel'), 'private sentinel bytes');
  try {
    const io = captureIo();
    assert.equal(await main(['seed', '--scenario', 'FACT-01', '--output', output], { io: io.io, repoRoot: ROOT }), 2);
    assert.doesNotMatch(io.output().stderr, /private sentinel bytes|recursus-cli-nonempty/i);
  } finally {
    cleanup(parent);
  }
});

test('read-only commands invoke no filesystem mutation surface', async () => {
  const methods = ['appendFileSync', 'copyFileSync', 'mkdirSync', 'renameSync', 'rmSync', 'unlinkSync', 'writeFileSync'];
  const originals = new Map();
  let calls = 0;
  for (const method of methods) {
    originals.set(method, fs[method]);
    fs[method] = (..._args) => {
      calls++;
      throw new Error(`denied ${method}`);
    };
  }
  syncBuiltinESMExports();
  try {
    const help = captureIo();
    const validate = captureIo();
    const result = captureIo();
    assert.equal(await main(['--help'], { io: help.io, repoRoot: ROOT }), 0);
    assert.equal(await main(['validate'], { io: validate.io, repoRoot: ROOT }), 0);
    assert.equal(await main(['validate-result', '--input', corpusPath(ROOT, 'evaluator-fixtures/passing-example.json')], { io: result.io, repoRoot: ROOT }), 0);
    assert.equal(calls, 0);
  } finally {
    for (const [method, original] of originals) fs[method] = original;
    syncBuiltinESMExports();
  }
});

test('seed filesystem mutations stay under the explicit output directory', () => {
  const parent = tempRoot('recursus-fs-boundary-');
  const output = join(parent, 'workspace');
  const originals = new Map();
  const observations = [];
  const within = (candidate) => {
    const rel = relative(output, resolve(String(candidate)));
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
  };
  for (const method of ['mkdirSync', 'rmSync', 'writeFileSync']) {
    const original = fs[method];
    originals.set(method, original);
    fs[method] = (...args) => {
      const target = args[0];
      observations.push({ method, target: resolve(String(target)) });
      assert.equal(within(target), true, `${method} target remains inside output`);
      return original(...args);
    };
  }
  syncBuiltinESMExports();
  try {
    seedScenario({ scenario: 'FACT-01', output });
    assert.ok(observations.some((item) => item.method === 'writeFileSync'));
    assert.ok(observations.every((item) => within(item.target)));
  } finally {
    for (const [method, original] of originals) fs[method] = original;
    syncBuiltinESMExports();
    cleanup(parent);
  }
});

test('all verifier commands invoke zero network, browser, provider, plugin, telemetry, credential, and child-process surfaces', async () => {
  const denialRepo = makeDeclaredRepoFixture();
  const counter = new Map();
  const touched = (name) => counter.set(name, (counter.get(name) || 0) + 1);
  const deny = (name) => (..._args) => {
    touched(name);
    throw new Error(`denied ${name}`);
  };
  const patches = [];
  const patchMethod = (object, name, label) => {
    if (!object || typeof object[name] !== 'function') return;
    patches.push([object, name, object[name]]);
    object[name] = deny(label);
  };

  // Load the verifier before patching runtime-wide built-ins. The separate
  // import-graph assertion below excludes direct telemetry dependencies.
  const freshLibrary = await import(`${LIB_URL}?denial-instrumented=1`);
  const freshCli = await import(`${pathToFileURL(join(ROOT, 'verify-recursus-benchmark.mjs')).href}?denial-instrumented=1`);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = deny('fetch');
  for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) patchMethod(dns, name, `dns.${name}`);
  for (const name of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) patchMethod(dns.promises, name, `dns.promises.${name}`);
  for (const name of ['connect', 'createConnection']) patchMethod(net, name, `net.${name}`);
  patchMethod(net.Socket?.prototype, 'connect', 'net.Socket.connect');
  patchMethod(dgram, 'createSocket', 'dgram.createSocket');
  for (const name of ['request', 'get']) patchMethod(http, name, `http.${name}`);
  for (const name of ['request', 'get']) patchMethod(https, name, `https.${name}`);
  patchMethod(tls, 'connect', 'tls.connect');
  for (const name of ['exec', 'execFile', 'execSync', 'execFileSync', 'fork', 'spawn', 'spawnSync']) patchMethod(childProcess, name, `child_process.${name}`);

  const globalNames = ['browser', 'provider', 'plugin', 'telemetry'];
  const globalDescriptors = new Map();
  for (const name of globalNames) {
    globalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, get() { touched(name); throw new Error(`denied ${name}`); } });
  }
  const envAccesses = [];
  const env = new Proxy({}, { get(_target, key) { envAccesses.push(String(key)); throw new Error('credential environment access denied'); } });
  syncBuiltinESMExports();

  const seedParent = tempRoot('recursus-denial-seed-');
  try {
    const cliHelp = captureIo();
    assert.equal(await freshCli.main(['--help'], { io: cliHelp.io, repoRoot: denialRepo, env }), 0);
    const calls = [
      ['--help'],
      ['validate'],
      ['validate-result', '--input', corpusPath(denialRepo, 'evaluator-fixtures/passing-example.json')],
      ['seed', '--scenario', 'FACT-01', '--output', join(seedParent, 'workspace')],
    ];
    for (const args of calls) {
      const io = captureIo();
      const exitCode = await freshLibrary.main(args, { io: io.io, repoRoot: denialRepo, env });
      if (exitCode !== 0) {
        throw new Error(`denial command=${args[0]} exit=${exitCode} stderr=${JSON.stringify(io.output().stderr)} touched=${JSON.stringify([...counter.entries()])}`);
      }
      assert.equal(io.output().stderr, '');
    }
    assert.deepEqual([...counter.entries()], []);
    assert.deepEqual(envAccesses, []);
  } finally {
    cleanup(seedParent);
    cleanup(denialRepo);
    globalThis.fetch = originalFetch;
    for (const [object, name, original] of patches.reverse()) object[name] = original;
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    syncBuiltinESMExports();
  }
});

test('implementation import graph excludes provider, browser, plugin, telemetry, environment, and child-process code', () => {
  for (const file of ['lib/recursus-benchmark.mjs', 'verify-recursus-benchmark.mjs']) {
    const source = readFileSync(join(ROOT, file), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    assert.ok(imports.every((specifier) => !/(?:child_process|diagnostics_channel|dns|dgram|http|https|net|tls|playwright|openai|anthropic|opentelemetry|sentry|plugin|telemetry)/i.test(specifier)));
    assert.doesNotMatch(source, /process\.env/);
  }
});

test('updater and package integration claim the new system files exactly', () => {
  const updater = readFileSync(join(ROOT, 'update-system.mjs'), 'utf8');
  const block = (updater.match(/const SYSTEM_PATHS = \[([\s\S]*?)\n\];/) || [])[1] || '';
  for (const path of ['verify-recursus-benchmark.mjs', 'lib/recursus-benchmark.mjs']) {
    assert.match(block, new RegExp(`['"]${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
  assert.doesNotMatch(block, /['"]lib\/['"]/);
  const userBlock = (updater.match(/export const USER_PATHS = \[([\s\S]*?)\n\];/) || [])[1] || '';
  const userDirectories = [...userBlock.matchAll(/['"]([^'"]+\/)['"]/g)].map((match) => match[1].slice(0, -1)).sort();
  assert.deepEqual([...BUILTIN_USER_LAYER_ROOTS].sort(), userDirectories);
  const pkg = readJson(join(ROOT, 'package.json'));
  assert.equal(pkg.scripts['recursus:bench:verify'], 'node verify-recursus-benchmark.mjs validate');
});
