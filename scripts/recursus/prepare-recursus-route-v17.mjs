#!/usr/bin/env node

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  RouteError,
  assertRouteExternalRoot,
  cleanupRunRoot,
  formatRouteError,
  runDryRun,
  validateRouteEvidence,
} from '../../lib/recursus/recursus-route-v17.mjs';

function parse(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new RouteError('ARGUMENT', 'Unexpected positional argument.', 2);
    const key = token.slice(2);
    if (key === 'json' || key === 'require-actual') {
      values[key] = true;
      continue;
    }
    if (values[key] !== undefined || index + 1 >= rest.length || rest[index + 1].startsWith('--')) throw new RouteError('ARGUMENT', 'An option is repeated or missing its value.', 2);
    values[key] = rest[++index];
  }
  return { command, values };
}

function rejectUnknown(values, allowed) {
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new RouteError('ARGUMENT', 'Unknown option.', 2);
}

export async function main(argv = []) {
  try {
    const { command, values } = parse(argv);
    if (command === 'dry-run') {
      rejectUnknown(values, ['evidence-dir', 'run-root']);
      const result = runDryRun({ evidenceDir: values['evidence-dir'], runRoot: values['run-root'], write: true });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (command === 'dry-run-check') {
      rejectUnknown(values, ['run-root']);
      if (values['run-root'] === undefined) throw new RouteError('ARGUMENT', 'Dry-run check requires an explicit new external root.', 2);
      const root = assertRouteExternalRoot(values['run-root'], { label: 'dry-run check root' });
      if (existsSync(root)) throw new RouteError('DIRECTORY_NOT_EMPTY', 'Dry-run check root must not exist.', 2);
      mkdirSync(root, { recursive: false });
      const firstRoot = join(root, 'first');
      const secondRoot = join(root, 'second');
      try {
        const first = runDryRun({ runRoot: firstRoot });
        const second = runDryRun({ runRoot: secondRoot });
        if (JSON.stringify(first) !== JSON.stringify(second)) throw new RouteError('DRY_RUN_NONDETERMINISTIC', 'Repeated dry-run projections differ.');
        process.stdout.write(`${JSON.stringify(first)}\n`);
      } finally {
        cleanupRunRoot(root);
      }
      return 0;
    }
    if (command === 'validate') {
      rejectUnknown(values, ['evidence-dir', 'json', 'require-actual']);
      const result = validateRouteEvidence({ evidenceDir: values['evidence-dir'], requireActual: values['require-actual'] === true });
      process.stdout.write(values.json ? `${JSON.stringify(result)}\n` : `RC-3 route evidence validated: ${result.actual_attempt_count} actual attempt(s).\n`);
      return 0;
    }
    throw new RouteError('USAGE', 'Usage: node scripts/recursus/prepare-recursus-route-v17.mjs <dry-run|dry-run-check|validate> with explicit external roots.', 2);
  } catch (error) {
    process.stderr.write(`${formatRouteError(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
