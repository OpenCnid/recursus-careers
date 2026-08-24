#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  ReferenceError,
  createRegistration,
  formatReferenceError,
  runDryRun,
  validateReferenceEvidence,
} from './lib/recursus-reference.mjs';

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new ReferenceError('ARGUMENT', `Unexpected positional argument: ${token}`, 2);
    const key = token.slice(2);
    if (['json'].includes(key)) {
      values[key] = true;
      continue;
    }
    if (index + 1 >= rest.length || rest[index + 1].startsWith('--')) throw new ReferenceError('ARGUMENT', `Missing value for --${key}.`, 2);
    values[key] = rest[++index];
  }
  return { command, values };
}

export async function main(argv = []) {
  try {
    const { command, values } = parseArgs(argv);
    if (command === 'register') {
      const result = createRegistration({
        evidenceDir: values['evidence-dir'],
        registeredAt: values['registered-at'],
        repositoryRevision: values['repository-revision'],
        runnerBinarySha256: values['runner-binary-sha256'],
        runnerVersion: values['runner-version'],
      });
      process.stdout.write(`${JSON.stringify({ registration_id: result.registration.registration_id, source_snapshot_id: result.sourceSnapshot.snapshot_id })}\n`);
      return 0;
    }
    if (command === 'dry-run') {
      const result = runDryRun({ evidenceDir: values['evidence-dir'] });
      process.stdout.write(`${JSON.stringify({ attempt_id: result.attemptId, terminal_status: result.manifest.terminal_status })}\n`);
      return 0;
    }
    if (command === 'dry-run-check') {
      const first = runDryRun({ evidenceDir: values['evidence-dir'], ephemeral: true });
      const second = runDryRun({ evidenceDir: values['evidence-dir'], ephemeral: true });
      if (JSON.stringify(first) !== JSON.stringify(second)) throw new ReferenceError('DRY_RUN_NONDETERMINISTIC', 'Repeated dry-run projections differ.');
      process.stdout.write(`${JSON.stringify(first)}\n`);
      return 0;
    }
    if (command === 'validate') {
      const result = validateReferenceEvidence({ evidenceDir: values['evidence-dir'] });
      process.stdout.write(values.json ? `${JSON.stringify(result)}\n` : `RC-2 reference evidence validated: ${result.actual_attempt_count} actual attempt(s).\n`);
      return 0;
    }
    throw new ReferenceError('USAGE', 'Usage: node prepare-recursus-reference.mjs <register|dry-run|dry-run-check|validate> --evidence-dir <path>', 2);
  } catch (error) {
    process.stderr.write(`${formatReferenceError(error)}\n`);
    return error?.exitCode || 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) process.exitCode = await main(process.argv.slice(2));
