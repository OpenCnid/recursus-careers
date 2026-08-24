#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { ReferenceError } from './lib/recursus-reference.mjs';
import { captureErrorText, runRegisteredClaude } from './lib/recursus-reference-capture.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new ReferenceError('ARGUMENT', `Unexpected positional argument: ${token}`, 2);
    const key = token.slice(2);
    if (index + 1 >= rest.length || rest[index + 1].startsWith('--')) throw new ReferenceError('ARGUMENT', `Missing value for --${key}.`, 2);
    values[key] = rest[++index];
  }
  return { command, values };
}

export async function main(argv = []) {
  try {
    const { command, values } = parseArgs(argv);
    if (command !== 'next') throw new ReferenceError('USAGE', 'Usage: node capture-recursus-reference.mjs next --evidence-dir <path> --runner-executable <absolute-native-path>', 2);
    const result = await runRegisteredClaude({
      evidenceDir: values['evidence-dir'],
      runnerExecutable: values['runner-executable'],
    });
    process.stdout.write(`${JSON.stringify({ attempt_id: result.attemptId, terminal_status: result.manifest.terminal_status, termination_reason: result.manifest.termination_reason })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${captureErrorText(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
