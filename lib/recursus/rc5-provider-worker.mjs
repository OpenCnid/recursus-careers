import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const EXPECTED_PROVIDER = 'openai-codex';
const EXPECTED_MODEL = 'gpt-5.6-sol';
const EXPECTED_REASONING = 'xhigh';
const EXPECTED_CREDENTIAL_REF = 'OPENAI_CODEX_OAUTH';
const EXPECTED_CAPABILITY = 'ordered_system_user_messages_v1';
const EXPECTED_INTERFACE = 'RC5-DSH-ORDERED-PARTS-DRAFT';
const EXPECTED_INTERFACE_VERSION = '0.0.0-draft';
const EXPECTED_WIRE_CONTRACT = 'recursus-dsh-ordered-parts-v1';
const EXPECTED_TARGET = 'recursus-direct-v1';
const RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const OAUTH_ENDPOINT = 'https://auth.openai.com/oauth/token';
const EXPECTED_MAX_TOKENS = 4_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_ARTIFACT_BYTES = 65_536;
const MAX_INPUT_BYTES = 1_048_576;
const ROLE_SEQUENCE = Object.freeze(['system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system']);
const CASE_IDS = new Set(['FACT-01', 'FACT-03', 'SAFE-01']);
const REQUEST_IDENTITIES = Object.freeze({
  'FACT-01': Object.freeze({ digest: '7a63482e682d5de5a06b39dd034a41aa4aaa328d06cca110218c66376a5a6873', fixture: 'oferta-ordinary' }),
  'FACT-03': Object.freeze({ digest: 'dafa9c16e5f548bfd1cf704b1724670af341f4ad963f4d8ae2dd59a49859db8f', fixture: 'oferta-budget' }),
  'SAFE-01': Object.freeze({ digest: 'bc4fe0c277a5ae9aff99be62750abc65df063c84739355cf081b1ed86faa75f2', fixture: 'oferta-injection' }),
});
const PROVIDER_AUTHORITY = 'I authorize RC-5 to make at most three direct-adapter provider calls, one each for FACT-01, FACT-03, and SAFE-01, with no retries and the limits in `docs/recursus/RC5_SLICE_CARD.md`.';

export class RC5ProviderWorkerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RC5ProviderWorkerError';
    this.code = code;
  }
}

function reject(code, message) {
  throw new RC5ProviderWorkerError(code, message);
}

function exactKeys(value, keys, code = 'WORKER_INPUT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    reject(code, 'A closed worker object has an unknown or missing field.');
  }
}

function assertNoLoneSurrogates(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (!(following >= 0xdc00 && following <= 0xdfff)) reject('WORKER_CANONICAL_JSON', 'Worker JSON contains invalid Unicode.');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      reject('WORKER_CANONICAL_JSON', 'Worker JSON contains invalid Unicode.');
    }
  }
}

function canonicalValue(value, depth = 0) {
  if (depth > 64) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the structure bound.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    assertNoLoneSurrogates(value);
    if (Array.from(value).length > 262_144) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the string bound.');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a noncanonical number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length > 16_384) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the array bound.');
    return `[${value.map((item) => canonicalValue(item, depth + 1)).join(',')}]`;
  }
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a non-JSON value.');
  }
  const keys = Object.keys(value).sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  if (keys.length > 16_384) reject('WORKER_CANONICAL_JSON', 'Worker JSON exceeds the object bound.');
  return `{${keys.map((key) => {
    assertNoLoneSurrogates(key);
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') reject('WORKER_CANONICAL_JSON', 'Worker JSON contains a prohibited key.');
    return `${JSON.stringify(key)}:${canonicalValue(value[key], depth + 1)}`;
  }).join(',')}}`;
}

function canonicalJson(value) {
  return `${canonicalValue(value)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function nativeDirectory(pathValue, label, requireEmpty = false) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) reject('WORKER_PATH', `${label} must be a native directory.`);
  if (requireEmpty && readdirSync(target).length !== 0) reject('WORKER_PATH', `${label} must be empty.`);
  return target;
}

function nativeFile(pathValue, label, maxBytes = MAX_INPUT_BYTES) {
  if (typeof pathValue !== 'string' || !isAbsolute(pathValue)) reject('WORKER_PATH', `${label} must be absolute.`);
  const target = resolve(pathValue);
  if (!existsSync(target)) reject('WORKER_PATH', `${label} is unavailable.`);
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maxBytes) {
    reject('WORKER_PATH', `${label} must be a bounded single-link native file.`);
  }
  return target;
}

function readCanonicalJson(pathValue, label) {
  const file = nativeFile(pathValue, label);
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { reject('WORKER_INPUT', `${label} is invalid.`); }
  if (!bytes.equals(Buffer.from(canonicalJson(value), 'utf8'))) reject('WORKER_INPUT', `${label} is not canonical JSON.`);
  return value;
}

function writeExclusiveJson(directory, name, value) {
  writeFileSync(join(directory, name), canonicalJson(value), { encoding: 'utf8', flag: 'wx' });
}

async function loadFromProfile(requireFromProfile, packageName) {
  let resolved;
  try { resolved = requireFromProfile.resolve(packageName); } catch {
    reject('PROFILE_INCOMPLETE', 'The pinned profile is missing a registered runtime package.');
  }
  try { return await import(pathToFileURL(resolved).href); } catch {
    reject('PROFILE_INCOMPLETE', 'A registered runtime package could not be loaded.');
  }
}

function requestProjection(request) {
  const copy = JSON.parse(JSON.stringify(request));
  delete copy.request_digest;
  return copy;
}

function validateMessage(message, ordinal, scenarioId) {
  exactKeys(message, [
    'canonical_block_id', 'canonical_block_ordinal', 'content', 'content_encoding', 'message_id', 'ordinal', 'role',
    'semantic_envelope_byte_count', 'semantic_envelope_sha256', 'source', 'target_field',
  ]);
  const expectedRole = ROLE_SEQUENCE[ordinal];
  const expectedTarget = expectedRole === 'system' ? 'harness.system' : 'harness.user';
  if (message.role !== expectedRole || message.target_field !== expectedTarget || message.ordinal !== ordinal ||
      !Number.isInteger(message.canonical_block_ordinal) || message.canonical_block_ordinal < 0 ||
      typeof message.canonical_block_id !== 'string' || message.canonical_block_id.length === 0 ||
      message.message_id !== `rc5-${scenarioId.toLocaleLowerCase('en-US')}-${String(ordinal).padStart(2, '0')}` ||
      message.content_encoding !== 'canonical-json-utf8-lf-v1' ||
      !Number.isInteger(message.semantic_envelope_byte_count) || message.semantic_envelope_byte_count < 1 ||
      !/^[a-f0-9]{64}$/u.test(message.semantic_envelope_sha256 || '')) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message identity differs from RC-5.');
  }
  exactKeys(message.source, ['kind', 'plugin']);
  if (message.source.kind !== 'plugin' || message.source.plugin !== EXPECTED_WIRE_CONTRACT) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message source differs from RC-5.');
  }
  if (!Array.isArray(message.content) || message.content.length !== 1) reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message is not text-only.');
  exactKeys(message.content[0], ['text', 'type']);
  const text = message.content[0].text;
  if (message.content[0].type !== 'text' || typeof text !== 'string' || text.length === 0 ||
      Buffer.byteLength(text, 'utf8') !== message.semantic_envelope_byte_count || sha256(text) !== message.semantic_envelope_sha256) {
    reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body differs from its registered identity.');
  }
  let semanticEnvelope;
  try { semanticEnvelope = JSON.parse(text); } catch { reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body is not JSON.'); }
  if (canonicalJson(semanticEnvelope) !== text) reject('WORKER_REQUEST_DRIFT', 'An ordered DSH message body is not canonical JSON.');
}

export function validateOrderedWorkerRequest(request) {
  exactKeys(request, [
    'dsh_generate_options', 'execution', 'fixture_id', 'interface', 'request_digest', 'request_id', 'route_bundle',
    'scenario_id', 'schema_version',
  ]);
  if (request.schema_version !== '1.0.0' || !CASE_IDS.has(request.scenario_id) ||
      request.request_id !== `RC5-DSH-ORDERED-PARTS-${request.scenario_id}` ||
      request.fixture_id !== REQUEST_IDENTITIES[request.scenario_id]?.fixture) {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 request identity differs.');
  }
  exactKeys(request.interface, ['id', 'required_transport_capability', 'status', 'version', 'wire_contract']);
  if (request.interface.id !== EXPECTED_INTERFACE || request.interface.version !== EXPECTED_INTERFACE_VERSION ||
      request.interface.required_transport_capability !== EXPECTED_CAPABILITY || request.interface.wire_contract !== EXPECTED_WIRE_CONTRACT ||
      request.interface.status !== 'mutable_provider_free_draft') {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 request interface differs.');
  }
  exactKeys(request.request_digest, ['algorithm', 'value']);
  const expectedDigest = sha256(canonicalJson(requestProjection(request)));
  if (request.request_digest.algorithm !== 'sha256' || request.request_digest.value !== expectedDigest ||
      request.request_digest.value !== REQUEST_IDENTITIES[request.scenario_id].digest) {
    reject('WORKER_REQUEST_DIGEST', 'The RC-5 request digest does not reconcile.');
  }
  exactKeys(request.route_bundle, ['canonical_compilation_sha256', 'route_bundle_digest', 'route_bundle_id', 'target_id']);
  if (request.route_bundle.target_id !== EXPECTED_TARGET || typeof request.route_bundle.route_bundle_id !== 'string' ||
      request.route_bundle.route_bundle_id.length === 0 ||
      !/^[a-f0-9]{64}$/u.test(request.route_bundle.route_bundle_digest || '') ||
      !/^[a-f0-9]{64}$/u.test(request.route_bundle.canonical_compilation_sha256 || '')) {
    reject('WORKER_REQUEST_IDENTITY', 'The RC-5 route binding differs.');
  }
  const options = request.dsh_generate_options;
  exactKeys(options, ['maxTokens', 'messages', 'model', 'provider', 'reasoningEffort', 'sessionId', 'tools']);
  if (options.provider !== EXPECTED_PROVIDER || options.model !== EXPECTED_MODEL || options.reasoningEffort !== EXPECTED_REASONING ||
      options.maxTokens !== EXPECTED_MAX_TOKENS || options.sessionId !== `rc5-${request.scenario_id.toLocaleLowerCase('en-US')}` ||
      !Array.isArray(options.tools) || options.tools.length !== 0 || !Array.isArray(options.messages) || options.messages.length !== 9 ||
      Object.hasOwn(options, 'system')) {
    reject('WORKER_REQUEST_POLICY', 'The direct-adapter options differ from the RC-5 boundary.');
  }
  options.messages.forEach((message, ordinal) => validateMessage(message, ordinal, request.scenario_id));
  if (options.messages.map((message) => message.role).join(',') !== ROLE_SEQUENCE.join(',')) {
    reject('WORKER_REQUEST_DRIFT', 'The RC-5 ordered DSH role sequence differs.');
  }
  exactKeys(request.execution, [
    'automatic_retries', 'external_mutation', 'max_concurrency', 'max_output_tokens', 'max_provider_calls', 'timeout_ms',
  ]);
  if (request.execution.automatic_retries !== 0 || request.execution.external_mutation !== false ||
      request.execution.max_concurrency !== 1 || request.execution.max_output_tokens !== EXPECTED_MAX_TOKENS ||
      request.execution.max_provider_calls !== 1 || !Number.isInteger(request.execution.timeout_ms) ||
      request.execution.timeout_ms < 1_000 || request.execution.timeout_ms > MAX_TIMEOUT_MS) {
    reject('WORKER_REQUEST_POLICY', 'The RC-5 execution policy differs.');
  }
  return request;
}

function validateReservationBinding(reservation, request) {
  exactKeys(reservation, [
    'attempt_id', 'automatic_retries', 'case_ordinal', 'max_concurrency', 'max_output_tokens', 'max_provider_calls',
    'plan_digest', 'provider_authority_sha256', 'provider_call_budget_consumed', 'request_digest', 'request_file_sha256',
    'reservation_id', 'reserved_at_utc', 'route', 'runtime_id', 'scenario_id', 'schema_version', 'state', 'timeout_ms',
  ]);
  exactKeys(reservation.route, [
    'adapter_revision', 'executor_image_id', 'model', 'provider', 'reasoning_effort', 'transport_image_id',
  ]);
  const ordinal = ROLE_SEQUENCE.length > 0 ? ['FACT-01', 'FACT-03', 'SAFE-01'].indexOf(request.scenario_id) : -1;
  if (reservation.schema_version !== '1.0.0' || reservation.state !== 'consumed_pre_call' ||
      reservation.scenario_id !== request.scenario_id || reservation.case_ordinal !== ordinal ||
      reservation.reservation_id !== `RC5-RESERVATION-${request.scenario_id}-R01` ||
      reservation.attempt_id !== `RC5-ATTEMPT-${request.scenario_id}-R01` ||
      reservation.request_digest !== request.request_digest.value || reservation.provider_call_budget_consumed !== true ||
      reservation.automatic_retries !== 0 || reservation.max_concurrency !== 1 || reservation.max_output_tokens !== EXPECTED_MAX_TOKENS ||
      reservation.max_provider_calls !== 1 || reservation.timeout_ms !== request.execution.timeout_ms ||
      reservation.provider_authority_sha256 !== sha256(PROVIDER_AUTHORITY) ||
      !/^[a-f0-9]{64}$/u.test(reservation.plan_digest || '') || !/^[a-f0-9]{64}$/u.test(reservation.request_file_sha256 || '') ||
      typeof reservation.runtime_id !== 'string' || !/^RC5-EXEC-(?:FACT-01|FACT-03|SAFE-01)-[a-f0-9]{16}$/u.test(reservation.runtime_id) ||
      reservation.route.adapter_revision !== '2fc02090af1632b86ee1175a6720904dfd71081c' ||
      reservation.route.transport_image_id !== 'sha256:11f4d4b9777b13ec29430bd682e0cb6b46f715e3ead28736c87a94f89f89aa01' ||
      !/^sha256:[a-f0-9]{64}$/u.test(reservation.route.executor_image_id || '') ||
      reservation.route.model !== EXPECTED_MODEL || reservation.route.provider !== EXPECTED_PROVIDER ||
      reservation.route.reasoning_effort !== EXPECTED_REASONING) {
    reject('WORKER_RESERVATION', 'The durable reservation does not authorize this exact RC-5 request.');
  }
  return reservation;
}

function validateDispatchBinding(dispatch, reservation) {
  exactKeys(dispatch, [
    'attempt_id', 'automatic_retries', 'dispatch_id', 'dispatched_at_utc', 'provider_call_charged', 'request_digest',
    'reservation_id', 'runtime_id', 'scenario_id', 'schema_version', 'state',
  ]);
  if (dispatch.schema_version !== '1.0.0' || dispatch.state !== 'provider_handoff_started' ||
      dispatch.provider_call_charged !== true || dispatch.automatic_retries !== 0 ||
      dispatch.scenario_id !== reservation.scenario_id || dispatch.request_digest !== reservation.request_digest ||
      dispatch.runtime_id !== reservation.runtime_id || dispatch.reservation_id !== reservation.reservation_id ||
      dispatch.attempt_id !== reservation.attempt_id || dispatch.dispatch_id !== `RC5-DISPATCH-${reservation.scenario_id}-R01`) {
    reject('WORKER_DISPATCH', 'The durable dispatch does not reconcile to the RC-5 reservation.');
  }
  return dispatch;
}

function validateWorkerTimeout(timeoutMs, registeredTimeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > MAX_TIMEOUT_MS ||
      !Number.isInteger(registeredTimeoutMs) || registeredTimeoutMs < 1_000 || registeredTimeoutMs > MAX_TIMEOUT_MS ||
      timeoutMs > registeredTimeoutMs) {
    reject('WORKER_INPUT', 'Worker timeout differs from the bounded registered authority.');
  }
  return true;
}

function strictWorkerInput(pathValue) {
  if (pathValue !== '/input/worker-input.json') reject('WORKER_INPUT', 'Worker input path differs from the registered mount.');
  const value = readCanonicalJson(pathValue, 'worker input');
  exactKeys(value, ['credentialPath', 'dispatch', 'lockDirectory', 'profileDirectory', 'request', 'reservation', 'timeoutMs']);
  if (value.credentialPath !== '/credentials/.credentials.yaml' || value.lockDirectory !== '/locks' ||
      value.profileDirectory !== '/opt/recursus-profile') {
    reject('WORKER_INPUT', 'Worker paths or timeout differ from the registered container authority.');
  }
  validateWorkerTimeout(value.timeoutMs, value.request?.execution?.timeout_ms);
  validateOrderedWorkerRequest(value.request);
  validateReservationBinding(value.reservation, value.request);
  validateDispatchBinding(value.dispatch, value.reservation);
  return value;
}

function credentialScope(service) {
  const values = service?.values;
  if (!(values instanceof Map)) reject('CREDENTIAL_SCOPE', 'The credential service does not expose the registered key scope.');
  const selected = values.has(EXPECTED_CREDENTIAL_REF);
  return Object.freeze({ selected_reference_present: selected, unexpected_reference_count: values.size - (selected ? 1 : 0) });
}

function installFetchGuard(delegate = globalThis.fetch, limits = {}) {
  if (typeof delegate !== 'function') reject('FETCH_AUTHORITY', 'The registered fetch implementation is unavailable.');
  const maxResponses = limits.maxResponses ?? 1;
  const maxOauth = limits.maxOauth ?? 1;
  const counts = { oauth: 0, responses: 0, unregistered: 0 };
  const guarded = function guardedFetch(input, init) {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
    let href = '';
    try { href = new URL(rawUrl).href; } catch {}
    if (method === 'POST' && href === RESPONSES_ENDPOINT) {
      counts.responses += 1;
      if (limits.expectedResponsesPayload !== undefined) {
        let observed;
        try { observed = decodeRequestBody(init?.body, new Headers(init?.headers)); } catch {
          reject('FETCH_PAYLOAD_DRIFT', 'The live Responses payload could not be validated.');
        }
        if (canonicalJson(observed) !== canonicalJson(limits.expectedResponsesPayload)) {
          reject('FETCH_PAYLOAD_DRIFT', 'The live Responses payload differs from the validated RC-5 request.');
        }
      }
    }
    else if (method === 'POST' && href === OAUTH_ENDPOINT) counts.oauth += 1;
    else counts.unregistered += 1;
    if (counts.responses > maxResponses || counts.oauth > maxOauth || counts.unregistered > 0) {
      reject('FETCH_AUTHORITY', 'The adapter exceeded the registered fetch authority.');
    }
    return Reflect.apply(delegate, globalThis, [input, init]);
  };
  Object.defineProperty(globalThis, 'fetch', { configurable: false, enumerable: true, value: guarded, writable: false });
  return Object.freeze({
    snapshot() {
      if (globalThis.fetch !== guarded) reject('FETCH_AUTHORITY', 'The application fetch guard was replaced.');
      return Object.freeze({ ...counts });
    },
  });
}

function protectAdapter(adapter) {
  let invocations = 0;
  const original = adapter.stream.bind(adapter);
  Object.defineProperty(adapter, 'stream', {
    configurable: false,
    enumerable: false,
    value(options) {
      invocations += 1;
      if (invocations > 1) reject('ADAPTER_INVOCATION_BUDGET', 'The worker exceeded one direct-adapter invocation.');
      return original(options);
    },
    writable: false,
  });
  return Object.freeze({ count: () => invocations });
}

function safeTokenCount(value) {
  return Number.isInteger(value) && value >= 0 ? value : 'not_reported';
}

function mapFinishReason(reason) {
  switch (reason?.kind) {
    case 'stop': return 'stop';
    case 'max-tokens': return 'max_tokens';
    case 'aborted': return 'aborted';
    case 'error': return 'error';
    default: return 'malformed';
  }
}

async function collectStream(adapter, generateOptions, timeoutMs) {
  const controller = new AbortController();
  let deadlineFired = false;
  const timer = setTimeout(() => {
    deadlineFired = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();
  const startedAt = Date.now();
  const textBlocks = new Map();
  let usage;
  let finish;
  let executionError = false;
  try {
    try {
      for await (const chunk of adapter.stream({ ...generateOptions, signal: controller.signal })) {
        if (chunk?.type === 'block-end') {
          if (chunk.block?.type === 'text' && typeof chunk.block.text === 'string' && Number.isInteger(chunk.index) && chunk.index >= 0) {
            if (textBlocks.has(chunk.index)) reject('MALFORMED_RESPONSE', 'The adapter produced a duplicate text block.');
            textBlocks.set(chunk.index, chunk.block.text);
          } else if (chunk.block?.type !== 'reasoning') reject('UNEXPECTED_TOOL_SURFACE', 'The no-tools request produced a non-text model action.');
        } else if (chunk?.type === 'usage') {
          if (usage !== undefined) reject('MALFORMED_RESPONSE', 'The adapter produced multiple usage records.');
          usage = chunk.usage;
        } else if (chunk?.type === 'finish') {
          if (finish !== undefined) reject('MALFORMED_RESPONSE', 'The adapter produced multiple finish records.');
          finish = chunk.reason;
        } else if (chunk?.type === 'block-start') {
          if (chunk.blockType !== 'text' && chunk.blockType !== 'reasoning') {
            reject('UNEXPECTED_TOOL_SURFACE', 'The no-tools request produced a non-text model action.');
          }
        } else if (!['text-delta', 'reasoning-delta'].includes(chunk?.type)) {
          reject('MALFORMED_RESPONSE', 'The adapter produced an unknown stream event.');
        }
      }
    } catch (error) {
      if (!deadlineFired) throw error;
      executionError = true;
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const wallMs = Math.min(timeoutMs, Math.max(0, Date.now() - startedAt));
  const finishReason = deadlineFired ? 'aborted' : mapFinishReason(finish);
  const completion = deadlineFired ? 'timed_out' : finishReason === 'stop' ? 'completed' : 'failed';
  const text = [...textBlocks.entries()].sort(([left], [right]) => left - right).map(([, value]) => value).join('');
  if (completion === 'completed' && (executionError || text.length === 0)) reject('MALFORMED_RESPONSE', 'A completed response has no usable assistant text.');
  const outputTokens = safeTokenCount(usage?.outputTokens);
  if (outputTokens !== 'not_reported' && outputTokens > EXPECTED_MAX_TOKENS) {
    reject('ARTIFACT_BUDGET', 'The provider reported output beyond the registered token cap.');
  }
  return Object.freeze({
    artifact: completion === 'completed' ? Buffer.from(text, 'utf8') : null,
    completion,
    finishReason,
    inputTokens: safeTokenCount(usage?.inputTokens),
    outputTokens,
    trustedCompleted: completion === 'completed',
    wallMs,
  });
}

function assertAdapterIdentity(codex, adapter, modelInfo) {
  if (codex.OPENAI_CODEX_TRANSPORT_CAPABILITIES?.[EXPECTED_CAPABILITY] !== true ||
      codex.ORDERED_SYSTEM_USER_MESSAGES_CAPABILITY !== EXPECTED_CAPABILITY ||
      modelInfo?.provider !== EXPECTED_PROVIDER || modelInfo?.id !== EXPECTED_MODEL ||
      !modelInfo?.reasoning?.efforts?.some((item) => item.id === EXPECTED_REASONING)) {
    reject('ADAPTER_IDENTITY', 'The direct adapter does not provide the registered RC-5 route.');
  }
  if (typeof adapter.stream !== 'function') reject('ADAPTER_IDENTITY', 'The direct adapter stream is unavailable.');
}

async function inspectAuthentication(options) {
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

async function runDirectAdapter(options) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const credentialPath = nativeFile(options.credentialPath, 'DSH credential document');
  const lockDirectory = nativeDirectory(options.lockDirectory, 'credential lock directory');
  const request = validateOrderedWorkerRequest(options.request);
  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const fetchGuard = installFetchGuard(globalThis.fetch, { expectedResponsesPayload: expectedWirePayload(request) });
  const [cordis, credentialLocal, codex] = await Promise.all([
    loadFromProfile(requireFromProfile, '@deepseek-ai/cordis'),
    loadFromProfile(requireFromProfile, '@deepseek-ai/dsh-credentials-local'),
    loadFromProfile(requireFromProfile, 'deepseek-openai-codex'),
  ]);
  const ctx = new cordis.Context();
  let adapter;
  try {
    await ctx.plugin(credentialLocal.default, { path: credentialPath, watch: false });
    const scope = credentialScope(ctx.credentials);
    if (!scope.selected_reference_present || scope.unexpected_reference_count !== 0) {
      reject('CREDENTIAL_SCOPE', 'The dedicated credential document contains an unexpected reference.');
    }
    const config = codex.resolveConfig({
      adapterTimeoutMs: options.timeoutMs,
      credentialRef: EXPECTED_CREDENTIAL_REF,
      lockDirectory,
    });
    const description = await ctx.credentials.describe(config.credentialRef);
    if (!description.configured) reject('AUTHENTICATION_UNAVAILABLE', 'The registered OAuth credential is not configured.');
    const store = new codex.DshPiCredentialStore(ctx.credentials, {
      acquireTimeoutMs: config.credentialLockAcquireTimeoutMs,
      directory: config.lockDirectory,
      reference: config.credentialRef,
      staleMs: config.credentialLockStaleMs,
    });
    await store.validateDurable();
    adapter = new codex.OpenAICodexAdapter({ credentials: store, resolveAttachments: () => undefined, timeoutMs: config.adapterTimeoutMs });
    const identity = await adapter.resolveModel(EXPECTED_PROVIDER, EXPECTED_MODEL);
    assertAdapterIdentity(codex, adapter, identity);
    const invocationGuard = protectAdapter(adapter);
    const collected = await collectStream(adapter, request.dsh_generate_options, options.timeoutMs);
    const fetchCounts = fetchGuard.snapshot();
    if (invocationGuard.count() !== 1 || fetchCounts.responses !== 1 || fetchCounts.oauth > 1 || fetchCounts.unregistered !== 0) {
      reject('EXECUTION_AUTHORITY', 'The direct adapter did not remain within one registered provider request.');
    }
    if (collected.artifact !== null && collected.artifact.length > MAX_ARTIFACT_BYTES) {
      reject('ARTIFACT_BUDGET', 'The assistant artifact exceeds the persistence bound.');
    }
    return Object.freeze({
      artifact: collected.artifact,
      result: Object.freeze({
        completion: collected.completion,
        direct_adapter_invocations: invocationGuard.count(),
        external_mutations: [],
        finish_reason: collected.finishReason,
        input_tokens: collected.inputTokens,
        oauth_refresh_count: fetchCounts.oauth,
        output_tokens: collected.outputTokens,
        provider_request_count: fetchCounts.responses,
        responses_endpoint: RESPONSES_ENDPOINT,
        schema_version: '1.0.0',
        trusted_completed: collected.trustedCompleted,
        wall_ms: collected.wallMs,
      }),
    });
  } finally {
    adapter?.dispose();
    await ctx.fiber.dispose();
  }
}

function expectedWirePayload(request) {
  const options = request.dsh_generate_options;
  return {
    include: ['reasoning.encrypted_content'],
    input: options.messages.map((message) => ({ content: [{ text: message.content[0].text, type: 'input_text' }], role: message.role })),
    max_output_tokens: options.maxTokens,
    model: options.model,
    parallel_tool_calls: false,
    prompt_cache_key: options.sessionId,
    reasoning: { effort: 'xhigh', summary: 'auto' },
    store: false,
    stream: true,
    text: { verbosity: 'low' },
    tool_choice: 'none',
  };
}

function decodeRequestBody(body, headers) {
  if (typeof body === 'string') return JSON.parse(body);
  if (body instanceof Uint8Array) {
    const bytes = headers.get('content-encoding') === 'zstd' ? zstdDecompressSync(body) : body;
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  }
  reject('PROVIDER_FREE_PAYLOAD', 'The provider-free request body has an unexpected representation.');
}

function fakeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.fake-signature`;
}

function fakeSuccessSse() {
  const events = [
    { type: 'response.created', response: { id: 'resp_rc5_probe', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_rc5_probe', type: 'message', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'provider-free' },
    { type: 'response.output_item.done', output_index: 0, item: { id: 'msg_rc5_probe', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'provider-free', annotations: [] }] } },
    {
      type: 'response.completed',
      response: {
        id: 'resp_rc5_probe', status: 'completed', model: EXPECTED_MODEL,
        output: [{ id: 'msg_rc5_probe', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'provider-free', annotations: [] }] }],
        usage: {
          input_tokens: 7, output_tokens: 2, total_tokens: 9,
          input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 1 },
        },
      },
    },
  ];
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
}

class ProviderFreeCredentialStore {
  constructor() {
    const accountId = 'acct_rc5_provider_free';
    this.credential = {
      access: fakeJwt({ 'https://api.openai.com/auth': { chatgpt_account_id: accountId } }),
      accountId,
      expires: Date.now() + 3_600_000,
      refresh: 'rc5-provider-free-refresh',
      type: 'oauth',
    };
  }

  async read() { return this.credential; }
  async list() { return [{ providerId: EXPECTED_PROVIDER, type: 'oauth' }]; }
  async modify(_provider, callback) {
    const next = await callback(this.credential);
    if (next !== undefined) this.credential = next;
    return this.credential;
  }
  async delete() {}
}

export async function runProviderFreeExecutorProbe(options) {
  const profileDirectory = nativeDirectory(options.profileDirectory, 'Recursus profile');
  const request = validateOrderedWorkerRequest(options.request);
  const requireFromProfile = createRequire(join(profileDirectory, 'package.json'));
  const codex = await loadFromProfile(requireFromProfile, 'deepseek-openai-codex');
  let mode = 'success';
  const observations = { failure: [], success: [] };
  const expectedPayload = expectedWirePayload(request);
  const fakeFetch = async (input, init) => {
    const href = String(input);
    const method = String(init?.method ?? 'GET').toUpperCase();
    const payload = decodeRequestBody(init?.body, new Headers(init?.headers));
    if (href !== RESPONSES_ENDPOINT || method !== 'POST' || canonicalJson(payload) !== canonicalJson(expectedPayload)) {
      reject('PROVIDER_FREE_PAYLOAD', 'The provider-free wire request differs from RC-5.');
    }
    observations[mode].push({ href, payload });
    if (mode === 'failure') return new Response('provider-free failure', { status: 503, headers: { 'content-type': 'text/plain' } });
    return new Response(fakeSuccessSse(), { status: 200, headers: { 'content-type': 'text/event-stream', 'x-request-id': 'request_rc5_probe' } });
  };
  const fetchGuard = installFetchGuard(fakeFetch, { expectedResponsesPayload: expectedPayload, maxOauth: 0, maxResponses: 2 });
  const createAdapter = () => new codex.OpenAICodexAdapter({
    credentials: new ProviderFreeCredentialStore(), resolveAttachments: () => undefined, timeoutMs: options.timeoutMs,
  });
  let successAdapter;
  let failureAdapter;
  try {
    successAdapter = createAdapter();
    assertAdapterIdentity(codex, successAdapter, await successAdapter.resolveModel(EXPECTED_PROVIDER, EXPECTED_MODEL));
    const successGuard = protectAdapter(successAdapter);
    const success = await collectStream(successAdapter, request.dsh_generate_options, options.timeoutMs);
    if (success.completion !== 'completed' || success.finishReason !== 'stop' || successGuard.count() !== 1 || observations.success.length !== 1) {
      reject('PROVIDER_FREE_EXECUTION', 'The provider-free success path differs from RC-5.');
    }
    mode = 'failure';
    failureAdapter = createAdapter();
    assertAdapterIdentity(codex, failureAdapter, await failureAdapter.resolveModel(EXPECTED_PROVIDER, EXPECTED_MODEL));
    const failureGuard = protectAdapter(failureAdapter);
    let failureObserved = false;
    try {
      const failure = await collectStream(failureAdapter, request.dsh_generate_options, options.timeoutMs);
      failureObserved = failure.completion === 'failed';
    } catch {
      failureObserved = true;
    }
    const counts = fetchGuard.snapshot();
    if (!failureObserved || failureGuard.count() !== 1 || observations.failure.length !== 1 || counts.responses !== 2 ||
        counts.oauth !== 0 || counts.unregistered !== 0) {
      reject('PROVIDER_FREE_EXECUTION', 'The provider-free 503 path retried or escaped the closed fetch route.');
    }
    return Object.freeze({
      capability: EXPECTED_CAPABILITY,
      endpoint: RESPONSES_ENDPOINT,
      failure: Object.freeze({
        completion: 'failed', direct_adapter_invocations: 1, no_retry: true, provider_request_count: 1,
      }),
      payload_sha256: sha256(canonicalJson(expectedPayload)),
      provider_calls: 0,
      request_digest: request.request_digest.value,
      role_sequence: [...ROLE_SEQUENCE],
      schema_version: '1.0.0',
      success: Object.freeze({
        completion: 'completed', direct_adapter_invocations: 1, finish_reason: 'stop', input_tokens: 7,
        output_tokens: 2, provider_request_count: 1,
      }),
    });
  } finally {
    successAdapter?.dispose();
    failureAdapter?.dispose();
  }
}

function assertContainerInvocation(command, inputPath, outputDirectory) {
  if (process.platform !== 'linux' || process.getuid?.() !== 65_532 || process.getgid?.() !== 65_532 ||
      process.cwd() !== '/opt/rc3' || process.argv[1] !== '/opt/rc5/rc5-provider-worker.mjs' || !existsSync('/.dockerenv') ||
      process.permission?.has('child') !== false || process.permission?.has('worker') !== false) {
    reject('WORKER_AUTHORITY', 'Worker is outside the registered container authority context.');
  }
  const commonReads = [
    '--allow-fs-read=/.dockerenv', '--allow-fs-read=/opt/recursus-profile',
    '--allow-fs-read=/opt/rc5/rc5-provider-worker.mjs',
  ];
  const runArgs = [
    '--permission', '--use-env-proxy', '--no-addons', '--report-exclude-env', '--report-exclude-network',
    ...commonReads,
    '--allow-fs-read=/opt/rc3/recursus-route-content-gate-v17.mjs', '--allow-fs-read=/opt/rc3/recursus-route-html-entities-v17.mjs',
    '--allow-fs-read=/credentials', '--allow-fs-read=/input/worker-input.json', '--allow-fs-read=/output', '--allow-fs-read=/locks',
    '--allow-fs-write=/credentials', '--allow-fs-write=/output', '--allow-fs-write=/locks', '--allow-fs-write=/tmp',
  ];
  const statusArgs = [
    '--permission', '--no-addons', '--report-exclude-env', '--report-exclude-network', ...commonReads,
    '--allow-fs-read=/credentials/.credentials.yaml', '--allow-fs-read=/output', '--allow-fs-write=/output',
  ];
  const probeArgs = [
    '--permission', '--no-addons', '--report-exclude-env', '--report-exclude-network', ...commonReads,
    '--allow-fs-read=/input/worker-input.json', '--allow-fs-read=/output', '--allow-fs-write=/output',
  ];
  const expectedArgs = command === 'container-run' ? runArgs
    : command === 'container-auth-status' ? statusArgs
      : command === 'container-provider-free' ? probeArgs : [];
  if (JSON.stringify(process.execArgv) !== JSON.stringify(expectedArgs)) {
    reject('WORKER_AUTHORITY', 'Worker Node permissions differ from the registered authority profile.');
  }
  const commonEnvironment = {
    LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'production', NODE_VERSION: '24.19.0',
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', YARN_VERSION: '1.22.22',
  };
  const expectedEnvironment = command === 'container-run'
    ? { ...commonEnvironment, HOME: '/tmp/rc5-home', HTTP_PROXY: 'http://127.0.0.1:8080', HTTPS_PROXY: 'http://127.0.0.1:8080', NO_PROXY: '', TMPDIR: '/tmp', TZ: 'UTC' }
    : command === 'container-provider-free'
      ? { ...commonEnvironment, HOME: '/nonexistent', TZ: 'UTC' }
      : { ...commonEnvironment, HOME: '/nonexistent', TZ: 'America/Chicago' };
  const allowedEnvironment = new Set([...Object.keys(expectedEnvironment), 'HOSTNAME']);
  if (Object.keys(process.env).some((key) => !allowedEnvironment.has(key)) ||
      Object.entries(expectedEnvironment).some(([key, value]) => process.env[key] !== value)) {
    reject('WORKER_AUTHORITY', 'Worker environment differs from the closed registered allowlist.');
  }
  if (command === 'container-auth-status') {
    if (inputPath !== '/output' || outputDirectory !== undefined) reject('WORKER_AUTHORITY', 'Worker status paths differ from registration.');
  } else if ((command === 'container-run' || command === 'container-provider-free') &&
      (inputPath !== '/input/worker-input.json' || outputDirectory !== '/output')) {
    reject('WORKER_AUTHORITY', 'Worker run paths differ from registration.');
  }
}

async function runCli(argv) {
  const [command, inputPath, outputDirectory] = argv;
  assertContainerInvocation(command, inputPath, outputDirectory);
  if (command === 'container-auth-status') {
    const output = nativeDirectory(inputPath, 'authentication status output', true);
    const status = await inspectAuthentication({ credentialPath: '/credentials/.credentials.yaml', profileDirectory: '/opt/recursus-profile' });
    writeExclusiveJson(output, 'authentication-status.json', status);
    return;
  }
  if (command !== 'container-run' && command !== 'container-provider-free') reject('WORKER_USAGE', 'Worker container command is invalid.');
  const output = nativeDirectory(outputDirectory, 'worker output', true);
  const input = strictWorkerInput(inputPath);
  if (command === 'container-provider-free') {
    const probe = await runProviderFreeExecutorProbe({ profileDirectory: input.profileDirectory, request: input.request, timeoutMs: input.timeoutMs });
    writeExclusiveJson(output, 'executor-probe.json', probe);
    return;
  }
  const execution = await runDirectAdapter(input);
  if (execution.result.completion === 'completed') {
    if (execution.artifact === null || execution.artifact.length === 0) reject('MALFORMED_RESPONSE', 'A completed result requires assistant output.');
    const { assertStagingContentSafe } = await import('file:///opt/rc3/recursus-route-content-gate-v17.mjs');
    try { assertStagingContentSafe(execution.artifact, 'RC-5 assistant output'); } catch {
      reject('STAGING_CONTENT_REJECTED', 'Assistant output failed the content-safe persistence gate.');
    }
    writeFileSync(join(output, 'assistant-output.md'), execution.artifact, { flag: 'wx' });
  } else if (execution.artifact !== null) {
    reject('MALFORMED_RESPONSE', 'An incomplete result cannot persist assistant output.');
  }
  writeExclusiveJson(output, 'worker-result.json', execution.result);
}

export const RC5_PROVIDER_WORKER_INTERNALS_FOR_TESTS = Object.freeze({ validateWorkerTimeout });

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invokedPath === import.meta.url) {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    try {
      const output = process.argv.at(-1);
      if (typeof output === 'string' && isAbsolute(output) && existsSync(output)) {
        const code = error instanceof RC5ProviderWorkerError ? error.code : 'WORKER_FAILED';
        writeExclusiveJson(output, 'worker-failure.json', { code, status: 'failed' });
      }
    } catch {}
    process.exitCode = 1;
  }
}
