/**
 * Offline structural validation for Recursus Benchmark Foundation v1.
 *
 * This module intentionally imports only local, dependency-free Node modules.
 * It does not execute a model, harness, workflow, provider, browser, plugin,
 * telemetry hook, or child process.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import {
  dirname,
  isAbsolute,
  join,
  parse,
  posix,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = '1.0';
export const CORPUS_VERSION = 'career-bench-v1';
export const CANONICAL_SERIALIZATION = 'recursus-canonical-json-v1';
export const NON_CLAIM_SENTENCE = 'Structure validated. No model, harness, workflow, safety, quality, or comparative claim was verified.';

const MODULE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAX_FILE_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 32;
const REQUIRED_SCENARIOS = ['FACT-01', 'FACT-03', 'NOSUB-01', 'SAFE-01'];
const SCHEMA_FILES = [
  'action-oracle.schema.json',
  'catalog.schema.json',
  'normalized-result.schema.json',
  'run-manifest.schema.json',
  'scenario.schema.json',
  'source-policy.schema.json',
  'truth-oracle.schema.json',
  'validation-result.schema.json',
];
const SOURCE_KINDS = new Set(['candidate_primary', 'candidate_derived', 'job_company']);
const ORACLE_LOCAL_ID_KEYS = new Set([
  'action_id',
  'claim_id',
  'class_id',
  'fixture_id',
  'manifest_id',
  'oracle_id',
  'policy_id',
  'result_id',
]);
export const BUILTIN_USER_LAYER_ROOTS = [
  '.claude/hooks',
  'data',
  'documents',
  'interview-prep',
  'jds',
  'output',
  'plugins.local',
  'reports',
  'writing-samples',
];

export class BenchmarkError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'BenchmarkError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function reject(code, message, exitCode = 1) {
  throw new BenchmarkError(code, message, exitCode);
}

function ordinal(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const output = {};
    for (const key of Object.keys(value).sort(ordinal)) output[key] = canonicalValue(value[key]);
    return output;
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

function deepEqual(a, b) {
  return canonicalStringify(a) === canonicalStringify(b);
}

function decodeUtf8(bytes, logicalPath) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    reject('UTF8_BOM', `${logicalPath}: UTF-8 byte-order marks are not allowed.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    reject('MALFORMED_UTF8', `${logicalPath}: content is not valid UTF-8.`);
  }
}

function assertDepthAndFinite(value, logicalPath, depth = 0) {
  if (depth > MAX_JSON_DEPTH) reject('JSON_DEPTH', `${logicalPath}: JSON nesting exceeds the supported limit.`);
  if (typeof value === 'number' && !Number.isFinite(value)) {
    reject('NON_FINITE_NUMBER', `${logicalPath}: non-finite numbers are not allowed.`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertDepthAndFinite(item, logicalPath, depth + 1);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) assertDepthAndFinite(item, logicalPath, depth + 1);
  }
}

function readBytes(fullPath, logicalPath, maxBytes = MAX_FILE_BYTES) {
  let stat;
  try {
    stat = lstatSync(fullPath);
  } catch {
    reject('MISSING_FILE', `${logicalPath}: required file is missing.`);
  }
  if (stat.isSymbolicLink()) reject('PATH_LINK', `${logicalPath}: symbolic links and reparse points are not allowed.`);
  if (!stat.isFile()) reject('FILE_TYPE', `${logicalPath}: expected a regular file.`);
  if (stat.size > maxBytes) reject('FILE_SIZE', `${logicalPath}: file exceeds the supported byte limit.`);
  return readFileSync(fullPath);
}

function readJson(fullPath, logicalPath, options = {}) {
  const bytes = readBytes(fullPath, logicalPath, options.maxBytes);
  const text = decodeUtf8(bytes, logicalPath);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    reject('MALFORMED_JSON', `${logicalPath}: malformed JSON.`);
  }
  assertDepthAndFinite(value, logicalPath);
  if (options.requireCanonical && text !== `${canonicalStringify(value)}\n`) {
    reject('NON_CANONICAL_JSON', `${logicalPath}: corpus JSON must use ${CANONICAL_SERIALIZATION}.`);
  }
  return { bytes, text, value };
}

function resolveSchemaRef(ref, rootSchema) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) reject('SCHEMA_REF', 'Schema contains an unsupported reference.');
  let node = rootSchema;
  for (const raw of ref.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node = node?.[key];
  }
  if (!node || typeof node !== 'object') reject('SCHEMA_REF', 'Schema contains an unresolved reference.');
  return node;
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function schemaIssue(path, detail) {
  reject('SCHEMA_VALIDATION', `${path}: ${detail}`);
}

/**
 * Focused Draft 2020-12 validator for the keywords used by the v1 schemas.
 * Cross-file integrity and filesystem containment are enforced separately.
 */
export function validateWithSchema(value, schema, logicalPath = '$', rootSchema = schema, depth = 0) {
  if (depth > MAX_JSON_DEPTH) schemaIssue(logicalPath, 'schema evaluation exceeded the supported depth.');
  if (schema.$ref) return validateWithSchema(value, resolveSchemaRef(schema.$ref, rootSchema), logicalPath, rootSchema, depth + 1);

  if (schema.allOf) {
    for (const item of schema.allOf) validateWithSchema(value, item, logicalPath, rootSchema, depth + 1);
  }
  if (schema.anyOf) {
    let matched = false;
    for (const item of schema.anyOf) {
      try {
        validateWithSchema(value, item, logicalPath, rootSchema, depth + 1);
        matched = true;
        break;
      } catch (error) {
        if (!(error instanceof BenchmarkError) || error.code !== 'SCHEMA_VALIDATION') throw error;
      }
    }
    if (!matched) schemaIssue(logicalPath, 'value does not match any allowed schema branch.');
  }
  if (schema.oneOf) {
    let matches = 0;
    for (const item of schema.oneOf) {
      try {
        validateWithSchema(value, item, logicalPath, rootSchema, depth + 1);
        matches++;
      } catch (error) {
        if (!(error instanceof BenchmarkError) || error.code !== 'SCHEMA_VALIDATION') throw error;
      }
    }
    if (matches !== 1) schemaIssue(logicalPath, 'value must match exactly one schema branch.');
  }
  if (schema.if) {
    let condition = true;
    try {
      validateWithSchema(value, schema.if, logicalPath, rootSchema, depth + 1);
    } catch (error) {
      if (!(error instanceof BenchmarkError) || error.code !== 'SCHEMA_VALIDATION') throw error;
      condition = false;
    }
    if (condition && schema.then) validateWithSchema(value, schema.then, logicalPath, rootSchema, depth + 1);
    if (!condition && schema.else) validateWithSchema(value, schema.else, logicalPath, rootSchema, depth + 1);
  }
  if (schema.not) {
    let matched = true;
    try {
      validateWithSchema(value, schema.not, logicalPath, rootSchema, depth + 1);
    } catch (error) {
      if (!(error instanceof BenchmarkError) || error.code !== 'SCHEMA_VALIDATION') throw error;
      matched = false;
    }
    if (matched) schemaIssue(logicalPath, 'value matches a prohibited schema branch.');
  }

  if (Object.hasOwn(schema, 'const') && !deepEqual(value, schema.const)) schemaIssue(logicalPath, 'value does not match the required constant.');
  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) schemaIssue(logicalPath, 'value is not in the allowed enumeration.');

  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = valueType(value);
    const compatible = allowed.some((type) => type === actual || (type === 'number' && actual === 'integer'));
    if (!compatible) schemaIssue(logicalPath, `expected ${allowed.join(' or ')}.`);
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) schemaIssue(logicalPath, 'string is too short.');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) schemaIssue(logicalPath, 'string is too long.');
    if (schema.pattern !== undefined && !(new RegExp(schema.pattern, 'u')).test(value)) schemaIssue(logicalPath, 'string does not match the required pattern.');
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) schemaIssue(logicalPath, 'number must be finite.');
    if (schema.minimum !== undefined && value < schema.minimum) schemaIssue(logicalPath, 'number is below the minimum.');
    if (schema.maximum !== undefined && value > schema.maximum) schemaIssue(logicalPath, 'number exceeds the maximum.');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) schemaIssue(logicalPath, 'array has too few items.');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) schemaIssue(logicalPath, 'array has too many items.');
    if (schema.uniqueItems) {
      const keys = value.map(canonicalStringify);
      if (new Set(keys).size !== keys.length) schemaIssue(logicalPath, 'array items must be unique.');
    }
    if (schema.items) value.forEach((item, index) => validateWithSchema(item, schema.items, `${logicalPath}[${index}]`, rootSchema, depth + 1));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key)) schemaIssue(logicalPath, `missing required field ${key}.`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(properties, key)) schemaIssue(logicalPath, 'unknown field is not allowed.');
      }
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) validateWithSchema(value[key], propertySchema, `${logicalPath}.${key}`, rootSchema, depth + 1);
    }
  }
}

function auditSchemaNode(node, logicalPath, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  if (node.type === 'object') {
    if (node.additionalProperties !== false) reject('SCHEMA_OPEN_OBJECT', `${logicalPath}: every object contract must reject unknown fields.`);
    if (!Array.isArray(node.required)) reject('SCHEMA_REQUIRED', `${logicalPath}: object contract must declare required fields.`);
  }
  if (node.type === 'string') {
    if (!Number.isInteger(node.minLength) || !Number.isInteger(node.maxLength)) reject('SCHEMA_STRING_LIMIT', `${logicalPath}: strings require finite size limits.`);
  }
  if (node.type === 'array') {
    if (!Number.isInteger(node.maxItems)) reject('SCHEMA_ARRAY_LIMIT', `${logicalPath}: arrays require finite size limits.`);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key === 'properties' || key === '$defs') {
      for (const [name, nested] of Object.entries(child || {})) auditSchemaNode(nested, `${logicalPath}.${key}.${name}`, seen);
    } else if (['items', 'if', 'then', 'else', 'not'].includes(key)) {
      auditSchemaNode(child, `${logicalPath}.${key}`, seen);
    } else if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
      child.forEach((nested, index) => auditSchemaNode(nested, `${logicalPath}.${key}[${index}]`, seen));
    }
  }
}

function loadSchemas(repoRoot) {
  const schemaRoot = join(repoRoot, 'evals', 'recursus', 'schemas');
  const schemas = new Map();
  for (const name of SCHEMA_FILES) {
    const { value } = readJson(join(schemaRoot, name), `schemas/${name}`);
    if (value.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      reject('SCHEMA_DIALECT', `schemas/${name}: expected JSON Schema Draft 2020-12.`);
    }
    auditSchemaNode(value, `schemas/${name}`);
    schemas.set(name, value);
  }
  return schemas;
}

function identifierKey(value) {
  return String(value).normalize('NFKC').toUpperCase();
}

function validateIdentifier(value, logicalPath) {
  if (typeof value !== 'string' || value !== value.trim() || value !== value.normalize('NFC') || !/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/.test(value)) {
    reject('IDENTIFIER', `${logicalPath}: identifier must use normalized uppercase ASCII segments.`);
  }
  return identifierKey(value);
}

function assertUniqueIdentifiers(values, logicalPath) {
  const seen = new Set();
  for (const value of values) {
    const key = identifierKey(value);
    if (seen.has(key)) reject('DUPLICATE_IDENTIFIER', `${logicalPath}: duplicate or Unicode-confusable identifier.`);
    seen.add(key);
    validateIdentifier(value, logicalPath);
  }
}

export function validateManifestPath(value, logicalPath = 'path') {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) reject('PATH_FORMAT', `${logicalPath}: path must be a bounded string.`);
  if (/^(?:\\\\[?.]\\|\/\/[?.]\/)/.test(value)) reject('PATH_DEVICE', `${logicalPath}: device paths are not allowed.`);
  if (/^(?:\\\\|\/\/)/.test(value)) reject('PATH_UNC', `${logicalPath}: UNC paths are not allowed.`);
  if (/^[A-Za-z]:/.test(value)) reject('PATH_DRIVE', `${logicalPath}: drive-letter paths are not allowed.`);
  if (value.startsWith('/') || isAbsolute(value)) reject('PATH_ABSOLUTE', `${logicalPath}: absolute paths are not allowed.`);
  if (/[\\]/.test(value)) reject('PATH_SEPARATOR', `${logicalPath}: manifest paths must use POSIX separators.`);
  if (/[ -]/u.test(value)) reject('PATH_CONTROL', `${logicalPath}: control characters are not allowed.`);
  if (value !== value.normalize('NFC')) reject('PATH_NORMALIZATION', `${logicalPath}: path must use Unicode NFC normalization.`);
  const segments = value.split('/');
  if (segments.some((segment) => segment === '')) reject('PATH_EMPTY_SEGMENT', `${logicalPath}: empty path segments are not allowed.`);
  if (segments.some((segment) => segment === '.' || segment === '..')) reject('PATH_TRAVERSAL', `${logicalPath}: dot and traversal segments are not allowed.`);
  if (segments.some((segment) => /[<>:"|?*]/.test(segment) || /[ .]$/.test(segment))) reject('PATH_PORTABILITY', `${logicalPath}: path contains a non-portable Windows segment.`);
  if (segments.some((segment) => /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(segment))) reject('PATH_PORTABILITY', `${logicalPath}: path contains a reserved Windows name.`);
  if (posix.normalize(value) !== value) reject('PATH_NORMALIZATION', `${logicalPath}: path is not normalized.`);
  return value;
}

function pathCollisionKey(value) {
  return value.normalize('NFKC').toLowerCase();
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function resolveExistingWithin(root, manifestPath, logicalPath) {
  validateManifestPath(manifestPath, logicalPath);
  const rootReal = realpathSync.native(root);
  let current = rootReal;
  for (const segment of manifestPath.split('/')) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      reject('MISSING_FILE', `${logicalPath}: referenced file is missing.`);
    }
    if (stat.isSymbolicLink()) reject('PATH_LINK', `${logicalPath}: path resolves through a symbolic link or reparse point.`);
  }
  const resolved = realpathSync.native(current);
  if (!isContained(rootReal, resolved)) reject('PATH_ESCAPE', `${logicalPath}: path resolves outside the declared root.`);
  return resolved;
}

function walkTreeEntries(root, logicalRoot) {
  const files = [];
  const paths = [];
  const visit = (dir, prefix) => {
    const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => ordinal(a.name, b.name));
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) reject('PATH_LINK', `${logicalRoot}: symbolic links and reparse points are not allowed.`);
      paths.push(rel);
      if (entry.isDirectory()) visit(full, rel);
      else if (entry.isFile()) files.push(rel);
      else reject('FILE_TYPE', `${logicalRoot}: only regular files are allowed.`);
    }
  };
  visit(root, '');
  return { files, paths };
}

function walkRegularFiles(root, logicalRoot) {
  return walkTreeEntries(root, logicalRoot).files;
}

function validateLinePolicy(bytes, logicalPath) {
  const text = decodeUtf8(bytes, logicalPath);
  if (text.includes('\r')) reject('LINE_ENDINGS', `${logicalPath}: corpus text must use committed LF bytes.`);
  return text;
}

function validateSourceLocator(locator, context, options = {}) {
  validateManifestPath(locator.source_path, 'source locator path');
  const entry = context.filesByPath.get(locator.source_path);
  if (!entry) reject('LOCATOR_FILE', 'Source locator references an undeclared file.');
  if (options.agentVisible && entry.visibility !== 'agent_visible') reject('LOCATOR_VISIBILITY', 'Source locator references evaluator-only material.');
  if (entry.kind !== 'source') reject('LOCATOR_KIND', 'Source locator must reference a declared source file.');
  const full = resolveExistingWithin(context.corpusRoot, locator.source_path, 'source locator path');
  const bytes = readBytes(full, locator.source_path);
  const text = validateLinePolicy(bytes, locator.source_path);
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  const selector = locator.selector;
  if (selector.kind !== 'line_range') reject('LOCATOR_SELECTOR', 'Source locator uses an unsupported selector.');
  if (selector.start_line < 1 || selector.end_line < selector.start_line || selector.end_line > lines.length) {
    reject('LOCATOR_RANGE', 'Source locator line range does not resolve.');
  }
  const excerpt = Buffer.from(lines.slice(selector.start_line - 1, selector.end_line).join('\n'), 'utf8');
  if (sha256(excerpt) !== selector.excerpt_sha256) reject('LOCATOR_DIGEST', 'Source locator excerpt digest does not resolve.');
  return entry;
}

function collectOracleLocalIdentifiers(value, output = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectOracleLocalIdentifiers(item, output);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (ORACLE_LOCAL_ID_KEYS.has(key) && typeof item === 'string') output.push(item);
      collectOracleLocalIdentifiers(item, output);
    }
  }
  return output;
}

function evaluatorCanary(value, logicalPath) {
  const canary = value?.leak_canary ?? value?.fixture?.leak_canary;
  if (typeof canary !== 'string' || !/^REC-BENCH-LEAK-CANARY-[A-Z0-9-]{8,80}$/.test(canary)) {
    reject('LEAK_CANARY', `${logicalPath}: evaluator-only file requires a unique synthetic leak canary.`);
  }
  return canary;
}

function containsUtf8CaseInsensitive(haystack, needle, logicalPath) {
  const text = decodeUtf8(haystack, logicalPath).normalize('NFC').toLocaleLowerCase('en-US');
  const token = String(needle).normalize('NFC').toLocaleLowerCase('en-US');
  return text.includes(token);
}

function scanBytesForLeaks(bytes, signatures, logicalPath) {
  for (const signature of signatures) {
    if (signature.fullBytes.length > 0 && bytes.includes(signature.fullBytes)) reject('ORACLE_LEAK_CONTENT', `${logicalPath}: evaluator-only file bytes were found.`);
    for (const token of signature.tokens) {
      if (containsUtf8CaseInsensitive(bytes, token, logicalPath)) reject('ORACLE_LEAK_TOKEN', `${logicalPath}: evaluator-only marker was found.`);
    }
  }
}

function buildLeakSignatures(context, parsedByPath) {
  const signatures = [];
  const canaries = [];
  for (const entry of context.catalog.files.filter((file) => file.visibility === 'evaluator_only')) {
    const bytes = context.bytesByPath.get(entry.path);
    const parsed = parsedByPath.get(entry.path);
    if (!parsed) reject('EVALUATOR_FORMAT', `${entry.path}: evaluator-only files must be versioned JSON.`);
    const canary = evaluatorCanary(parsed, entry.path);
    canaries.push(canary);
    const ids = collectOracleLocalIdentifiers(parsed);
    for (const id of ids) validateIdentifier(id, `${entry.path} identifier`);
    signatures.push({
      path: entry.path,
      fullBytes: bytes,
      tokens: [entry.path, entry.path.replaceAll('/', '\\'), entry.sha256, canary, ...ids],
    });
  }
  assertUniqueIdentifiers(canaries, 'evaluator leak canaries');
  return signatures;
}

function validateScenarioSemantics(scenario, context) {
  validateIdentifier(scenario.scenario_id, 'scenario identifier');
  validateIdentifier(scenario.manifest_id, 'scenario manifest identifier');
  const sources = [...scenario.candidate_sources, scenario.job_source];
  assertUniqueIdentifiers(sources.map((source) => source.source_id), `${scenario.scenario_id} source identifiers`);
  const sourceById = new Map();
  for (const source of sources) {
    validateManifestPath(source.path, `${scenario.scenario_id} source path`);
    const entry = context.filesByPath.get(source.path);
    if (!entry || entry.kind !== 'source') reject('SOURCE_REFERENCE', `${scenario.scenario_id}: source reference does not resolve.`);
    if (entry.visibility !== 'agent_visible') reject('SOURCE_VISIBILITY', `${scenario.scenario_id}: source reference is evaluator-only.`);
    if (entry.source_id !== source.source_id || entry.source_class !== source.source_class) reject('SOURCE_METADATA', `${scenario.scenario_id}: source metadata does not match the catalog.`);
    sourceById.set(source.source_id, source);
  }
  if (scenario.job_source.source_class !== 'job_company' || scenario.job_source_treatment !== 'untrusted_data') {
    reject('JOB_TREATMENT', `${scenario.scenario_id}: job source must be declared as untrusted data.`);
  }
  for (const source of scenario.candidate_sources) {
    if (!['candidate_primary', 'candidate_derived'].includes(source.source_class)) reject('CANDIDATE_SOURCE', `${scenario.scenario_id}: invalid candidate source class.`);
  }
  const mountKeys = new Set();
  const mountedSources = new Set();
  for (const mount of scenario.mounts) {
    validateManifestPath(mount.mount_path, `${scenario.scenario_id} mount path`);
    const key = pathCollisionKey(mount.mount_path);
    if (mountKeys.has(key)) reject('PATH_COLLISION', `${scenario.scenario_id}: mount paths collide under Windows case folding.`);
    mountKeys.add(key);
    const source = sourceById.get(mount.source_id);
    if (!source) reject('MOUNT_REFERENCE', `${scenario.scenario_id}: mount source does not resolve.`);
    const entry = context.filesByPath.get(source.path);
    if (entry.visibility !== 'agent_visible' || entry.kind !== 'source') reject('MOUNT_VISIBILITY', `${scenario.scenario_id}: evaluator-only material cannot be mounted.`);
    mountedSources.add(mount.source_id);
  }
  if (scenario.mounts.length !== sources.length || mountedSources.size !== sources.length || sources.some((source) => !mountedSources.has(source.source_id))) {
    reject('MOUNT_COMPLETENESS', `${scenario.scenario_id}: every declared source must have exactly one mount.`);
  }
  const refs = [
    ['truth_oracle', scenario.truth_oracle, 'oracle_id'],
    ['action_oracle', scenario.action_oracle, 'oracle_id'],
    ['source_policy', scenario.source_policy, 'policy_id'],
  ];
  for (const [expectedKind, ref, idKey] of refs) {
    validateManifestPath(ref.path, `${scenario.scenario_id} evaluator reference`);
    const entry = context.filesByPath.get(ref.path);
    const parsed = context.parsedByPath.get(ref.path);
    if (!entry || entry.kind !== expectedKind || entry.visibility !== 'evaluator_only' || !parsed || parsed[idKey] !== ref[idKey]) {
      reject('ORACLE_REFERENCE', `${scenario.scenario_id}: evaluator reference does not resolve.`);
    }
  }
}

function scenarioSourcePaths(scenario) {
  return new Set([...scenario.candidate_sources, scenario.job_source].map((source) => source.path));
}

function validateOracleSemantics(context) {
  const policies = [];
  const truthOracles = [];
  const actionOracles = [];
  for (const entry of context.catalog.files) {
    const value = context.parsedByPath.get(entry.path);
    if (!value) continue;
    if (entry.kind === 'source_policy') policies.push(value);
    if (entry.kind === 'truth_oracle') truthOracles.push(value);
    if (entry.kind === 'action_oracle') actionOracles.push(value);
  }
  if (policies.length !== 1 || truthOracles.length !== 1 || actionOracles.length !== 1) reject('ORACLE_SET', 'The v1 corpus requires one source policy and two shared oracle files.');
  const policy = policies[0];
  const requiredClasses = ['advisory_memory', 'candidate_derived', 'candidate_primary', 'evaluator_truth', 'job_company', 'model_generated'];
  if (!deepEqual(policy.classes.map((item) => item.source_class).sort(ordinal), requiredClasses)) reject('SOURCE_POLICY', 'Source policy does not declare every required source class.');
  const expectedCandidateSupport = new Map([
    ['candidate_primary', 'allowed'],
    ['candidate_derived', 'conditional'],
    ['job_company', 'prohibited'],
    ['evaluator_truth', 'prohibited'],
    ['advisory_memory', 'prohibited'],
    ['model_generated', 'prohibited'],
  ]);
  for (const item of policy.classes) {
    if (item.candidate_claim_support !== expectedCandidateSupport.get(item.source_class)) reject('SOURCE_POLICY', 'Source class has an invalid candidate-claim authority rule.');
    const expectedAuthority = item.source_class === 'evaluator_truth' ? 'evaluator_only' : 'none';
    if (item.instruction_authority !== expectedAuthority) reject('SOURCE_POLICY', 'Source class has an invalid instruction-authority rule.');
  }
  context.sourcePolicyByClass = new Map(policy.classes.map((item) => [item.source_class, item]));
  const truth = truthOracles[0];
  assertUniqueIdentifiers(truth.claims.map((claim) => claim.claim_id), 'truth oracle claims');
  for (const claim of truth.claims) {
    for (const scenarioId of claim.scenario_ids) if (!context.scenariosById.has(scenarioId)) reject('CLAIM_SCENARIO', 'Truth oracle references an unknown scenario.');
    for (const locator of claim.source_locators) {
      validateSourceLocator(locator, context);
      for (const scenarioId of claim.scenario_ids) {
        if (!scenarioSourcePaths(context.scenariosById.get(scenarioId)).has(locator.source_path)) reject('CLAIM_SOURCE', 'Truth-oracle locator is not mounted by its referenced scenario.');
      }
    }
  }
  const actions = actionOracles[0];
  assertUniqueIdentifiers(actions.actions.map((action) => action.action_id), 'action oracle actions');
  const actionById = new Map(actions.actions.map((action) => [action.action_id, action]));
  for (const action of actions.actions) {
    if (!context.scenariosById.has(action.scenario_id)) reject('ACTION_SCENARIO', 'Action oracle references an unknown scenario.');
    validateSourceLocator(action.source_locator, context);
    if (!scenarioSourcePaths(context.scenariosById.get(action.scenario_id)).has(action.source_locator.source_path)) reject('ACTION_SOURCE', 'Action-oracle locator is not mounted by its referenced scenario.');
  }
  for (const scenario of context.scenariosById.values()) {
    for (const actionId of scenario.prohibited_action_ids) {
      const action = actionById.get(actionId);
      if (!action || action.scenario_id !== scenario.scenario_id || action.policy !== 'prohibited') reject('PROHIBITED_ACTION', `${scenario.scenario_id}: prohibited action reference does not resolve.`);
    }
  }
  for (const action of actions.actions.filter((item) => item.policy === 'prohibited')) {
    if (!context.scenariosById.get(action.scenario_id).prohibited_action_ids.includes(action.action_id)) reject('PROHIBITED_ACTION', 'Every prohibited oracle action must be declared by its scenario.');
  }
  const localArtifact = actions.actions.find((action) => action.scenario_id === 'NOSUB-01' && action.action_type === 'local_artifact');
  const noSubmit = actions.actions.find((action) => action.scenario_id === 'NOSUB-01' && action.action_type === 'external_submission');
  const approval = actions.actions.find((action) => action.scenario_id === 'NOSUB-01' && action.action_type === 'user_review');
  const safeAccess = actions.actions.find((action) => action.scenario_id === 'SAFE-01' && action.action_type === 'evaluator_access');
  if (!localArtifact || localArtifact.policy !== 'locally_allowed' || localArtifact.expected_outcome !== 'may_occur') reject('NOSUB_ACTION', 'NOSUB-01 must distinguish allowed local artifact creation.');
  if (!noSubmit || noSubmit.policy !== 'prohibited' || noSubmit.expected_outcome !== 'must_not_occur') reject('NOSUB_ACTION', 'NOSUB-01 must prohibit external submission.');
  if (!approval || approval.policy !== 'approval_required' || approval.expected_outcome !== 'requires_approval') reject('NOSUB_ACTION', 'NOSUB-01 must distinguish an approval-required handoff.');
  if (!safeAccess || safeAccess.policy !== 'prohibited' || safeAccess.expected_outcome !== 'must_not_occur') reject('SAFE_ACTION', 'SAFE-01 must prohibit evaluator-data access.');
}

function validateDefinitionIdentifiers(context) {
  const definitions = [
    context.catalog.corpus_id,
    ...context.catalog.files.map((entry) => entry.file_id),
    ...context.catalog.files.filter((entry) => entry.kind === 'source').map((entry) => entry.source_id),
    ...context.catalog.scenarios.map((entry) => entry.scenario_id),
  ];
  for (const [path, value] of context.parsedByPath) {
    const kind = context.filesByPath.get(path).kind;
    if (kind === 'scenario') definitions.push(value.manifest_id);
    if (kind === 'source_policy') definitions.push(value.policy_id, ...value.classes.map((item) => item.class_id));
    if (kind === 'truth_oracle') definitions.push(value.oracle_id, ...value.claims.map((item) => item.claim_id));
    if (kind === 'action_oracle') definitions.push(value.oracle_id, ...value.actions.map((item) => item.action_id));
    if (kind === 'evaluator_fixture') definitions.push(value.result_id, value.fixture.fixture_id);
  }
  assertUniqueIdentifiers(definitions, 'corpus definition identifiers');
}

function validateResultSemantics(result, context, inputDirectory = null) {
  const scenario = context.scenariosById.get(result.scenario_id);
  if (!scenario) reject('RESULT_SCENARIO', 'Normalized result references an unknown scenario.');
  const allowedSourcePaths = scenarioSourcePaths(scenario);
  assertUniqueIdentifiers([
    result.result_id,
    ...(result.fixture ? [result.fixture.fixture_id] : []),
    ...result.artifacts.map((item) => item.artifact_id),
    ...result.candidate_claims.map((item) => item.claim_id),
    ...result.research_claims.map((item) => item.claim_id),
    ...result.actions.map((item) => item.record_id),
    ...result.protocol_deviations.map((item) => item.deviation_id),
    ...result.errors.map((item) => item.error_id),
  ], 'normalized-result definition identifiers');
  assertUniqueIdentifiers(result.actions.map((item) => item.action_id), 'normalized-result action identifiers');
  if (result.artifacts.length > scenario.limits.max_artifacts) reject('SCENARIO_LIMIT', 'Result exceeds the scenario artifact limit.');
  if (result.candidate_claims.length + result.research_claims.length > scenario.limits.max_claims) reject('SCENARIO_LIMIT', 'Result exceeds the scenario claim limit.');
  if (result.actions.length > scenario.limits.max_actions) reject('SCENARIO_LIMIT', 'Result exceeds the scenario action limit.');
  const artifactPaths = new Set();
  for (const artifact of result.artifacts) {
    validateManifestPath(artifact.path, 'artifact path');
    const key = pathCollisionKey(artifact.path);
    if (artifactPaths.has(key)) reject('PATH_COLLISION', 'Result artifact paths collide under normalization or Windows case folding.');
    artifactPaths.add(key);
    if (!scenario.allowed_artifact_types.includes(artifact.artifact_type)) reject('ARTIFACT_TYPE', 'Artifact type is not allowed by the result scenario.');
    if (artifact.byte_count > scenario.limits.max_artifact_bytes) reject('SCENARIO_LIMIT', 'Artifact exceeds the scenario byte limit.');
  }
  if (result.route.support_status === 'unsupported' && result.terminal_status === 'completed') reject('ROUTE_STATUS', 'An unsupported route cannot report completed status.');
  if (result.route.support_status === 'supported' && result.terminal_status === 'unsupported') reject('ROUTE_STATUS', 'A supported route cannot report unsupported status.');
  if (result.route.variation && result.protocol_deviations.length === 0) reject('ROUTE_DEVIATION', 'A declared route variation requires a protocol deviation.');
  if (!result.route.variation && result.protocol_deviations.length > 0) reject('ROUTE_DEVIATION', 'Protocol deviations require a declared route variation.');
  if (result.execution_attestation === 'runner_attested') reject('ATTESTATION', 'Runner-attested evidence cannot be supplied to the foundation verifier.');
  for (const action of result.actions) {
    if (['external_submission', 'evaluator_access', 'candidate_mutation'].includes(action.action_type) && action.execution !== 'not_executed') {
      reject('ACTION_EXECUTION', 'External, evaluator, and candidate-mutation actions cannot declare execution evidence in this foundation.');
    }
  }
  const validateClaims = (claims, supportField) => {
    for (const claim of claims) {
      if (claim.provenance_status === 'located' && claim.source_locators.length === 0) reject('PROVENANCE', 'Located provenance requires a source locator.');
      if (claim.provenance_status === 'not_reported' && claim.source_locators.length !== 0) reject('PROVENANCE', 'Unreported provenance cannot include source locators.');
      for (const locator of claim.source_locators) {
        const entry = validateSourceLocator(locator, context, { agentVisible: true });
        if (!allowedSourcePaths.has(locator.source_path)) reject('LOCATOR_SCENARIO', 'Source locator is not mounted by the result scenario.');
        const sourcePolicy = context.sourcePolicyByClass.get(entry.source_class);
        if (!sourcePolicy || sourcePolicy[supportField] === 'prohibited') reject('LOCATOR_POLICY', 'Source locator violates the declared source authority policy.');
      }
    }
  };
  validateClaims(result.candidate_claims, 'candidate_claim_support');
  validateClaims(result.research_claims, 'research_claim_support');
  if (result.run_manifest !== null) {
    if (!inputDirectory) reject('RUN_MANIFEST', 'A run-manifest reference requires a filesystem input context.');
    const manifestPath = validateManifestPath(result.run_manifest.path, 'run-manifest path');
    const full = resolveExistingWithin(inputDirectory, manifestPath, 'run-manifest path');
    const bytes = readBytes(full, 'run-manifest input');
    if (sha256(bytes) !== result.run_manifest.sha256) reject('RUN_MANIFEST_HASH', 'Run-manifest digest does not match exact bytes.');
    const manifest = readJson(full, 'run-manifest input').value;
    validateWithSchema(manifest, context.schemas.get('run-manifest.schema.json'), 'run-manifest');
    validateRunManifestObject(manifest);
    if (manifest.scenario_id !== result.scenario_id || manifest.route_id !== result.route.route_id) reject('RUN_MANIFEST_REFERENCE', 'Run manifest identity does not match the result.');
    if (manifest.execution_attestation !== result.execution_attestation) reject('RUN_MANIFEST_ATTESTATION', 'Run manifest attestation does not match the result.');
    if (manifest.example !== result.example) reject('RUN_MANIFEST_EXAMPLE', 'Run manifest example status does not match the result.');
    if (manifest.terminal_status !== result.terminal_status) reject('RUN_MANIFEST_TERMINAL', 'Run manifest terminal status does not match the result.');
    if (manifest.corpus.id !== context.catalog.corpus_id || manifest.corpus.version !== result.corpus_version || manifest.corpus.schema_version !== SCHEMA_VERSION) reject('RUN_MANIFEST_CORPUS', 'Run manifest corpus identity does not match the result.');
    if (!deepEqual(manifest.budgets, scenario.limits)) reject('RUN_MANIFEST_BUDGET', 'Run manifest budgets do not match the scenario limits.');
    const deviations = (items) => [...items].sort((a, b) => ordinal(a.deviation_id, b.deviation_id));
    if (!deepEqual(deviations(manifest.protocol_deviations), deviations(result.protocol_deviations))) reject('RUN_MANIFEST_DEVIATION', 'Run manifest protocol deviations do not match the result.');
    const evidence = (items) => items.map((item) => ({ artifact_id: item.artifact_id, byte_count: item.byte_count, sha256: item.sha256 })).sort((a, b) => ordinal(a.artifact_id, b.artifact_id));
    if (!deepEqual(evidence(manifest.artifact_hashes), evidence(result.artifacts))) reject('RUN_MANIFEST_ARTIFACT', 'Run manifest artifact hashes do not match the result inventory.');
  } else if (result.execution_attestation !== 'absent') {
    reject('ATTESTATION', 'Self-reported execution requires a separate run manifest.');
  }
}

export function validateRunManifestObject(manifest) {
  validateIdentifier(manifest.run_id, 'run manifest identifier');
  validateIdentifier(manifest.scenario_id, 'run manifest scenario identifier');
  if (typeof manifest.route_id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.route_id)) {
    reject('IDENTIFIER', 'Run manifest route identifier must be a lowercase hyphenated slug.');
  }
  if (manifest.execution_attestation === 'runner_attested') reject('ATTESTATION', 'Runner-attested examples are not accepted by Benchmark Foundation v1.');
  if (manifest.example !== true) reject('RUN_MANIFEST_EXAMPLE', 'Foundation v1 accepts only explicitly labeled example manifests.');
  if (manifest.provider.id === 'not_reported' && manifest.provider.version !== 'not_reported') reject('PROVIDER_IDENTITY', 'Provider version cannot be inferred when provider is not reported.');
  if (manifest.model.id === 'not_reported' && manifest.model.revision !== 'not_reported') reject('MODEL_IDENTITY', 'Model revision cannot be inferred when model is not reported.');
  assertUniqueIdentifiers([
    manifest.run_id,
    ...manifest.protocol_deviations.map((item) => item.deviation_id),
    ...manifest.artifact_hashes.map((item) => item.artifact_id),
  ], 'run-manifest definition identifiers');
}

function validationResult(operation, context, attestation = 'absent', provenance = 'pass') {
  return {
    advancement_eligibility: 'not_evaluated',
    corpus_integrity: 'pass',
    execution_attestation: attestation,
    files_validated: context.catalog.files.length,
    operation,
    oracle_evaluation: 'not_run',
    provenance_completeness: provenance,
    safety_evaluation: 'not_run',
    scenario_ids: [...context.scenariosById.keys()].sort(ordinal),
    schema: 'pass',
    schema_version: SCHEMA_VERSION,
    synthetic: true,
    validation_id: operation === 'validate' ? 'VALIDATION-CORPUS-01' : 'VALIDATION-RESULT-01',
  };
}

/** Validate the committed or injected v1 corpus without writing anything. */
export function validateCorpus(options = {}) {
  const repoRoot = resolve(options.repoRoot || MODULE_ROOT);
  const schemas = loadSchemas(repoRoot);
  const corpusRoot = resolve(options.corpusRoot || join(repoRoot, 'evals', 'recursus', CORPUS_VERSION));
  const catalogPath = join(corpusRoot, 'catalog.json');
  const catalogDocument = readJson(catalogPath, `${CORPUS_VERSION}/catalog.json`, { requireCanonical: true });
  const catalog = catalogDocument.value;
  validateWithSchema(catalog, schemas.get('catalog.schema.json'), 'catalog');
  if (catalog.schema_version !== SCHEMA_VERSION || catalog.corpus_version !== CORPUS_VERSION || catalog.canonical_serialization !== CANONICAL_SERIALIZATION) {
    reject('CATALOG_VERSION', 'Catalog declares an unsupported version.');
  }
  validateIdentifier(catalog.corpus_id, 'catalog identifier');
  assertUniqueIdentifiers(catalog.scenarios.map((item) => item.scenario_id), 'catalog scenario identifiers');
  assertUniqueIdentifiers(catalog.files.map((item) => item.file_id), 'catalog file identifiers');
  assertUniqueIdentifiers(catalog.files.filter((item) => item.kind === 'source').map((item) => item.source_id), 'catalog source identifiers');

  const filesByPath = new Map();
  const pathKeys = new Set();
  for (const entry of catalog.files) {
    validateManifestPath(entry.path, 'catalog file path');
    const key = pathCollisionKey(entry.path);
    if (pathKeys.has(key)) reject('PATH_COLLISION', 'Catalog paths collide under normalization or Windows case folding.');
    pathKeys.add(key);
    filesByPath.set(entry.path, entry);
    const expectedVisibility = entry.kind === 'source' ? 'agent_visible' : 'evaluator_only';
    if (entry.visibility !== expectedVisibility) reject('VISIBILITY_CLASS', 'Catalog file kind has an invalid visibility class.');
    if (entry.kind === 'source') {
      validateIdentifier(entry.source_id, 'catalog source identifier');
      if (!SOURCE_KINDS.has(entry.source_class) || entry.synthetic !== true) reject('SOURCE_METADATA', 'Catalog source metadata is incomplete.');
    }
  }

  const actual = walkRegularFiles(corpusRoot, CORPUS_VERSION).filter((item) => item !== 'catalog.json').sort(ordinal);
  const declared = [...filesByPath.keys()].sort(ordinal);
  if (!deepEqual(actual, declared)) reject('FILE_INVENTORY', 'Corpus contains a missing or undeclared file.');

  const bytesByPath = new Map();
  const parsedByPath = new Map();
  const schemaForKind = {
    action_oracle: 'action-oracle.schema.json',
    evaluator_fixture: 'normalized-result.schema.json',
    scenario: 'scenario.schema.json',
    source_policy: 'source-policy.schema.json',
    truth_oracle: 'truth-oracle.schema.json',
  };
  for (const entry of catalog.files) {
    const full = resolveExistingWithin(corpusRoot, entry.path, entry.path);
    const bytes = readBytes(full, entry.path);
    bytesByPath.set(entry.path, bytes);
    if (bytes.length !== entry.byte_count) reject('BYTE_COUNT', `${entry.path}: declared byte count does not match exact bytes.`);
    if (sha256(bytes) !== entry.sha256) reject('HASH_MISMATCH', `${entry.path}: SHA-256 digest does not match exact bytes.`);
    validateLinePolicy(bytes, entry.path);
    const schemaName = schemaForKind[entry.kind];
    if (schemaName) {
      const document = readJson(full, entry.path, { requireCanonical: true });
      parsedByPath.set(entry.path, document.value);
      validateWithSchema(document.value, schemas.get(schemaName), entry.path);
      if (document.value.schema_version !== SCHEMA_VERSION || document.value.synthetic !== true) reject('DOCUMENT_VERSION', `${entry.path}: unsupported document envelope.`);
    }
  }

  const context = {
    repoRoot,
    corpusRoot,
    catalog,
    schemas,
    filesByPath,
    bytesByPath,
    parsedByPath,
    scenariosById: new Map(),
    leakSignatures: [],
    sourcePolicyByClass: new Map(),
  };
  for (const scenarioEntry of catalog.scenarios) {
    validateManifestPath(scenarioEntry.manifest_path, 'scenario manifest path');
    const fileEntry = filesByPath.get(scenarioEntry.manifest_path);
    const scenario = parsedByPath.get(scenarioEntry.manifest_path);
    if (!fileEntry || fileEntry.kind !== 'scenario' || fileEntry.visibility !== 'evaluator_only' || !scenario || scenario.scenario_id !== scenarioEntry.scenario_id) {
      reject('SCENARIO_REFERENCE', 'Catalog scenario reference does not resolve to an evaluator-only manifest.');
    }
    if (context.scenariosById.has(scenario.scenario_id)) reject('DUPLICATE_IDENTIFIER', 'Duplicate scenario identifier.');
    context.scenariosById.set(scenario.scenario_id, scenario);
  }
  if (!deepEqual([...context.scenariosById.keys()].sort(ordinal), REQUIRED_SCENARIOS)) reject('REQUIRED_SCENARIOS', 'The four required v1 scenarios are not present exactly once.');
  for (const scenario of context.scenariosById.values()) validateScenarioSemantics(scenario, context);
  validateOracleSemantics(context);
  validateDefinitionIdentifiers(context);
  context.leakSignatures = buildLeakSignatures(context, parsedByPath);

  for (const entry of catalog.files.filter((file) => file.visibility === 'agent_visible')) {
    scanBytesForLeaks(bytesByPath.get(entry.path), context.leakSignatures, entry.path);
  }
  for (const entry of catalog.files.filter((file) => file.kind === 'evaluator_fixture')) {
    const fixture = parsedByPath.get(entry.path);
    let passed = true;
    try {
      validateResultSemantics(fixture, context);
    } catch (error) {
      if (!(error instanceof BenchmarkError)) throw error;
      passed = false;
    }
    const expectedPass = fixture.fixture.expected_validation === 'pass';
    if (passed !== expectedPass) reject('FIXTURE_EXPECTATION', `${entry.path}: evaluator fixture does not match its declared structural expectation.`);
  }
  const result = validationResult('validate', context);
  validateWithSchema(result, schemas.get('validation-result.schema.json'), 'validation result');
  return { context, result };
}

export function resolveScenario(scenarioId, options = {}) {
  const { context } = options.context ? { context: options.context } : validateCorpus(options);
  validateIdentifier(scenarioId, 'scenario identifier');
  const scenario = context.scenariosById.get(scenarioId);
  if (!scenario) reject('UNKNOWN_SCENARIO', 'Requested scenario is not present in the v1 corpus.');
  return { context, scenario };
}

function gitMetadataRoots(repoRoot) {
  const roots = [];
  const dotGit = join(repoRoot, '.git');
  if (!existsSync(dotGit)) return roots;
  roots.push(dotGit);
  const stat = lstatSync(dotGit);
  if (stat.isFile()) {
    const text = decodeUtf8(readFileSync(dotGit), '.git metadata');
    const match = text.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match) reject('GIT_METADATA', 'Git worktree metadata is malformed.');
    const gitDir = resolve(repoRoot, match[1]);
    if (!existsSync(gitDir)) reject('GIT_METADATA', 'Git worktree metadata does not resolve.');
    roots.push(gitDir);
    const commonFile = join(gitDir, 'commondir');
    if (existsSync(commonFile)) {
      const common = decodeUtf8(readFileSync(commonFile), 'Git common metadata').trim();
      if (!common) reject('GIT_METADATA', 'Git common metadata is malformed.');
      const commonRoot = resolve(gitDir, common);
      if (!existsSync(commonRoot)) reject('GIT_METADATA', 'Git common metadata does not resolve.');
      roots.push(commonRoot);
    }
  }
  return roots;
}

function localConfiguredRoots(repoRoot) {
  const file = join(repoRoot, 'config', 'local-paths.txt');
  if (!existsSync(file)) return [];
  const text = decodeUtf8(readFileSync(file), 'configured user-layer roots');
  const output = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.endsWith('/')) {
      validateManifestPath(line.slice(0, -1), 'configured user-layer root');
      output.push(join(repoRoot, ...line.slice(0, -1).split('/')));
    }
  }
  return output;
}

function deepestExistingResolution(target) {
  const absolute = resolve(target);
  const missing = [];
  let current = absolute;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) reject('OUTPUT_PARENT', 'Seed output has no resolvable parent.', 2);
    missing.unshift(parse(current).base);
    current = parent;
  }
  const stat = lstatSync(current);
  if (stat.isSymbolicLink()) reject('OUTPUT_LINK', 'Seed output resolves through a symbolic link or reparse point.', 2);
  const resolved = realpathSync.native(current);
  return join(resolved, ...missing);
}

function canonicalProtectedRoot(root) {
  const absolute = resolve(root);
  if (!existsSync(absolute)) return deepestExistingResolution(absolute);
  return realpathSync.native(absolute);
}

function pathsOverlap(a, b) {
  return isContained(a, b) || isContained(b, a);
}

export function assertSafeOutputTarget(output, options = {}) {
  if (typeof output !== 'string' || output.length === 0) reject('OUTPUT_REQUIRED', 'Seed requires an explicit output directory.', 2);
  const outputCanonical = deepestExistingResolution(resolve(options.cwd || process.cwd(), output));
  const protectedRoots = options.protectedRoots || [];
  for (const item of protectedRoots) {
    const protectedCanonical = canonicalProtectedRoot(item.path);
    if (pathsOverlap(outputCanonical, protectedCanonical)) reject('OUTPUT_OVERLAP', `Seed output overlaps a protected ${item.kind} root.`, 2);
  }
  if (existsSync(outputCanonical)) {
    const stat = lstatSync(outputCanonical);
    if (stat.isSymbolicLink()) reject('OUTPUT_LINK', 'Seed output may not be a symbolic link or reparse point.', 2);
    if (!stat.isDirectory()) reject('OUTPUT_TYPE', 'Seed output exists and is not a directory.', 2);
    if (readdirSync(outputCanonical).length !== 0) reject('OUTPUT_NOT_EMPTY', 'Seed output directory must be empty.', 2);
  } else {
    const parent = dirname(outputCanonical);
    if (!existsSync(parent) || !lstatSync(parent).isDirectory()) reject('OUTPUT_PARENT', 'Seed output parent directory must already exist.', 2);
  }
  return outputCanonical;
}

function defaultProtectedRoots(context) {
  const roots = [
    { kind: 'repository', path: context.repoRoot },
    { kind: 'corpus', path: context.corpusRoot },
    { kind: 'oracle', path: join(context.corpusRoot, 'oracle') },
    ...gitMetadataRoots(context.repoRoot).map((path) => ({ kind: 'Git metadata', path })),
    ...BUILTIN_USER_LAYER_ROOTS.map((path) => ({ kind: 'user-layer', path: join(context.repoRoot, path) })),
    ...localConfiguredRoots(context.repoRoot).map((path) => ({ kind: 'configured user-layer', path })),
  ];
  return roots;
}

function scanSeedTree(outputRoot, expectedFiles, signatures) {
  const tree = walkTreeEntries(outputRoot, 'seed output');
  for (const rel of tree.paths) scanBytesForLeaks(Buffer.from(rel, 'utf8'), signatures, 'seed output path');
  const expectedPaths = new Set(expectedFiles);
  for (const file of expectedFiles) {
    const segments = file.split('/');
    for (let index = 1; index < segments.length; index++) expectedPaths.add(segments.slice(0, index).join('/'));
  }
  if (!deepEqual([...tree.paths].sort(ordinal), [...expectedPaths].sort(ordinal))) reject('SEED_INVENTORY', 'Seed output contains undeclared paths.');
  for (const rel of tree.files) {
    const relBytes = Buffer.from(rel, 'utf8');
    scanBytesForLeaks(relBytes, signatures, 'seed output path');
    const full = resolveExistingWithin(outputRoot, rel, 'seed output file');
    scanBytesForLeaks(readBytes(full, 'seed output file'), signatures, 'seed output file');
  }
}

function ensureSeedParent(outputRoot, mountPath) {
  const rootReal = realpathSync.native(outputRoot);
  let current = outputRoot;
  const directories = mountPath.split('/').slice(0, -1);
  for (const segment of directories) {
    current = join(current, segment);
    if (!existsSync(current)) {
      try {
        mkdirSync(current);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) reject('OUTPUT_LINK', 'Seed destination resolves through a symbolic link or reparse point.', 2);
    if (!stat.isDirectory()) reject('OUTPUT_TYPE', 'Seed destination parent is not a directory.', 2);
    if (!isContained(rootReal, realpathSync.native(current))) reject('PATH_ESCAPE', 'Seed destination resolves outside the output root.', 2);
  }
}

/** Seed one scenario. This is the only library operation that writes files. */
export function seedScenario(options = {}) {
  const { context, scenario } = resolveScenario(options.scenario, options);
  const protectedRoots = options.protectedRoots || defaultProtectedRoots(context);
  const outputRoot = assertSafeOutputTarget(options.output, { cwd: options.cwd, protectedRoots });
  const sourceById = new Map([...scenario.candidate_sources, scenario.job_source].map((source) => [source.source_id, source]));
  const plan = scenario.mounts.map((mount) => {
    const source = sourceById.get(mount.source_id);
    const entry = context.filesByPath.get(source.path);
    const sourceFull = resolveExistingWithin(context.corpusRoot, source.path, 'seed source');
    const bytes = readBytes(sourceFull, 'seed source');
    if (bytes.length !== entry.byte_count || sha256(bytes) !== entry.sha256) reject('SEED_SOURCE_DRIFT', 'Seed source bytes changed after corpus validation.');
    scanBytesForLeaks(bytes, context.leakSignatures, 'seed source');
    return { mountPath: mount.mount_path, bytes };
  });
  const keys = new Set();
  for (const item of plan) {
    validateManifestPath(item.mountPath, 'seed mount path');
    const key = pathCollisionKey(item.mountPath);
    if (keys.has(key)) reject('PATH_COLLISION', 'Seed mount paths collide under Windows case folding.');
    keys.add(key);
  }
  const outputExisted = existsSync(outputRoot);
  let created = false;
  try {
    if (!outputExisted) {
      mkdirSync(outputRoot);
      created = true;
    }
    assertSafeOutputTarget(outputRoot, { protectedRoots });
    if (options.beforeWrite) options.beforeWrite({ outputRoot, plan: plan.map((item) => item.mountPath) });
    for (const item of plan) {
      const destination = join(outputRoot, ...item.mountPath.split('/'));
      if (!isContained(outputRoot, destination)) reject('PATH_ESCAPE', 'Seed destination escapes the output root.');
      ensureSeedParent(outputRoot, item.mountPath);
      try {
        writeFileSync(destination, item.bytes, { flag: 'wx' });
      } catch (error) {
        if (error?.code === 'EEXIST') reject('OVERWRITE_REFUSAL', 'Seed refused to overwrite an existing file.', 2);
        throw error;
      }
    }
    const expected = plan.map((item) => item.mountPath);
    scanSeedTree(outputRoot, expected, context.leakSignatures);
    const inventory = {
      corpus_version: context.catalog.corpus_version,
      files: plan.map((item) => ({
        byte_count: item.bytes.length,
        mount_path: item.mountPath,
        sha256: sha256(item.bytes),
      })).sort((a, b) => ordinal(a.mount_path, b.mount_path)),
      inventory_id: `SEED-INVENTORY-${scenario.scenario_id}`,
      scenario_id: scenario.scenario_id,
      schema_version: SCHEMA_VERSION,
      synthetic: true,
    };
    scanBytesForLeaks(Buffer.from(canonicalStringify(inventory), 'utf8'), context.leakSignatures, 'seed inventory');
    return inventory;
  } catch (error) {
    if (created) {
      try {
        rmSync(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Cleanup is best effort and remains confined to the verified new root.
      }
    }
    if (error instanceof BenchmarkError) throw error;
    reject('SEED_WRITE', 'Seed write failed without exposing filesystem details.');
  }
}

export function validateNormalizedResult(options = {}) {
  if (!options.input) reject('INPUT_REQUIRED', 'validate-result requires an explicit input file.', 2);
  const { context } = validateCorpus(options);
  const inputFull = resolve(options.cwd || process.cwd(), options.input);
  const document = readJson(inputFull, 'normalized result input');
  validateWithSchema(document.value, context.schemas.get('normalized-result.schema.json'), 'normalized result');
  validateResultSemantics(document.value, context, dirname(inputFull));
  const result = validationResult('validate-result', context, document.value.execution_attestation);
  validateWithSchema(result, context.schemas.get('validation-result.schema.json'), 'validation result');
  return {
    input: document.value,
    result,
  };
}

const HELP = `Recursus Benchmark Foundation v1 structural verifier

Usage:
  node verify-recursus-benchmark.mjs validate [--json]
  node verify-recursus-benchmark.mjs seed --scenario <ID> --output <directory> [--json]
  node verify-recursus-benchmark.mjs validate-result --input <file> [--json]
  node verify-recursus-benchmark.mjs --help

This verifier runs offline and validates structure and fixture integrity only.
`;

function parseFlags(args, valueFlags, booleanFlags) {
  const values = {};
  const booleans = new Set();
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (!token.startsWith('-')) reject('USAGE', 'Unexpected positional argument.', 2);
    const equals = token.indexOf('=');
    const flag = equals >= 0 ? token.slice(0, equals) : token;
    if (valueFlags.includes(flag)) {
      if (Object.hasOwn(values, flag)) reject('USAGE', 'Repeated option is not allowed.', 2);
      const value = equals >= 0 ? token.slice(equals + 1) : args[++index];
      if (!value || value.startsWith('--')) reject('USAGE', 'Option requires a value.', 2);
      values[flag] = value;
    } else if (booleanFlags.includes(flag) && equals < 0) {
      if (booleans.has(flag)) reject('USAGE', 'Repeated option is not allowed.', 2);
      booleans.add(flag);
    } else {
      reject('USAGE', 'Unsupported option.', 2);
    }
  }
  return { values, booleans };
}

function defaultIo() {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
}

/** Import-safe CLI main. Returns an exit code and never exits the process. */
export async function main(argv = [], options = {}) {
  const io = options.io || defaultIo();
  try {
    if (argv.length === 0) reject('USAGE', 'A command is required. Use --help for usage.', 2);
    if (argv[0] === '--help' || argv[0] === '-h') {
      if (argv.length > 1) reject('USAGE', 'Help does not accept additional arguments.', 2);
      io.stdout(HELP);
      return 0;
    }
    const [command, ...args] = argv;
    const common = { repoRoot: options.repoRoot, corpusRoot: options.corpusRoot, cwd: options.cwd };
    if (command === 'validate') {
      const flags = parseFlags(args, [], ['--json']);
      const { result } = validateCorpus(common);
      if (flags.booleans.has('--json')) io.stdout(`${canonicalStringify(result)}\n`);
      else io.stdout(`Validated ${result.files_validated} cataloged corpus files across ${result.scenario_ids.length} scenarios.\n${NON_CLAIM_SENTENCE}\n`);
      return 0;
    }
    if (command === 'seed') {
      const flags = parseFlags(args, ['--scenario', '--output'], ['--json']);
      if (!flags.values['--scenario'] || !flags.values['--output']) reject('USAGE', 'seed requires --scenario and --output.', 2);
      const inventory = seedScenario({ ...common, scenario: flags.values['--scenario'], output: flags.values['--output'], protectedRoots: options.protectedRoots, beforeWrite: options.beforeWrite });
      if (flags.booleans.has('--json')) io.stdout(`${canonicalStringify(inventory)}\n`);
      else io.stdout(`Seeded ${inventory.scenario_id} with ${inventory.files.length} agent-visible files.\n${canonicalStringify(inventory)}\n`);
      return 0;
    }
    if (command === 'validate-result') {
      const flags = parseFlags(args, ['--input'], ['--json']);
      if (!flags.values['--input']) reject('USAGE', 'validate-result requires --input.', 2);
      const validated = validateNormalizedResult({ ...common, input: flags.values['--input'] });
      if (flags.booleans.has('--json')) io.stdout(`${canonicalStringify(validated.result)}\n`);
      else io.stdout(`Normalized result structure validated for ${validated.input.scenario_id}. Oracle evaluation: not_run. Safety evaluation: not_run.\n${NON_CLAIM_SENTENCE}\n`);
      return 0;
    }
    reject('USAGE', 'Unsupported command.', 2);
  } catch (error) {
    if (error instanceof BenchmarkError) {
      io.stderr(`ERROR ${error.code}: ${error.message}\n`);
      return error.exitCode;
    }
    io.stderr('ERROR INTERNAL: unexpected verifier failure.\n');
    return 1;
  }
}
