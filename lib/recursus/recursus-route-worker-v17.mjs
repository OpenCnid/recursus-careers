import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertStagingContentSafe } from './recursus-route-content-gate-v17.mjs';

const EXPECTED_MODEL = 'gpt-5.6-sol';
const EXPECTED_PROVIDER = 'openai-codex';
const EXPECTED_REASONING = 'xhigh';
const EXPECTED_CREDENTIAL_REF = 'OPENAI_CODEX_OAUTH';
const EXPECTED_MAX_TOKENS = 4_096;
const MAX_ARTIFACT_BYTES = 65_536;
const TRUSTED_WORKER_RESULTS = new WeakSet();
const OBSERVATION_KEYS = Object.freeze([
  'adapter_identity_matched', 'adapter_invocation_count', 'adapter_registered', 'application_fetch_count', 'artifact_captured', 'artifact_valid',
  'authentication_available', 'authority_attestation_valid', 'budget_exceeded', 'cli_transport_started',
  'content_scan_passed', 'credential_scan_passed', 'direct_adapter_invocation_observed',
  'discarded_reasoning_block_count', 'environment_available', 'failure_code', 'harness_identity_matched', 'identity_match', 'inbox_transition_matched', 'input_message_matched',
  'malformed_event_count', 'observed_unsupported_capabilities', 'oracle_scan_passed', 'permission_available', 'post_run_scan_passed', 'request_context_matched',
  'oauth_fetch_count', 'process_exit_code', 'process_signal', 'provider_identity_matched', 'provider_request_count',
  'proxy_denied_count', 'proxy_download_bytes', 'proxy_oauth_tunnel_count', 'proxy_responses_tunnel_count', 'proxy_upload_bytes',
  'registered_runtime_loaded', 'relay_connection_count', 'required_capabilities_supported', 'responses_fetch_count',
  'route_identity_matched', 'runner_input_validated', 'runtime_started', 'seed_validated',
  'timed_out', 'trusted_terminal_event_count', 'trusted_terminal_success',
  'text_block_count', 'unexpected_external_mutation', 'unregistered_fetch_count', 'wall_ms', 'workspace_unchanged',
].sort());

export class WorkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new WorkerError(code, message);
}

function trustedWorkerResult(result) {
  const envelope = Object.freeze({ artifactBytes: result.artifactBytes, observation: Object.freeze(result.observation) });
  TRUSTED_WORKER_RESULTS.add(envelope);
  return envelope;
}

function consumeTrustedWorkerResult(value) {
  if (!value || !TRUSTED_WORKER_RESULTS.has(value)) reject('UNTRUSTED_WORKER_RESULT', 'Actual evidence requires an in-process result from the registered direct-adapter worker.');
  TRUSTED_WORKER_RESULTS.delete(value);
  return value;
}

function boundArtifactBeforePersistence(result) {
  if (result.artifactBytes === null || result.artifactBytes.length <= MAX_ARTIFACT_BYTES) return result;
  return Object.freeze({
    artifactBytes: null,
    observation: Object.freeze({
      ...result.observation,
      artifact_captured: false,
      artifact_valid: false,
      budget_exceeded: true,
      content_scan_passed: false,
    }),
  });
}

function unsupportedWorkerResult() {
  return trustedWorkerResult({
    artifactBytes: null,
    observation: {
      adapter_identity_matched: false,
      adapter_invocation_count: 0,
      adapter_registered: false,
      application_fetch_count: 0,
      artifact_captured: false,
      artifact_valid: false,
      authentication_available: true,
      authority_attestation_valid: false,
      budget_exceeded: false,
      cli_transport_started: false,
      content_scan_passed: true,
      credential_scan_passed: true,
      direct_adapter_invocation_observed: false,
      discarded_reasoning_block_count: 0,
      environment_available: true,
      failure_code: 'none',
      harness_identity_matched: true,
      identity_match: false,
      inbox_transition_matched: false,
      input_message_matched: false,
      malformed_event_count: 0,
      observed_unsupported_capabilities: ['direct_adapter_transport'],
      oracle_scan_passed: true,
      oauth_fetch_count: 0,
      permission_available: true,
      post_run_scan_passed: true,
      request_context_matched: false,
      process_exit_code: null,
      process_signal: null,
      provider_identity_matched: false,
      provider_request_count: 0,
      proxy_denied_count: 0,
      proxy_download_bytes: 0,
      proxy_oauth_tunnel_count: 0,
      proxy_responses_tunnel_count: 0,
      proxy_upload_bytes: 0,
      registered_runtime_loaded: true,
      relay_connection_count: 0,
      required_capabilities_supported: false,
      responses_fetch_count: 0,
      route_identity_matched: true,
      runner_input_validated: true,
      runtime_started: true,
      seed_validated: true,
      timed_out: false,
      trusted_terminal_event_count: 0,
      trusted_terminal_success: null,
      text_block_count: 0,
      unexpected_external_mutation: false,
      unregistered_fetch_count: 0,
      wall_ms: 0,
      workspace_unchanged: true,
    },
  });
}

function nativeDirectory(pathValue, label) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) reject('WORKER_PATH', `${label} must be a native directory.`);
  return target;
}

function nativeFile(pathValue, label) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) reject('WORKER_PATH', `${label} must be a single-link native file.`);
  return target;
}

async function loadFromProfile(requireFromProfile, packageName) {
  let resolved;
  try {
    resolved = requireFromProfile.resolve(packageName);
  } catch {
    reject('PROFILE_INCOMPLETE', 'The exact Recursus profile is missing a registered runtime package.');
  }
  return import(pathToFileURL(resolved).href);
}

function count(events, type) {
  return events.filter((event) => event?.type === type).length;
}

function textArtifact(messageEvent) {
  const message = messageEvent?.data?.message;
  if (!message || !Array.isArray(message.content)) return { artifactBytes: null, discardedReasoningBlockCount: 0, textBlockCount: 0, valid: false };
  const textBlocks = message.content.filter((block) => block?.type === 'text');
  const reasoningBlocks = message.content.filter((block) => block?.type === 'reasoning');
  const valid = message.content.length > 0
    && message.content.length === textBlocks.length + reasoningBlocks.length
    && textBlocks.length > 0
    && textBlocks.every((block) => typeof block.text === 'string');
  const text = valid ? textBlocks.map((block) => block.text).join('') : '';
  return {
    artifactBytes: text.length > 0 ? Buffer.from(text, 'utf8') : null,
    discardedReasoningBlockCount: reasoningBlocks.length,
    textBlockCount: textBlocks.length,
    valid: valid && text.length > 0,
  };
}

function installApplicationFetchGuard() {
  const original = globalThis.fetch;
  if (typeof original !== 'function') reject('FETCH_AUTHORITY', 'The registered Node fetch implementation is unavailable.');
  const counts = { oauth: 0, responses: 0, unregistered: 0 };
  const guarded = function guardedFetch(input, init) {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
    let href = '';
    try { href = new URL(rawUrl).href; } catch {}
    if (method === 'POST' && href === 'https://chatgpt.com/backend-api/codex/responses') counts.responses++;
    else if (method === 'POST' && href === 'https://auth.openai.com/oauth/token') counts.oauth++;
    else counts.unregistered++;
    if (counts.responses > 1 || counts.oauth > 1 || counts.unregistered > 0) reject('FETCH_AUTHORITY', 'The direct adapter exceeded the registered application fetch authority.');
    return Reflect.apply(original, globalThis, [input, init]);
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: false, enumerable: true, value: guarded, writable: false });
  if (globalThis.fetch !== guarded) reject('FETCH_AUTHORITY', 'The application fetch guard could not be installed.');
  return Object.freeze({
    snapshot() {
      if (globalThis.fetch !== guarded) reject('FETCH_AUTHORITY', 'The application fetch guard was replaced during execution.');
      return Object.freeze({ ...counts });
    },
  });
}

function credentialScope(service) {
  const values = service?.values;
  if (!(values instanceof Map)) reject('CREDENTIAL_SCOPE', 'The pinned credential service does not expose the registered key-scope status.');
  const selectedReferencePresent = values.has(EXPECTED_CREDENTIAL_REF);
  return Object.freeze({
    selected_reference_present: selectedReferencePresent,
    unexpected_reference_count: values.size - (selectedReferencePresent ? 1 : 0),
  });
}

function observeEvents(events, requestCount, adapterInvocationCount, expected, wallMs, executionError, fetchCounts, requestText) {
  const headers = events.filter((event) => event?.type === 'request/header');
  const inboxTransitions = events.filter((event) => event?.type === 'agent/inbox/spliced');
  const requestContexts = events.filter((event) => event?.type === 'request/context');
  const userMessages = events.filter((event) => event?.type === 'user/message');
  const assistantMessages = events.filter((event) => event?.type === 'assistant/message');
  const turnEnds = events.filter((event) => event?.type === 'turn/end');
  const finishChunks = events.filter((event) => event?.type === 'assistant/chunk' && event?.data?.chunk?.type === 'finish');
  const toolEvents = events.filter((event) => event?.type === 'tool/call' || event?.type === 'tool/result');
  const allowedEventTypes = new Set(['agent/inbox/spliced', 'turn/start', 'step/start', 'user/message', 'request/header', 'request/context', 'assistant/chunk', 'assistant/message', 'step/end', 'turn/end']);
  const eventTypes = events.map((event) => event?.type);
  const orderedIndexes = ['turn/start', 'step/start', 'user/message', 'request/header', 'request/context', 'assistant/message', 'step/end', 'turn/end'].map((type) => eventTypes.indexOf(type));
  const ordered = orderedIndexes.every((index) => index >= 0) && orderedIndexes.every((index, position) => position === 0 || orderedIndexes[position - 1] < index);
  const finishIndex = events.indexOf(finishChunks[0]);
  const finishOrdered = finishIndex > eventTypes.indexOf('request/header') && finishIndex < eventTypes.indexOf('assistant/message');
  const header = headers[0]?.data?.header?.config;
  const assistantSource = assistantMessages[0]?.data?.message?.source;
  const userMessage = userMessages[0]?.data;
  const messageMatchesRequest = (message) => message?.source?.kind === 'user'
    && typeof message.id === 'string'
    && message.id.length > 0
    && Array.isArray(message.content)
    && message.content.length === 1
    && message.content[0]?.type === 'text'
    && message.content[0]?.text === requestText;
  const requestContext = requestContexts[0]?.data;
  const requestContextKeys = requestContext === null || typeof requestContext !== 'object' || Array.isArray(requestContext)
    ? []
    : Object.keys(requestContext).sort();
  const requestContextMatched = requestContexts.length === 1
    && requestContext?.provider === expected.provider
    && requestContext?.model === expected.model
    && requestContextKeys.includes('provider')
    && requestContextKeys.includes('model')
    && requestContextKeys.every((key) => key === 'provider' || key === 'model' || key === 'contextWindow')
    && (requestContext.contextWindow === undefined || (Number.isInteger(requestContext.contextWindow) && requestContext.contextWindow > 0));
  const inputMessageMatched = userMessages.length === 1 && messageMatchesRequest(userMessage);
  const inserted = inboxTransitions[0]?.data;
  const claimed = inboxTransitions[1]?.data;
  const insertedKeys = inserted === null || typeof inserted !== 'object' || Array.isArray(inserted) ? [] : Object.keys(inserted).sort();
  const claimedKeys = claimed === null || typeof claimed !== 'object' || Array.isArray(claimed) ? [] : Object.keys(claimed).sort();
  const inboxTransitionMatched = inboxTransitions.length === 2
    && insertedKeys.join('\0') === ['inserted', 'start', 'target'].join('\0')
    && inserted?.target === 'next-turn'
    && inserted.start === 0
    && Array.isArray(inserted.inserted)
    && inserted.inserted.length === 1
    && messageMatchesRequest(inserted.inserted[0])
    && inserted.inserted[0].id === userMessage?.id
    && claimedKeys.join('\0') === ['inserted', 'removedCount', 'start', 'target'].join('\0')
    && claimed?.target === 'next-turn'
    && claimed.start === 0
    && claimed.removedCount === 1
    && Array.isArray(claimed.inserted)
    && claimed.inserted.length === 0
    && events.indexOf(inboxTransitions[0]) < eventTypes.indexOf('turn/start')
    && events.indexOf(inboxTransitions[1]) > eventTypes.indexOf('turn/start')
    && events.indexOf(inboxTransitions[1]) < eventTypes.indexOf('step/start');
  const identityMatch = headers.length === 1
    && header?.provider === expected.provider
    && header?.model === expected.model
    && header?.reasoningEffort === expected.reasoningEffort
    && assistantSource?.provider === expected.provider
    && assistantSource?.model === expected.model;
  const extracted = textArtifact(assistantMessages[0]);
  const finishSucceeded = finishChunks[0]?.data?.chunk?.reason?.kind === 'stop';
  const coherentCounts = count(events, 'turn/start') === 1
    && count(events, 'step/start') === 1
    && count(events, 'step/end') === 1
    && assistantMessages.length === 1
    && turnEnds.length === 1
    && finishChunks.length === 1
    && inboxTransitionMatched
    && inputMessageMatched
    && requestContextMatched
    && finishSucceeded
    && extracted.valid
    && toolEvents.length === 0
    && events.every((event) => allowedEventTypes.has(event?.type))
    && ordered
    && finishOrdered;
  const success = turnEnds[0]?.data?.reason?.kind === 'completed' && finishSucceeded;
  const artifactBytes = extracted.artifactBytes;
  const applicationFetchCount = fetchCounts.oauth + fetchCounts.responses + fetchCounts.unregistered;
  return {
    artifactBytes,
    coherentCounts,
    identityMatch,
    observation: {
      adapter_identity_matched: identityMatch && adapterInvocationCount === 1,
      adapter_invocation_count: adapterInvocationCount,
      adapter_registered: true,
      application_fetch_count: applicationFetchCount,
      artifact_captured: artifactBytes !== null,
      artifact_valid: artifactBytes !== null && toolEvents.length === 0,
      authentication_available: true,
      authority_attestation_valid: false,
      budget_exceeded: requestCount > 1,
      cli_transport_started: false,
      content_scan_passed: true,
      credential_scan_passed: true,
      direct_adapter_invocation_observed: adapterInvocationCount === 1,
      discarded_reasoning_block_count: extracted.discardedReasoningBlockCount,
      environment_available: true,
      failure_code: executionError ? 'runtime_execution_error' : coherentCounts ? 'none' : 'runtime_event_shape',
      harness_identity_matched: true,
      identity_match: identityMatch,
      inbox_transition_matched: inboxTransitionMatched,
      input_message_matched: inputMessageMatched,
      malformed_event_count: coherentCounts ? 0 : 1,
      observed_unsupported_capabilities: [],
      oracle_scan_passed: true,
      oauth_fetch_count: fetchCounts.oauth,
      permission_available: true,
      post_run_scan_passed: true,
      request_context_matched: requestContextMatched,
      process_exit_code: null,
      process_signal: null,
      provider_identity_matched: identityMatch,
      provider_request_count: requestCount,
      proxy_denied_count: 0,
      proxy_download_bytes: 0,
      proxy_oauth_tunnel_count: 0,
      proxy_responses_tunnel_count: 0,
      proxy_upload_bytes: 0,
      registered_runtime_loaded: true,
      relay_connection_count: 0,
      required_capabilities_supported: true,
      responses_fetch_count: fetchCounts.responses,
      route_identity_matched: true,
      runner_input_validated: true,
      runtime_started: true,
      seed_validated: true,
      timed_out: false,
      trusted_terminal_event_count: turnEnds.length,
      trusted_terminal_success: executionError ? false : success,
      text_block_count: extracted.textBlockCount,
      unexpected_external_mutation: false,
      unregistered_fetch_count: fetchCounts.unregistered,
      wall_ms: wallMs,
      workspace_unchanged: true,
    },
  };
}

async function inspectAuthentication(options = {}) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const credentialPath = nativeFile(options.credentialPath, 'DSH credential document');
  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const [cordis, credentialLocal, credentialApi] = await Promise.all([
    loadFromProfile(requireFromProfile, '@deepseek-ai/cordis'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials-local'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials'),
  ]);
  const ctx = new cordis.Context();
  try {
    await ctx.plugin(credentialLocal.default, { path: credentialPath, watch: false });
    const status = await ctx.credentials.describe(credentialApi.credentialRef(EXPECTED_CREDENTIAL_REF));
    return Object.freeze({ configured: status.configured, source: status.source ?? null, writable: status.writable, ...credentialScope(ctx.credentials) });
  } finally {
    await ctx.fiber.dispose();
  }
}

async function runDirectAdapterWorker(options = {}) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const credentialPath = nativeFile(options.credentialPath, 'DSH credential document');
  const seedWorkspace = nativeDirectory(options.seedWorkspace, 'seed workspace');
  const lockDirectory = nativeDirectory(options.lockDirectory, 'runtime lock directory');
  if (options.provider !== EXPECTED_PROVIDER || options.model !== EXPECTED_MODEL || options.reasoningEffort !== EXPECTED_REASONING) reject('MODEL_IDENTITY', 'Worker request differs from the registered provider, model, or reasoning setting.');
  if (typeof options.request !== 'string' || options.request.length === 0) reject('WORKER_INPUT', 'Worker request must be a bounded string.');
  if (options.maxTokens !== EXPECTED_MAX_TOKENS) reject('WORKER_BUDGET', 'Worker token budget differs from registration.');
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 600_000) reject('WORKER_BUDGET', 'Worker timeout budget is invalid.');

  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const names = [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-llm',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-system-prompt',
    '@deepseek-ai/dsh-tools',
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-agent-loop',
    '@deepseek-ai/dsh-credentials-local',
    'deepseek-openai-codex',
  ];
  const fetchGuard = installApplicationFetchGuard();
  const [cordis, llm, session, systemPrompt, tools, agentApi, agentLoop, credentialLocal, codex] = await Promise.all(names.map((name) => loadFromProfile(requireFromProfile, name)));
  const ctx = new cordis.Context();
  let adapter;
  let releaseAdapter;
  let handle;
  let timer;
  let timedOut = false;
  try {
    await ctx.plugin(llm.default);
    await ctx.plugin(session.default);
    await ctx.plugin(systemPrompt.default, { includeHarnessIdentity: false, includeRuntimeContext: false, persona: '' });
    await ctx.plugin(tools.default, { mode: 'native' });
    await ctx.plugin(agentApi.default);
    await ctx.plugin(credentialLocal.default, { path: credentialPath, watch: false });
    const scope = credentialScope(ctx.credentials);
    if (!scope.selected_reference_present || scope.unexpected_reference_count !== 0) reject('CREDENTIAL_SCOPE', 'The dedicated credential home contains an unexpected credential reference.');
    await ctx.plugin(agentLoop.default, { agents: [], maxParallelToolCalls: 1 });
    if (ctx.tools.schemas().length !== 0) reject('UNEXPECTED_TOOL_SURFACE', 'The minimal route mounted a nonzero tool surface.');

    const config = codex.resolveConfig({ adapterTimeoutMs: options.timeoutMs, credentialRef: EXPECTED_CREDENTIAL_REF, lockDirectory });
    const description = await ctx.credentials.describe(config.credentialRef);
    if (!description.configured) reject('AUTHENTICATION_UNAVAILABLE', 'The runtime-managed credential reference is not configured.');
    const store = new codex.DshPiCredentialStore(ctx.credentials, {
      acquireTimeoutMs: config.credentialLockAcquireTimeoutMs,
      directory: config.lockDirectory,
      reference: config.credentialRef,
      staleMs: config.credentialLockStaleMs,
    });
    await store.validateDurable();
    adapter = new codex.OpenAICodexAdapter({ credentials: store, resolveAttachments: () => undefined, timeoutMs: config.adapterTimeoutMs });
    const directInfo = await adapter.resolveModel(EXPECTED_PROVIDER, EXPECTED_MODEL);
    const supportedEfforts = directInfo?.reasoning?.efforts?.map((item) => item.id) || [];
    if (directInfo?.provider !== EXPECTED_PROVIDER || directInfo?.id !== EXPECTED_MODEL || !supportedEfforts.includes(EXPECTED_REASONING)) return unsupportedWorkerResult();
    let adapterInvocationCount = 0;
    const stream = adapter.stream.bind(adapter);
    Object.defineProperty(adapter, 'stream', {
      configurable: false,
      enumerable: false,
      value(...args) {
        adapterInvocationCount++;
        if (adapterInvocationCount > 1) reject('ADAPTER_INVOCATION_BUDGET', 'The minimal route exceeded one direct-adapter invocation.');
        return stream(...args);
      },
      writable: false,
    });
    releaseAdapter = ctx.llm.registerAdapter([EXPECTED_PROVIDER], adapter);
    const dshInfo = await ctx.llm.resolveModelInfo(EXPECTED_PROVIDER, EXPECTED_MODEL);
    if (dshInfo?.provider !== directInfo.provider || dshInfo?.id !== directInfo.id) reject('MODEL_IDENTITY', 'DSH model resolution differs from the direct adapter.');

    let requestCount = 0;
    const selection = { assembled: undefined, current: { model: EXPECTED_MODEL, provider: EXPECTED_PROVIDER, reasoningEffort: EXPECTED_REASONING } };
    handle = await ctx.agents.create({
      agentOptions: { maxTokens: options.maxTokens, model: EXPECTED_MODEL, provider: EXPECTED_PROVIDER },
      meta: { cwd: seedWorkspace },
      sessionId: session.SessionId('rc3-fact-01-r01'),
      setup(agentCtx) {
        agentApi.installModelSelection(agentCtx, selection);
        agentCtx.on('agent/request', async (_payload, next) => {
          requestCount++;
          if (requestCount > 1) reject('PROVIDER_REQUEST_BUDGET', 'The minimal route exceeded one provider request.');
          return next();
        });
      },
    });
    await handle.agent.whenIdle();
    const firstSeq = handle.agent.session.seq;
    timer = setTimeout(() => {
      timedOut = true;
      handle.agent.cancel({ kind: 'hook', reason: 'rc3-wall-timeout' });
    }, options.timeoutMs);
    timer.unref?.();
    const startedAt = Date.now();
    let executionError = false;
    try {
      handle.agent.followup(llm.createUserMessage({ content: [{ text: options.request, type: 'text' }], source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      await ctx.sessions.flush(handle.agent.session);
    } catch {
      executionError = true;
    }
    const events = handle.agent.session.events.filter((event) => event.seq >= firstSeq);
    const result = observeEvents(events, requestCount, adapterInvocationCount, { model: EXPECTED_MODEL, provider: EXPECTED_PROVIDER, reasoningEffort: EXPECTED_REASONING }, Date.now() - startedAt, executionError, fetchGuard.snapshot(), options.request);
    if (timedOut) result.observation.timed_out = true;
    return trustedWorkerResult(result);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (handle !== undefined) {
      handle.agent.cancel({ kind: 'hook', reason: 'rc3-cleanup' });
      await handle.dispose();
    }
    if (releaseAdapter !== undefined) releaseAdapter();
    if (adapter !== undefined) adapter.dispose();
    await ctx.fiber.dispose();
  }
}

function strictWorkerInput(pathValue) {
  if (pathValue !== '/input/worker-input.json') reject('WORKER_INPUT', 'Worker input path differs from the registered container mount.');
  const value = JSON.parse(readFileSync(pathValue, 'utf8'));
  const expected = ['credentialPath', 'lockDirectory', 'maxTokens', 'model', 'profileDirectory', 'provider', 'reasoningEffort', 'request', 'seedWorkspace', 'timeoutMs'];
  if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\0') !== expected.sort().join('\0')) reject('WORKER_INPUT', 'Worker input fields differ from V17.');
  if (value.credentialPath !== '/credentials/.credentials.yaml'
      || value.lockDirectory !== '/locks'
      || value.profileDirectory !== '/opt/recursus-profile'
      || value.seedWorkspace !== '/seed') reject('WORKER_INPUT', 'Worker input authority paths differ from registration.');
  return value;
}

function assertContainerInvocation(command, inputPath, outputDirectory) {
  if (process.platform !== 'linux'
      || process.getuid?.() !== 65_532
      || process.getgid?.() !== 65_532
      || process.cwd() !== '/opt/rc3'
      || process.argv[1] !== '/opt/rc3/recursus-route-worker-v17.mjs'
      || !existsSync('/.dockerenv')
      || process.permission?.has('child') !== false
      || process.permission?.has('worker') !== false) reject('WORKER_AUTHORITY', 'Worker is outside the registered container authority context.');
  const actualArgs = [
    '--permission', '--use-env-proxy', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', '--allow-fs-read=/opt/rc3/recursus-route-content-gate-v17.mjs', '--allow-fs-read=/opt/rc3/recursus-route-html-entities-v17.mjs', '--allow-fs-read=/opt/rc3/recursus-route-worker-v17.mjs',
    '--allow-fs-read=/credentials', '--allow-fs-read=/input/worker-input.json',
    '--allow-fs-read=/seed', '--allow-fs-read=/output', '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials', '--allow-fs-write=/output', '--allow-fs-write=/locks', '--allow-fs-write=/tmp',
  ];
  const statusArgs = [
    '--permission', '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile', '--allow-fs-read=/opt/rc3/recursus-route-content-gate-v17.mjs', '--allow-fs-read=/opt/rc3/recursus-route-html-entities-v17.mjs', '--allow-fs-read=/opt/rc3/recursus-route-worker-v17.mjs',
    '--allow-fs-read=/credentials/.credentials.yaml', '--allow-fs-read=/output', '--allow-fs-write=/output',
  ];
  const expectedArgs = command === 'container-run' ? actualArgs : command === 'container-auth-status' ? statusArgs : [];
  if (JSON.stringify(process.execArgv) !== JSON.stringify(expectedArgs)) reject('WORKER_AUTHORITY', 'Worker Node permissions differ from the registered authority profile.');
  const commonEnvironment = {
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    NODE_ENV: 'production',
    NODE_VERSION: '24.19.0',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    YARN_VERSION: '1.22.22',
  };
  const expectedEnvironment = command === 'container-run'
    ? { ...commonEnvironment, HOME: '/tmp/rc3-home', HTTP_PROXY: 'http://127.0.0.1:8080', HTTPS_PROXY: 'http://127.0.0.1:8080', NO_PROXY: '', TMPDIR: '/tmp', TZ: 'UTC' }
    : { ...commonEnvironment, HOME: '/nonexistent', TZ: 'America/Chicago' };
  const allowedKeys = new Set([...Object.keys(expectedEnvironment), 'HOSTNAME']);
  if (Object.keys(process.env).some((key) => !allowedKeys.has(key))
      || Object.entries(expectedEnvironment).some(([key, value]) => process.env[key] !== value)) reject('WORKER_AUTHORITY', 'Worker environment differs from the closed registered allowlist.');
  if (command === 'container-run' && (inputPath !== '/input/worker-input.json' || outputDirectory !== '/output')) reject('WORKER_AUTHORITY', 'Worker run paths differ from registration.');
  if (command === 'container-auth-status' && (inputPath !== '/output' || outputDirectory !== undefined)) reject('WORKER_AUTHORITY', 'Worker status paths differ from registration.');
}

async function runCli(argv) {
  const [command, inputPath, outputDirectory] = argv;
  assertContainerInvocation(command, inputPath, outputDirectory);
  if (command === 'container-auth-status') {
    const output = nativeDirectory(inputPath, 'worker status output directory');
    const status = await inspectAuthentication({ credentialPath: '/credentials/.credentials.yaml', profileDirectory: '/opt/recursus-profile' });
    writeFileSync(join(output, 'authentication-status.json'), `${JSON.stringify(status)}\n`, { encoding: 'utf8', flag: 'wx' });
    return;
  }
  if (command !== 'container-run') reject('WORKER_USAGE', 'Worker container command is invalid.');
  const output = nativeDirectory(outputDirectory, 'worker output directory');
  const result = boundArtifactBeforePersistence(consumeTrustedWorkerResult(await runDirectAdapterWorker(strictWorkerInput(inputPath))));
  if (result.artifactBytes !== null) {
    try { assertStagingContentSafe(result.artifactBytes, 'provider artifact'); } catch { reject('STAGING_CONTENT_REJECTED', 'Provider artifact failed the pre-persistence content gate.'); }
    writeFileSync(join(output, 'assistant-output.md'), result.artifactBytes, { flag: 'wx' });
  }
  writeFileSync(join(output, 'worker-observation.json'), `${JSON.stringify(result.observation)}\n`, { encoding: 'utf8', flag: 'wx' });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    try {
      const output = process.argv.at(-1);
      if (typeof output === 'string' && isAbsolute(output) && existsSync(output)) {
        const code = error instanceof WorkerError ? error.code : 'WORKER_FAILED';
        writeFileSync(join(output, 'worker-failure.json'), `${JSON.stringify({ code, status: 'failed' })}\n`, { encoding: 'utf8', flag: 'wx' });
      }
    } catch {}
    process.exitCode = 1;
  }
}
