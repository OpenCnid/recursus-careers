#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { ReferenceError } from './lib/recursus-reference-v4.mjs';
import { captureErrorText, runRegisteredClaude, validateRunnerPathSyntax } from './lib/recursus-reference-capture-v4.mjs';

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

function rejectUnknown(values, allowed) {
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new ReferenceError('ARGUMENT', `Unknown argument: --${key}`, 2);
}

export function parseCaptureRequest(argv = []) {
  const { command, values } = parseArgs(argv);
  if (command !== 'next') throw new ReferenceError('USAGE', 'Usage: node capture-recursus-reference-v4.mjs next --runner-executable <absolute-native-path>', 2);
  rejectUnknown(values, ['runner-executable']);
  const runnerExecutable = values['runner-executable'];
  if (typeof runnerExecutable !== 'string' || runnerExecutable.length === 0) throw new ReferenceError('ARGUMENT', 'The --runner-executable argument is required.', 2);
  validateRunnerPathSyntax(runnerExecutable);
  return { runnerExecutable };
}

export async function main(argv = []) {
  try {
    const request = parseCaptureRequest(argv);
    const result = await runRegisteredClaude(request);
    process.stdout.write(`${JSON.stringify({ attempt_id: result.attemptId, terminal_status: result.manifest.terminal_status, termination_reason: result.manifest.termination_reason })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${captureErrorText(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
