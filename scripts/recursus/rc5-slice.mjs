#!/usr/bin/env node

import { fileURLToPath } from 'node:url';

import {
  RC5_PROVIDER_AUTHORITY,
  RC5SliceError,
  formatRC5Error,
  prepareSlice,
  runSliceCase,
  summarizeSlice,
} from '../../lib/recursus/rc5-slice.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);

function parse(argv) {
  const [command, ...tokens] = argv;
  if (!['prepare', 'run', 'summarize'].includes(command)) {
    throw new RC5SliceError('RC5_USAGE', 'Usage: node scripts/recursus/rc5-slice.mjs <prepare|run|summarize> with explicit options.', 2);
  }
  const values = Object.create(null);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--provider-authority') {
      if (values.providerAuthority !== undefined) throw new RC5SliceError('RC5_ARGUMENT', 'Provider authority was repeated.', 2);
      values.providerAuthority = RC5_PROVIDER_AUTHORITY;
      continue;
    }
    if (!['--output-root', '--case', '--docker-executable'].includes(token) || values[token] !== undefined) {
      throw new RC5SliceError('RC5_ARGUMENT', 'An unknown or repeated option was supplied.', 2);
    }
    const value = tokens[index + 1];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new RC5SliceError('RC5_ARGUMENT', 'An option value is missing.', 2);
    }
    values[token] = value;
    index += 1;
  }
  if (values['--output-root'] === undefined) throw new RC5SliceError('RC5_ARGUMENT', 'The output root is required.', 2);
  if (command === 'prepare' && values['--docker-executable'] === undefined) {
    throw new RC5SliceError('RC5_ARGUMENT', 'Prepare requires an explicit Docker executable for the provider-free pinned-image probe.', 2);
  }
  if (command === 'run' && values['--case'] === undefined) throw new RC5SliceError('RC5_ARGUMENT', 'The case is required.', 2);
  if (command !== 'run' && (values['--case'] !== undefined || values.providerAuthority !== undefined)) {
    throw new RC5SliceError('RC5_ARGUMENT', 'Run-only options were supplied to another command.', 2);
  }
  if (command !== 'prepare' && values['--docker-executable'] !== undefined) {
    throw new RC5SliceError('RC5_ARGUMENT', 'The Docker executable is a prepare-only option.', 2);
  }
  return { command, values };
}

export async function runRC5SliceCli({ argv = [], services = {}, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const { command, values } = parse(argv);
    let result;
    if (command === 'prepare') {
      result = await prepareSlice({
        dockerExecutable: values['--docker-executable'],
        outputRoot: values['--output-root'],
        transportProbe: services.transportProbe,
      });
    }
    else if (command === 'run') {
      result = await runSliceCase({
        caseId: values['--case'],
        outputRoot: values['--output-root'],
        providerAuthority: values.providerAuthority,
      });
    } else result = await summarizeSlice({ outputRoot: values['--output-root'] });
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${formatRC5Error(error)}\n`);
    return error?.exitCode || 1;
  }
}

if (process.argv[1] === MODULE_PATH) {
  process.exitCode = await runRC5SliceCli({ argv: process.argv.slice(2) });
}
