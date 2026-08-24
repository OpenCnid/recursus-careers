/**
 * The only RC-2 module permitted to start the registered external runner.
 * Import this module only from the explicit actual-capture CLI.
 */

import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';
import {
  ReferenceError,
  buildLogicalArgv,
  buildPrompt,
  cleanupWorkspace,
  formatReferenceError,
  loadCapturePlan,
  prepareWorkspace,
  recordActualOutcome,
  reserveActualAttempt,
} from './recursus-reference.mjs';
import { sha256 } from './recursus-benchmark.mjs';

const MAX_STREAM_BYTES = 2_097_152;
const DISABLE_ENV = {
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  CLAUDE_CODE_DISABLE_TELEMETRY: '1',
  DISABLE_AUTOUPDATER: '1',
};

function reject(code, message, exitCode = 1) {
  throw new ReferenceError(code, message, exitCode);
}

function notReportedProvider() {
  return { id: 'not_reported', reporting_status: 'not_reported', version: 'not_reported' };
}

function notReportedModel() {
  return { id: 'not_reported', reasoning_effort: 'not_reported', reporting_status: 'not_reported', snapshot: 'not_reported' };
}

function reportedModel(id) {
  return { id, reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: id };
}

function classifyStartupText(text) {
  const folded = text.toLocaleLowerCase('en-US');
  return {
    authenticationUnavailable: /(?:not logged in|authentication required|please log in|invalid api key|missing api key|unauthorized)/u.test(folded),
    permissionDenied: /(?:permission denied|access denied|not permitted)/u.test(folded),
    routeUnsupported: /(?:unknown option|unrecognized option|invalid option|unknown skill|skill .* not found)/u.test(folded),
  };
}

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseClaudeStream(stdoutBytes, stderrBytes, processFacts = {}) {
  const stdout = stdoutBytes.toString('utf8');
  const stderr = stderrBytes.toString('utf8');
  const startup = classifyStartupText(`${stdout}\n${stderr}`);
  const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  let malformedEventCount = 0;
  let terminalCount = 0;
  let terminal = null;
  let modelId = null;
  let assistantEvents = 0;
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      malformedEventCount++;
      continue;
    }
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
      malformedEventCount++;
      continue;
    }
    if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string' && event.model.length > 0) modelId ||= event.model;
    if (event.type === 'assistant') {
      assistantEvents++;
      if (typeof event.message?.model === 'string' && event.message.model.length > 0) modelId ||= event.message.model;
    }
    if (event.type === 'result') {
      terminalCount++;
      terminal = event;
    }
  }
  const output = typeof terminal?.result === 'string' ? Buffer.from(terminal.result, 'utf8') : null;
  const usage = terminal?.usage && typeof terminal.usage === 'object' ? terminal.usage : {};
  const trustedTerminalSuccess = terminal
    ? terminal.subtype === 'success' && terminal.is_error === false
    : null;
  return {
    ...startup,
    conflictingTerminalEvents: terminalCount > 1,
    durationMs: nullableNumber(terminal?.duration_ms) ?? nullableNumber(processFacts.durationMs),
    environmentUnavailable: false,
    errorCode: null,
    errorMessage: null,
    exitCode: processFacts.exitCode ?? null,
    externalRunnerStarted: Boolean(processFacts.externalRunnerStarted),
    inputTokens: nullableNumber(usage.input_tokens),
    malformedEventCount,
    outputBytes: output,
    outputTokens: nullableNumber(usage.output_tokens),
    providerRequest: terminal || assistantEvents > 0 ? 'observed' : (startup.authenticationUnavailable ? 'not_made' : 'not_observed'),
    reportedModel: modelId ? reportedModel(modelId) : notReportedModel(),
    reportedProvider: notReportedProvider(),
    sensitiveCaptureBlocked: false,
    signal: processFacts.signal ?? null,
    timedOut: Boolean(processFacts.timedOut),
    totalCostUsd: nullableNumber(terminal?.total_cost_usd),
    traceEvents: [
      { event: 'workspace_created', code: 'ACTUAL_WORKSPACE', value: null },
      { event: 'seed_validated', code: 'RC1_SEED_VALID', value: processFacts.seedInventoryId ?? null },
      { event: 'invocation_constructed', code: 'ACTUAL_INVOCATION', value: processFacts.argvSha256 ?? null },
      { event: 'external_runner_started', code: processFacts.externalRunnerStarted ? 'RUNNER_STARTED' : 'RUNNER_NOT_STARTED', value: null },
      { event: 'external_runner_exited', code: processFacts.timedOut ? 'RUNNER_TIMEOUT' : 'RUNNER_EXITED', value: processFacts.exitCode ?? null },
      { event: 'output_captured', code: output ? 'OUTPUT_CAPTURED' : 'OUTPUT_MISSING', value: output?.length ?? 0 },
      { event: 'normalization_completed', code: 'ACTUAL_NORMALIZED', value: null },
    ],
    trustedTerminalEvent: terminalCount === 1,
    trustedTerminalSuccess,
  };
}

function validateExecutable(executable, registration) {
  if (typeof executable !== 'string' || executable.length === 0 || !isAbsolute(executable)) reject('RUNNER_PATH', 'Actual capture requires an explicit absolute native runner path.');
  if (extname(executable).toLocaleLowerCase('en-US') === '.cmd') reject('RUNNER_PATH', 'Shell wrapper executables are prohibited.');
  const real = realpathSync.native(resolve(executable));
  const stat = lstatSync(real);
  if (!stat.isFile() || stat.isSymbolicLink()) reject('RUNNER_PATH', 'Registered runner must be a regular native executable.');
  const bytes = readFileSync(real);
  if (sha256(bytes) !== registration.route.runner.binary_sha256) reject('RUNNER_DRIFT', 'Runner bytes do not match the preregistered SHA-256 digest.');
  return real;
}

function withDisabledAmbientTraffic(callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(DISABLE_ENV)) {
    previous.set(key, Object.hasOwn(process.env, key) ? process.env[key] : undefined);
    process.env[key] = value;
  }
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return Promise.resolve()
    .then(callback)
    .finally(restore);
}

export async function runRegisteredClaude(options = {}) {
  const loaded = loadCapturePlan({ evidenceDir: options.evidenceDir, repoRoot: options.repoRoot });
  const executable = validateExecutable(options.runnerExecutable, loaded.registration);
  const prompt = buildPrompt(loaded.plan.scenario_id);
  const argv = buildLogicalArgv(prompt, loaded.registration.budgets);
  const prepared = prepareWorkspace({ repoRoot: options.repoRoot, scenarioId: loaded.plan.scenario_id, tempRoot: options.tempRoot });
  const recordedAt = new Date().toISOString();
  reserveActualAttempt({ evidenceDir: loaded.evidenceRoot, recordedAt });
  let outcome;
  const startedAt = Date.now();
  try {
    const processResult = await withDisabledAmbientTraffic(() => new Promise((resolveProcess) => {
      let child;
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let timedOut = false;
      let streamLimit = false;
      let externalRunnerStarted = false;
      try {
        child = spawn(executable, argv, {
          cwd: prepared.workspace,
          shell: false,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (error) {
        resolveProcess({ error, exitCode: null, externalRunnerStarted: false, signal: null, stderr, stdout, timedOut: false });
        return;
      }
      child.once('spawn', () => { externalRunnerStarted = true; });
      const append = (current, chunk) => {
        if (current.length + chunk.length > MAX_STREAM_BYTES) {
          streamLimit = true;
          child.kill();
          return current;
        }
        return Buffer.concat([current, chunk]);
      };
      child.stdout.on('data', (chunk) => { stdout = append(stdout, Buffer.from(chunk)); });
      child.stderr.on('data', (chunk) => { stderr = append(stderr, Buffer.from(chunk)); });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, loaded.registration.budgets.wall_time_ms);
      child.once('error', (error) => {
        clearTimeout(timer);
        resolveProcess({ error, exitCode: null, externalRunnerStarted, signal: null, stderr, stdout, streamLimit, timedOut });
      });
      child.once('close', (exitCode, signal) => {
        clearTimeout(timer);
        resolveProcess({ error: null, exitCode, externalRunnerStarted, signal, stderr, stdout, streamLimit, timedOut });
      });
    }));
    if (processResult.error && !processResult.externalRunnerStarted) {
      outcome = {
        authenticationUnavailable: false,
        conflictingTerminalEvents: false,
        durationMs: Date.now() - startedAt,
        environmentUnavailable: true,
        errorCode: 'RUNNER_START_FAILED',
        errorMessage: 'The preregistered native runner could not be started.',
        exitCode: null,
        externalRunnerStarted: false,
        inputTokens: null,
        malformedEventCount: 0,
        outputBytes: null,
        outputTokens: null,
        permissionDenied: false,
        providerRequest: 'not_made',
        reportedModel: notReportedModel(),
        reportedProvider: notReportedProvider(),
        routeUnsupported: false,
        sensitiveCaptureBlocked: false,
        signal: null,
        timedOut: false,
        totalCostUsd: null,
        traceEvents: [
          { event: 'workspace_created', code: 'ACTUAL_WORKSPACE', value: null },
          { event: 'seed_validated', code: 'RC1_SEED_VALID', value: prepared.seedInventory.inventory_id },
          { event: 'invocation_constructed', code: 'ACTUAL_INVOCATION', value: sha256(Buffer.from(JSON.stringify(argv), 'utf8')) },
          { event: 'external_runner_started', code: 'RUNNER_NOT_STARTED', value: null },
        ],
        trustedTerminalEvent: false,
        trustedTerminalSuccess: null,
      };
    } else {
      outcome = parseClaudeStream(processResult.stdout, processResult.stderr, {
        argvSha256: sha256(Buffer.from(JSON.stringify(argv), 'utf8')),
        durationMs: Date.now() - startedAt,
        exitCode: processResult.exitCode,
        externalRunnerStarted: processResult.externalRunnerStarted,
        seedInventoryId: prepared.seedInventory.inventory_id,
        signal: processResult.signal,
        timedOut: processResult.timedOut,
      });
      if (processResult.streamLimit) {
        outcome.malformedEventCount++;
        outcome.errorCode = 'STREAM_BUDGET_EXCEEDED';
        outcome.errorMessage = 'The runner stream exceeded the registered capture bound.';
      }
    }
    return recordActualOutcome({
      evidenceDir: loaded.evidenceRoot,
      expectedAttemptId: loaded.plan.attempt_id,
      outcome,
      preReserved: true,
      prepared,
      recordedAt,
    });
  } finally {
    cleanupWorkspace(prepared);
  }
}

export function captureErrorText(error) {
  return formatReferenceError(error);
}
