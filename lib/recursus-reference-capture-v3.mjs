/**
 * The only RC-2 module permitted to start the registered external runner.
 * Import this module only from the explicit actual-capture CLI.
 */

import { spawn } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, posix, resolve, win32 } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import {
  ReferenceError,
  assertRegisteredEnvironment,
  buildLogicalArgv,
  buildPrompt,
  cleanupWorkspace,
  formatReferenceError,
  loadCapturePlan,
  prepareWorkspace,
  recordActualOutcome,
  reserveActualAttempt,
} from './recursus-reference-v3.mjs';
import { sha256 } from './recursus-benchmark.mjs';

const MAX_STREAM_BYTES = 2_097_152;
const MAX_REPORTED_MODEL_LENGTH = 128;
const TERMINAL_ERROR_SUBTYPES = new Set([
  'error_during_execution',
  'error_max_budget_usd',
  'error_max_structured_output_retries',
  'error_max_turns',
]);
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
  return { id, reasoning_effort: 'not_reported', reporting_status: 'reported', snapshot: 'not_reported' };
}

function classifyStartupText(text) {
  const folded = text.toLocaleLowerCase('en-US');
  return {
    authenticationUnavailable: /(?:failed to authenticate|oauth session expired|could not be refreshed|not logged in|authentication required|please log in|invalid api key|missing api key|unauthorized)/u.test(folded),
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
  const lines = stdout.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  let malformedEventCount = 0;
  let terminalCount = 0;
  let terminal = null;
  const modelIds = new Set();
  let invalidModelIdentity = false;
  let assistantToolCalls = 0;
  let streamToolCalls = 0;
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
    if (event.type === 'system' && event.subtype === 'init' && typeof event.model === 'string' && event.model.length > 0) {
      if ([...event.model].length > MAX_REPORTED_MODEL_LENGTH) invalidModelIdentity = true;
      else modelIds.add(event.model);
    }
    if (event.type === 'assistant') {
      if (typeof event.message?.model === 'string' && event.message.model.length > 0) {
        if ([...event.message.model].length > MAX_REPORTED_MODEL_LENGTH) invalidModelIdentity = true;
        else modelIds.add(event.message.model);
      }
      if (Array.isArray(event.message?.content)) assistantToolCalls += event.message.content.filter((block) => block?.type === 'tool_use').length;
    }
    if (event.type === 'stream_event' && event.event?.type === 'content_block_start' && event.event.content_block?.type === 'tool_use') streamToolCalls++;
    if (event.type === 'result') {
      terminalCount++;
      terminal = event;
    }
  }
  const terminalEnvelopeValid = terminal !== null
    && typeof terminal?.subtype === 'string'
    && typeof terminal?.is_error === 'boolean'
    && ((terminal.subtype === 'success' && terminal.is_error === false)
      || (TERMINAL_ERROR_SUBTYPES.has(terminal.subtype) && terminal.is_error === true));
  if (terminalCount === 1 && !terminalEnvelopeValid) malformedEventCount++;
  const terminalFailureText = terminalEnvelopeValid && terminal.is_error === true && typeof terminal.result === 'string'
    ? terminal.result
    : '';
  const startup = classifyStartupText(`${stderr}\n${terminalFailureText}`);
  const emptyTerminalOutput = terminalEnvelopeValid && typeof terminal.result === 'string' && terminal.result.trim().length === 0;
  if (emptyTerminalOutput) malformedEventCount++;
  const output = terminalEnvelopeValid && typeof terminal.result === 'string' && !emptyTerminalOutput ? Buffer.from(terminal.result, 'utf8') : null;
  const usage = terminalEnvelopeValid && terminal.usage && typeof terminal.usage === 'object' ? terminal.usage : {};
  const trustedTerminalSuccess = terminalEnvelopeValid ? terminal.subtype === 'success' : null;
  const parsedToolCallCount = streamToolCalls > 0 ? streamToolCalls : assistantToolCalls;
  const toolCallCount = Math.max(parsedToolCallCount, Number.isInteger(processFacts.toolCallCount) ? processFacts.toolCallCount : 0);
  const maxToolCalls = Number.isInteger(processFacts.maxToolCalls) ? processFacts.maxToolCalls : 0;
  const modelIdentityInvalid = invalidModelIdentity || modelIds.size > 1 || modelIds.has('not_reported');
  if (modelIdentityInvalid) malformedEventCount++;
  const modelId = modelIds.size === 1 && !modelIdentityInvalid ? [...modelIds][0] : null;
  return {
    ...startup,
    cacheCreationInputTokens: nullableNumber(usage.cache_creation_input_tokens),
    cacheReadInputTokens: nullableNumber(usage.cache_read_input_tokens),
    conflictingTerminalEvents: terminalCount > 1,
    durationMs: nullableNumber(terminalEnvelopeValid ? terminal.duration_ms : null) ?? nullableNumber(processFacts.durationMs),
    environmentUnavailable: false,
    errorCode: modelIdentityInvalid ? 'MODEL_IDENTITY_INVALID' : (emptyTerminalOutput ? 'EMPTY_RESULT' : null),
    errorMessage: modelIdentityInvalid
      ? 'Runner-reported model identity was conflicting, reserved, or over length.'
      : (emptyTerminalOutput ? 'Runner terminal output was empty or whitespace-only.' : null),
    exitCode: processFacts.exitCode ?? null,
    externalRunnerStarted: Boolean(processFacts.externalRunnerStarted),
    inputTokens: nullableNumber(usage.input_tokens),
    malformedEventCount,
    outputBytes: output,
    outputTokens: nullableNumber(usage.output_tokens),
    providerRequest: 'not_observed',
    reportedModel: modelId ? reportedModel(modelId) : notReportedModel(),
    reportedProvider: notReportedProvider(),
    sensitiveCaptureBlocked: false,
    signal: processFacts.signal ?? null,
    timedOut: Boolean(processFacts.timedOut),
    toolBudgetExceeded: Boolean(processFacts.toolBudgetExceeded) || toolCallCount > maxToolCalls,
    toolCallCount,
    totalCostUsd: nullableNumber(terminalEnvelopeValid ? terminal.total_cost_usd : null),
    traceEvents: [
      { event: 'workspace_created', code: 'ACTUAL_WORKSPACE', value: null },
      { event: 'seed_validated', code: 'RC1_SEED_VALID', value: processFacts.seedInventoryId ?? null },
      { event: 'invocation_constructed', code: 'ACTUAL_INVOCATION', value: processFacts.argvSha256 ?? null },
      { event: 'external_runner_started', code: processFacts.externalRunnerStarted ? 'RUNNER_STARTED' : 'RUNNER_NOT_STARTED', value: null },
      { event: 'external_runner_exited', code: processFacts.timedOut ? 'RUNNER_TIMEOUT' : 'RUNNER_EXITED', value: processFacts.exitCode ?? null },
      { event: 'output_captured', code: output ? 'OUTPUT_CAPTURED' : 'OUTPUT_MISSING', value: output?.length ?? 0 },
      { event: 'tool_budget_observed', code: Boolean(processFacts.toolBudgetExceeded) || toolCallCount > maxToolCalls ? 'TOOL_BUDGET_EXCEEDED' : 'TOOL_BUDGET_WITHIN_LIMIT', value: toolCallCount },
      { event: 'normalization_completed', code: 'ACTUAL_NORMALIZED', value: null },
    ],
    trustedTerminalEvent: terminalCount === 1 && terminalEnvelopeValid,
    trustedTerminalSuccess,
  };
}

export function validateRunnerPathSyntax(executable, hostPlatform = process.platform) {
  if (typeof executable !== 'string' || executable.length === 0 || executable.includes('\0')) reject('RUNNER_PATH', 'Actual capture requires an explicit absolute native runner path.');
  const windowsPrefix = /^[A-Za-z]:/u.test(executable) || /^[\\/]{2}/u.test(executable);
  if (/^[\\/]{2}/u.test(executable)) reject('RUNNER_PATH', 'UNC and Windows device namespace runner paths are prohibited.');
  if (hostPlatform === 'win32') {
    if (!/^[A-Za-z]:[\\/](?![\\/])/u.test(executable) || executable.slice(2).includes(':') || !win32.isAbsolute(executable)) reject('RUNNER_PATH', 'Windows capture requires a local drive-rooted native executable path.');
    if (win32.extname(executable).toLocaleLowerCase('en-US') !== '.exe') reject('RUNNER_PATH', 'Windows capture requires a native .exe runner.');
    return executable;
  }
  if (windowsPrefix || !posix.isAbsolute(executable) || executable.includes(':')) reject('RUNNER_PATH', 'Actual capture requires a host-native absolute runner path.');
  if (new Set(['.bat', '.cjs', '.cmd', '.js', '.mjs', '.ps1', '.sh']).has(extname(executable).toLocaleLowerCase('en-US'))) reject('RUNNER_PATH', 'Shell and script runner paths are prohibited.');
  return executable;
}

export function terminateChildHard(child) {
  if (!child || typeof child.kill !== 'function') return false;
  try {
    return child.kill('SIGKILL') !== false;
  } catch {
    return false;
  }
}

function validateExecutable(executable, registration) {
  validateRunnerPathSyntax(executable);
  let real;
  let stat;
  try {
    real = realpathSync.native(resolve(executable));
    stat = lstatSync(real);
  } catch {
    reject('RUNNER_UNAVAILABLE', 'The preregistered native runner path is unavailable.');
  }
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

function blockedRunnerOutcome(prepared, argv, error) {
  return {
    authenticationUnavailable: false,
    conflictingTerminalEvents: false,
    durationMs: 0,
    environmentUnavailable: true,
    errorCode: error instanceof ReferenceError ? error.code : 'RUNNER_UNAVAILABLE',
    errorMessage: 'The preregistered native runner was unavailable before process start.',
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
    toolBudgetExceeded: false,
    toolCallCount: 0,
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
}

export async function runRegisteredClaude(options = {}) {
  validateRunnerPathSyntax(options.runnerExecutable);
  const allowTestRoot = options.allowTestRoot === true;
  const loaded = loadCapturePlan({ allowTestRoot, evidenceDir: options.evidenceDir, repoRoot: options.repoRoot });
  const observedEnvironment = allowTestRoot && options.observedEnvironmentForTest
    ? options.observedEnvironmentForTest
    : undefined;
  assertRegisteredEnvironment(loaded.registration, observedEnvironment);
  const prompt = buildPrompt(loaded.plan.scenario_id);
  const argv = buildLogicalArgv(prompt, loaded.registration.budgets);
  const prepared = prepareWorkspace({ repoRoot: options.repoRoot, scenarioId: loaded.plan.scenario_id, tempRoot: options.tempRoot });
  const recordedAt = new Date().toISOString();
  try {
    if (allowTestRoot && typeof options.beforeReserveForTest === 'function') await options.beforeReserveForTest();
    const reservation = reserveActualAttempt({
      evidenceDir: loaded.evidenceRoot,
      expectedAttemptId: loaded.plan.attempt_id,
      recordedAt,
    });
    if (reservation.plan.attempt_id !== loaded.plan.attempt_id) reject('ATTEMPT_ORDER', 'Reserved attempt differs from the validated capture plan.');
    let executable;
    try {
      executable = validateExecutable(options.runnerExecutable, loaded.registration);
    } catch (error) {
      return recordActualOutcome({
        evidenceDir: loaded.evidenceRoot,
        expectedAttemptId: loaded.plan.attempt_id,
        outcome: blockedRunnerOutcome(prepared, argv, error),
        preReserved: true,
        prepared,
        recordedAt,
      });
    }
    let outcome;
    const startedAt = Date.now();
    const processResult = await withDisabledAmbientTraffic(() => new Promise((resolveProcess) => {
      let child;
      let stdout = Buffer.alloc(0);
      let stderr = Buffer.alloc(0);
      let timedOut = false;
      let streamLimit = false;
      let capturedBytes = 0;
      let externalRunnerStarted = false;
      let toolBudgetExceeded = false;
      let anonymousToolCalls = 0;
      const toolIds = new Set();
      const decoder = new StringDecoder('utf8');
      let pendingLine = '';
      let toolObservationFinished = false;
      let timer = null;
      let hardStopTimer = null;
      let hardStopRequested = false;
      let settled = false;
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
      const observeEventLine = (line) => {
        let event;
        try { event = JSON.parse(line); } catch { return; }
        const blocks = [];
        if (event?.type === 'stream_event' && event.event?.type === 'content_block_start') blocks.push(event.event.content_block);
        if (event?.type === 'assistant' && Array.isArray(event.message?.content)) blocks.push(...event.message.content);
        for (const block of blocks) {
          if (block?.type !== 'tool_use') continue;
          if (typeof block.id === 'string' && block.id.length > 0) toolIds.add(block.id);
          else anonymousToolCalls++;
        }
        const count = toolIds.size + anonymousToolCalls;
        if (count > loaded.registration.budgets.max_tool_calls && !toolBudgetExceeded) {
          toolBudgetExceeded = true;
          requestHardStop();
        }
      };
      const observeToolCalls = (chunk) => {
        const lines = `${pendingLine}${decoder.write(chunk)}`.split(/\r?\n/u);
        pendingLine = lines.pop() || '';
        for (const line of lines) observeEventLine(line);
      };
      const finishToolObservation = () => {
        if (toolObservationFinished) return;
        toolObservationFinished = true;
        const finalLine = `${pendingLine}${decoder.end()}`;
        if (finalLine.trim().length > 0) observeEventLine(finalLine);
        pendingLine = '';
      };
      const settleProcess = (error, exitCode, signal) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (hardStopTimer) clearTimeout(hardStopTimer);
        finishToolObservation();
        resolveProcess({ error, exitCode, externalRunnerStarted, signal, stderr, stdout, streamLimit, timedOut, toolBudgetExceeded, toolCallCount: toolIds.size + anonymousToolCalls });
      };
      const requestHardStop = () => {
        if (settled || hardStopRequested) return;
        hardStopRequested = true;
        terminateChildHard(child);
        hardStopTimer = setTimeout(() => {
          child.stdout?.destroy();
          child.stderr?.destroy();
          child.unref?.();
          settleProcess(null, null, 'SIGKILL');
        }, 1_000);
      };
      const append = (current, chunk, inspectTools = false) => {
        if (capturedBytes + chunk.length > loaded.registration.budgets.max_capture_bytes || loaded.registration.budgets.max_capture_bytes !== MAX_STREAM_BYTES) {
          streamLimit = true;
          requestHardStop();
          return current;
        }
        capturedBytes += chunk.length;
        if (inspectTools) observeToolCalls(chunk);
        return Buffer.concat([current, chunk]);
      };
      child.stdout.on('data', (chunk) => { stdout = append(stdout, Buffer.from(chunk), true); });
      child.stderr.on('data', (chunk) => { stderr = append(stderr, Buffer.from(chunk)); });
      timer = setTimeout(() => {
        timedOut = true;
        requestHardStop();
      }, loaded.registration.budgets.wall_time_ms);
      child.once('error', (error) => {
        settleProcess(error, null, null);
      });
      child.once('close', (exitCode, signal) => {
        settleProcess(null, exitCode, signal);
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
        toolBudgetExceeded: false,
        toolCallCount: 0,
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
        maxToolCalls: loaded.registration.budgets.max_tool_calls,
        toolBudgetExceeded: processResult.toolBudgetExceeded,
        toolCallCount: processResult.toolCallCount,
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
