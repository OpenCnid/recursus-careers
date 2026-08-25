#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { captureActualRoute, preflightRuntimeAuthority } from '../../lib/recursus/recursus-route-capture-v17.mjs';
import { RouteError, formatRouteError } from '../../lib/recursus/recursus-route-v17.mjs';

const CAPTURE_ENTRYPOINT_CAPABILITY = Object.freeze({});

export function isRegisteredCaptureEntrypointCapability(value) {
  return value === CAPTURE_ENTRYPOINT_CAPABILITY;
}

function parse(argv) {
  const [command, ...rest] = argv;
  if (!['actual', 'preflight'].includes(command)) throw new RouteError('USAGE', 'Usage: node scripts/recursus/capture-recursus-route-v17.mjs <preflight|actual> with explicit external paths.', 2);
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) throw new RouteError('ARGUMENT', 'Actual capture options must be explicit key/value pairs.', 2);
    const name = key.slice(2);
    if (values[name] !== undefined) throw new RouteError('ARGUMENT', 'Actual capture option is repeated.', 2);
    values[name] = value;
  }
  const allowed = command === 'actual'
    ? ['attempt-root', 'credential-home', 'docker-executable', 'evidence-dir', 'run-root']
    : ['attempt-root', 'credential-home', 'docker-executable'];
  for (const key of Object.keys(values)) if (!allowed.includes(key)) throw new RouteError('ARGUMENT', 'Unknown actual capture option.', 2);
  for (const key of allowed) if (values[key] === undefined) throw new RouteError('ARGUMENT', 'A required actual capture option is missing.', 2);
  return {
    command,
    options: {
      attemptRoot: values['attempt-root'],
      credentialHome: values['credential-home'],
      dockerExecutable: values['docker-executable'],
      evidenceDir: values['evidence-dir'],
      runRoot: values['run-root'],
    },
  };
}

async function main(argv = []) {
  try {
    const parsed = parse(argv);
    if (parsed.command === 'preflight') {
      const result = preflightRuntimeAuthority({ ...parsed.options, entrypointCapability: CAPTURE_ENTRYPOINT_CAPABILITY });
      process.stdout.write(`${JSON.stringify({ authority_status: 'pass', provider_or_adapter_invoked: result.provider_or_adapter_invoked })}\n`);
      return 0;
    }
    const result = await captureActualRoute({ ...parsed.options, entrypointCapability: CAPTURE_ENTRYPOINT_CAPABILITY });
    process.stdout.write(`${JSON.stringify({ attempt_id: result.intent.attempt_id, terminal_status: result.manifest.terminal_status, termination_reason: result.manifest.termination_reason })}\n`);
    return result.manifest.terminal_status === 'completed' && result.manifest.termination_reason === 'none' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${formatRouteError(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
