#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { canonicalJsonV1 } from '../../lib/recursus/prompt-context-v1.mjs';
import {
  RC6_INTERNALS_FOR_TESTS,
  RC6_REGISTERED_FAULTS,
  RC6RunStateError,
  exerciseRunState,
  formatRC6Error,
  inspectRunState,
  recoverRunState,
} from '../../lib/recursus/rc6-run-state.mjs';

function reject(code, message) {
  throw new RC6RunStateError(code, message, 2);
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length < 1) reject('RC6_ARGUMENT', 'A command is required.');
  const [command, ...tokens] = argv;
  if (!['exercise', 'inspect', 'recover'].includes(command)) reject('RC6_ARGUMENT', 'The command must be exercise, inspect, or recover.');
  if (tokens.length % 2 !== 0) reject('RC6_ARGUMENT', 'Every option requires one value.');
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    if (!['--docker-executable', '--fault', '--output-root'].includes(key) || Object.hasOwn(values, key)) {
      reject('RC6_ARGUMENT', 'An option is unknown or repeated.');
    }
    const value = tokens[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) reject('RC6_ARGUMENT', 'An option value is missing.');
    values[key] = value;
  }
  if (typeof values['--output-root'] !== 'string') reject('RC6_ARGUMENT', 'An explicit output root is required.');
  if (command !== 'exercise' && (values['--fault'] !== undefined || values['--docker-executable'] !== undefined)) {
    reject('RC6_ARGUMENT', 'Inspect and recover are networkless and accept only an output root.');
  }
  if (command === 'exercise') {
    if (values['--fault'] === undefined || ![...RC6_REGISTERED_FAULTS, 'matrix'].includes(values['--fault'])) {
      reject('RC6_ARGUMENT', 'Exercise requires one registered provider-free fault or matrix.');
    }
    const needsExecutor = values['--fault'] === 'matrix' || RC6_INTERNALS_FOR_TESTS.EXECUTOR_FAULTS.has(values['--fault']);
    if (needsExecutor !== (values['--docker-executable'] !== undefined)) {
      reject('RC6_ARGUMENT', needsExecutor
        ? 'This provider-free fault requires an explicit Docker executable.'
        : 'This pre-dispatch fault does not accept a Docker executable.');
    }
  }
  const parsed = {
    command,
    fault: values['--fault'],
    outputRoot: values['--output-root'],
  };
  if (values['--docker-executable'] !== undefined) parsed.dockerExecutable = values['--docker-executable'];
  return Object.freeze(parsed);
}

export async function runRC6RunStateCli(options = {}) {
  const stderr = options.stderr || process.stderr;
  const stdout = options.stdout || process.stdout;
  try {
    const parsed = parseArguments(options.argv || process.argv.slice(2));
    const operationOptions = Object.fromEntries(Object.entries(parsed)
      .filter(([key, value]) => key !== 'command' && value !== undefined));
    const result = parsed.command === 'inspect'
      ? await inspectRunState(operationOptions)
      : parsed.command === 'recover'
        ? await recoverRunState(operationOptions)
        : await exerciseRunState(operationOptions);
    stdout.write(`${canonicalJsonV1(result)}\n`);
    return result.classification === 'fail_closed' ? 1 : 0;
  } catch (error) {
    stderr.write(`${formatRC6Error(error)}\n`);
    return error instanceof RC6RunStateError ? error.exitCode : 1;
  }
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(process.argv[1]).href;
if (invokedPath === import.meta.url) process.exitCode = await runRC6RunStateCli();

export const RC6_CLI_INTERNALS_FOR_TESTS = Object.freeze({ parseArguments });
