#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { RC3_NONCLAIM_SENTENCE, RouteError, formatRouteError, validateRouteEvidence } from './lib/recursus-route-v16.mjs';

export async function main(argv = []) {
  try {
    const [command, ...rest] = argv;
    if (command !== 'validate') throw new RouteError('USAGE', 'Usage: node verify-recursus-route-v16.mjs validate --evidence-dir <external-path> [--require-actual] [--json]', 2);
    const values = { json: false, requireActual: false };
    for (let index = 0; index < rest.length; index++) {
      const token = rest[index];
      if (token === '--json') values.json = true;
      else if (token === '--require-actual') values.requireActual = true;
      else if (token === '--evidence-dir' && rest[index + 1] !== undefined) values.evidenceDir = rest[++index];
      else throw new RouteError('ARGUMENT', 'Unknown or incomplete validation option.', 2);
    }
    const result = validateRouteEvidence({ evidenceDir: values.evidenceDir, requireActual: values.requireActual });
    if (values.json) process.stdout.write(`${JSON.stringify(result)}\n`);
    else {
      process.stdout.write(`RC-3 route evidence validated. Actual attempts: ${result.actual_attempt_count}.\n`);
      process.stdout.write(`${RC3_NONCLAIM_SENTENCE}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${formatRouteError(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
