#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  RC2_NONCLAIM_SENTENCE,
  ReferenceError,
  formatReferenceError,
  validateReferenceEvidence,
} from './lib/recursus-reference-v4.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = { json: false, requireCompleteSet: false };
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (token === '--json') values.json = true;
    else if (token === '--require-complete-set') values.requireCompleteSet = true;
    else if (token === '--evidence-dir') {
      if (index + 1 >= rest.length) throw new ReferenceError('ARGUMENT', 'Missing value for --evidence-dir.', 2);
      values.evidenceDir = rest[++index];
    } else throw new ReferenceError('ARGUMENT', `Unknown argument: ${token}`, 2);
  }
  return { command, values };
}

export async function main(argv = []) {
  try {
    const { command, values } = parseArgs(argv);
    if (command !== 'validate') throw new ReferenceError('USAGE', 'Usage: node verify-recursus-reference-v4.mjs validate [--evidence-dir <path>] [--require-complete-set] [--json]', 2);
    const result = validateReferenceEvidence({ evidenceDir: values.evidenceDir, requireCompleteSet: values.requireCompleteSet });
    if (values.json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else {
      process.stdout.write(`RC-2 reference evidence validated. Actual attempts: ${result.actual_attempt_count}.\n`);
      process.stdout.write(`${RC2_NONCLAIM_SENTENCE}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${formatReferenceError(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
