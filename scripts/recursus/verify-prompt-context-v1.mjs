#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RC4_NON_CLAIM,
  PromptContextV1Error,
  compilePromptContext,
  comparePromptContext,
  decodeRouteBundle,
  planCompilationArtifacts,
  projectRouteBundle,
  validatePromptContextPackage,
  writeCompilationArtifacts,
} from '../../lib/recursus/prompt-context-v1.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = resolve(dirname(MODULE_PATH), '..', '..');
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_LOGICAL_FIELD_RE = /^[A-Za-z0-9_.:[\]-]{1,160}$/;
const SAFE_ERROR_CODE_RE = /^[A-Z0-9_]{1,80}$/;
const SAFE_DIGEST_PREFIX_RE = /^(?:sha256:)?[a-f0-9]{8,64}$/;

const HELP = `RC-4 offline prompt and context verifier

Usage:
  node scripts/recursus/verify-prompt-context-v1.mjs validate
  node scripts/recursus/verify-prompt-context-v1.mjs compile --mode <mode> --fixture <fixture> --target <target> --output <empty-directory>
  node scripts/recursus/verify-prompt-context-v1.mjs compare --mode <mode> --fixture <fixture>
  node scripts/recursus/verify-prompt-context-v1.mjs --help

Commands:
  validate  Validate the complete registered RC-4 package without writing files.
  compile   Write deterministic synthetic artifacts to an explicit empty directory.
  compare   Compare both offline targets without writing files.
`;

class CliArgumentError extends Error {
  constructor(code, logicalField) {
    super(code);
    this.name = 'CliArgumentError';
    this.code = code;
    this.logical_field = logicalField;
    this.exitCode = 2;
  }
}

function parseOptions(tokens, requiredNames) {
  const allowed = new Set(requiredNames);
  const parsed = Object.create(null);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (typeof token !== 'string' || !allowed.has(token)) {
      throw new CliArgumentError('RC4_UNKNOWN_ARGUMENT', 'argv');
    }
    if (Object.hasOwn(parsed, token)) {
      throw new CliArgumentError('RC4_DUPLICATE_ARGUMENT', `argv.${token.slice(2)}`);
    }

    const value = tokens[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
      throw new CliArgumentError('RC4_MISSING_ARGUMENT_VALUE', `argv.${token.slice(2)}`);
    }
    parsed[token] = value;
    index += 1;
  }

  for (const name of requiredNames) {
    if (!Object.hasOwn(parsed, name)) {
      throw new CliArgumentError('RC4_MISSING_ARGUMENT', `argv.${name.slice(2)}`);
    }
  }
  return parsed;
}

function requireSafeIdentifier(value, logicalField) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER_RE.test(value)) {
    throw new CliArgumentError('RC4_INVALID_IDENTIFIER', logicalField);
  }
  return value;
}

function requireValidatedIdentity(value, logicalField) {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER_RE.test(value)) {
    throw new CliArgumentError('RC4_INVALID_VALIDATION_RESULT', logicalField);
  }
  return value;
}

function countObjectKeys(value, logicalField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliArgumentError('RC4_INVALID_VALIDATION_RESULT', logicalField);
  }
  return Object.keys(value).length;
}

function countArray(value, logicalField) {
  if (!Array.isArray(value)) {
    throw new CliArgumentError('RC4_INVALID_VALIDATION_RESULT', logicalField);
  }
  return value.length;
}

function formatSafeDiagnostic(error) {
  let safe = null;
  if (error instanceof PromptContextV1Error && typeof error.toJSON === 'function') {
    try {
      safe = error.toJSON();
    } catch {
      safe = null;
    }
  } else if (error instanceof CliArgumentError) {
    safe = error;
  }

  const code = safe && typeof safe.code === 'string' && SAFE_ERROR_CODE_RE.test(safe.code)
    ? safe.code
    : 'RC4_INTERNAL_ERROR';
  const parts = [`[${code}]`];
  if (safe && typeof safe.logical_field === 'string' && SAFE_LOGICAL_FIELD_RE.test(safe.logical_field)) {
    parts.push(`field=${safe.logical_field}`);
  }
  if (safe && typeof safe.digest_prefix === 'string' && SAFE_DIGEST_PREFIX_RE.test(safe.digest_prefix)) {
    parts.push(`digest=${safe.digest_prefix}`);
  }
  return parts.join(' ');
}

function safeExitCode(error) {
  const candidate = error?.exitCode ?? error?.exit_code;
  return Number.isInteger(candidate) && candidate >= 1 && candidate <= 125 ? candidate : 1;
}

async function runValidate({ repoRoot, stdout }) {
  const context = await validatePromptContextPackage({ repoRoot });
  const registrationId = requireValidatedIdentity(
    context?.registration?.registration_id,
    'validation.registration.registration_id',
  );
  const registrationVersion = requireValidatedIdentity(
    context?.registration?.registration_version,
    'validation.registration.registration_version',
  );
  const snapshotId = requireValidatedIdentity(
    context?.source_snapshot?.snapshot_id,
    'validation.source_snapshot.snapshot_id',
  );
  const snapshotVersion = requireValidatedIdentity(
    context?.source_snapshot?.snapshot_version,
    'validation.source_snapshot.snapshot_version',
  );
  const modeCount = countObjectKeys(context?.modes, 'validation.modes');
  const targetCount = countObjectKeys(context?.adapters, 'validation.adapters');
  const fixtureCount = countArray(context?.fixtures?.invocations, 'validation.fixtures.invocations');
  const negativeCaseCount = countArray(context?.fixtures?.negative_cases, 'validation.fixtures.negative_cases');

  stdout.write(
    `RC-4 package validated. Registration=${registrationId}@${registrationVersion} `
      + `SourceSnapshot=${snapshotId}@${snapshotVersion} Modes=${modeCount} Targets=${targetCount} `
      + `Fixtures=${fixtureCount} NegativeCases=${negativeCaseCount}.\n`,
  );
  stdout.write(`${RC4_NON_CLAIM}\n`);
}

async function runCompile({ repoRoot, options, stdout }) {
  const modeId = requireSafeIdentifier(options['--mode'], 'argv.mode');
  const fixtureId = requireSafeIdentifier(options['--fixture'], 'argv.fixture');
  const targetId = requireSafeIdentifier(options['--target'], 'argv.target');
  const outputRoot = options['--output'];
  const context = await validatePromptContextPackage({ repoRoot });
  const compiledPrompt = await compilePromptContext({
    mode_id: modeId,
    fixture_id: fixtureId,
    context,
  });
  const routeBundle = projectRouteBundle({
    compiled_prompt: compiledPrompt,
    target_id: targetId,
    context,
  });
  const plan = await planCompilationArtifacts({
    compiled_prompt: compiledPrompt,
    route_bundle: routeBundle,
    target_id: targetId,
    output_root: outputRoot,
    context,
  });
  const result = await writeCompilationArtifacts(plan);
  const fileCount = countArray(result?.files, 'compile.files');

  stdout.write(
    `RC-4 deterministic artifacts written. Mode=${modeId} Fixture=${fixtureId} `
      + `Target=${targetId} Files=${fileCount}.\n`,
  );
}

async function runCompare({ repoRoot, options, stdout }) {
  const modeId = requireSafeIdentifier(options['--mode'], 'argv.mode');
  const fixtureId = requireSafeIdentifier(options['--fixture'], 'argv.fixture');
  const context = await validatePromptContextPackage({ repoRoot });
  const result = await comparePromptContext({
    mode_id: modeId,
    fixture_id: fixtureId,
    context,
  });

  if (result?.status !== 'pass' || result?.non_claim !== RC4_NON_CLAIM) {
    throw new CliArgumentError('RC4_INVALID_COMPARISON_RESULT', 'compare.status');
  }
  const comparedMode = requireValidatedIdentity(result.mode_id, 'compare.mode_id');
  const comparedFixture = requireValidatedIdentity(result.fixture_id, 'compare.fixture_id');
  const targetCount = countArray(result.target_ids, 'compare.target_ids');
  const digest = typeof result.compilation_digest === 'string'
    ? result.compilation_digest.replace(/^sha256:/, '').slice(0, 12)
    : '';
  if (!/^[a-f0-9]{12}$/.test(digest)) {
    throw new CliArgumentError('RC4_INVALID_COMPARISON_RESULT', 'compare.compilation_digest');
  }

  stdout.write(
    `RC-4 structural comparison passed. Mode=${comparedMode} Fixture=${comparedFixture} `
      + `Targets=${targetCount} Digest=sha256:${digest}.\n`,
  );
  stdout.write(`${RC4_NON_CLAIM}\n`);
}

export async function runPromptContextV1Cli({
  argv = [],
  stdout = process.stdout,
  stderr = process.stderr,
  repoRoot = DEFAULT_REPO_ROOT,
} = {}) {
  try {
    if (!Array.isArray(argv) || argv.some((value) => typeof value !== 'string')) {
      throw new CliArgumentError('RC4_INVALID_ARGUMENT_VECTOR', 'argv');
    }

    if (argv.length === 1 && argv[0] === '--help') {
      stdout.write(HELP);
      return 0;
    }

    const [command, ...tokens] = argv;
    if (command === 'validate') {
      if (tokens.length !== 0) throw new CliArgumentError('RC4_UNKNOWN_ARGUMENT', 'argv');
      await runValidate({ repoRoot, stdout });
      return 0;
    }
    if (command === 'compile') {
      const options = parseOptions(tokens, ['--mode', '--fixture', '--target', '--output']);
      await runCompile({ repoRoot, options, stdout });
      return 0;
    }
    if (command === 'compare') {
      const options = parseOptions(tokens, ['--mode', '--fixture']);
      await runCompare({ repoRoot, options, stdout });
      return 0;
    }
    throw new CliArgumentError('RC4_UNKNOWN_COMMAND', 'argv.command');
  } catch (error) {
    stderr.write(`${formatSafeDiagnostic(error)}\n`);
    return safeExitCode(error);
  }
}

// Imported as part of the registered public library boundary. Compare performs both
// projections and inverse decodes internally so the canonical prompt is compiled once.
void decodeRouteBundle;

if (process.argv[1] === MODULE_PATH) {
  process.exitCode = await runPromptContextV1Cli({ argv: process.argv.slice(2) });
}
