const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const SIMULATOR_HOST = '0.0.0.0';
const SIMULATOR_PORT = 443;
const SIMULATOR_MAX_HEADER_BYTES = 8_192;
const SIMULATOR_MAX_HEADER_COUNT = 32;
const SIMULATOR_MAX_BODY_BYTES = 1_048_576;
const SIMULATOR_HEADERS_TIMEOUT_MS = 5_000;
const SIMULATOR_REQUEST_TIMEOUT_MS = 15_000;
const SIMULATOR_IDLE_TIMEOUT_MS = 30_000;
const SIMULATOR_PATH = '/backend-api/codex/responses';
const SIMULATOR_ROLES = Object.freeze(['system', 'system', 'system', 'system', 'user', 'user', 'user', 'user', 'system']);

const accountId = 'acct_rc5_provider_free';
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const accessToken = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
  'https://api.openai.com/auth': { chatgpt_account_id: accountId },
})}.fake-signature`;
let credential = {
  access: accessToken,
  accountId,
  expires: Date.now() + 3_600_000,
  refresh: 'fake-refresh-provider-free',
  type: 'oauth',
};
const credentialStore = {
  async delete() {},
  async list() { return [{ providerId: 'openai-codex', type: 'oauth' }]; },
  async modify(_provider, callback) {
    const next = await callback(credential);
    if (next !== undefined) credential = next;
    return credential;
  },
  async read() { return credential; },
};

function successEvents() {
  const events = [
    { type: 'response.created', response: { id: 'resp_rc5_fake', output: [], status: 'in_progress' } },
    {
      item: { content: [], id: 'msg_rc5_fake', role: 'assistant', type: 'message' },
      output_index: 0,
      type: 'response.output_item.added',
    },
    {
      content_index: 0,
      delta: 'provider-free',
      output_index: 0,
      type: 'response.output_text.delta',
    },
    {
      output_index: 0,
      item: {
        content: [{ annotations: [], text: 'provider-free', type: 'output_text' }],
        id: 'msg_rc5_fake',
        role: 'assistant',
        type: 'message',
      },
      type: 'response.output_item.done',
    },
    {
      response: {
        id: 'resp_rc5_fake',
        model: 'gpt-5.6-sol',
        output: [{
          content: [{ annotations: [], text: 'provider-free', type: 'output_text' }],
          id: 'msg_rc5_fake',
          role: 'assistant',
          type: 'message',
        }],
        status: 'completed',
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2,
        },
      },
      type: 'response.completed',
    },
  ];
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`;
}

function requestPayload(init) {
  const headers = new Headers(init?.headers);
  let body = init?.body;
  if (body instanceof Uint8Array && headers.get('content-encoding') === 'zstd') {
    body = zlib.zstdDecompressSync(body);
  }
  if (body instanceof Uint8Array) body = Buffer.from(body).toString('utf8');
  if (typeof body !== 'string') throw new Error('unexpected request body');
  return JSON.parse(body);
}

const DIAGNOSTIC_PROBE_SPECS = Object.freeze([
  Object.freeze({ caseId: 'valid_200', kind: 'success', status: 200 }),
  Object.freeze({ caseId: 'malformed_200', kind: 'malformed', status: 200 }),
  Object.freeze({ caseId: 'http_400', kind: 'http', status: 400 }),
  Object.freeze({ caseId: 'http_401', kind: 'http', status: 401 }),
  Object.freeze({ caseId: 'http_403', kind: 'http', status: 403 }),
  Object.freeze({ caseId: 'http_429', kind: 'http', status: 429 }),
  Object.freeze({ caseId: 'http_503', kind: 'http', status: 503 }),
  Object.freeze({ caseId: 'fetch_rejection', kind: 'fetch_rejection', status: null }),
]);

const SAFE_ERROR_CATEGORIES = new Set([
  'ABORTED', 'AUTH', 'INTEGRATION', 'INVALID_REQUEST', 'MALFORMED_RESPONSE', 'PERMISSION', 'RATE_LIMIT', 'TIMEOUT', 'UNAVAILABLE',
]);

function diagnosticStatusCategory(status) {
  if (status === null || (status >= 200 && status <= 299)) return null;
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 401) return 'AUTH';
  if (status === 402 || status === 403) return 'PERMISSION';
  if (status === 408) return 'TIMEOUT';
  if (status === 429) return 'RATE_LIMIT';
  if (status >= 500 && status <= 599) return 'UNAVAILABLE';
  return 'INTEGRATION';
}

async function runAdapterDiagnosticProbe(adapterModule, generateOptions, spec, expectedPayload) {
  let fetchOutcome = 'not_observed';
  let httpRequestCount = 0;
  let payloadMatchesPrimary = false;
  let responseHttpStatus = null;
  globalThis.fetch = async (url, init) => {
    httpRequestCount += 1;
    if (httpRequestCount > 1 || String(url) !== 'https://chatgpt.com/backend-api/codex/responses') {
      throw new Error('provider-free diagnostic authority rejected');
    }
    payloadMatchesPrimary = canonicalJson(requestPayload(init)) === canonicalJson(expectedPayload);
    if (spec.kind === 'fetch_rejection') {
      fetchOutcome = 'rejected';
      throw new Error('network connection failed RC5_PRIVATE_FETCH_EXCEPTION_A7Q2');
    }
    fetchOutcome = 'response';
    responseHttpStatus = spec.status;
    const body = spec.kind === 'success'
      ? successEvents()
      : spec.kind === 'malformed'
        ? 'data: {"type":"response.created","response":{"id":"resp_rc5_truncated","output":[],"status":"in_progress"}}\n\n'
        : `RC5_PRIVATE_HTTP_BODY_${spec.status}`;
    return new Response(body, {
      headers: {
        'content-type': spec.kind === 'http' ? 'text/plain' : 'text/event-stream',
        'x-private-diagnostic': `RC5_PRIVATE_HTTP_HEADER_${spec.caseId}`,
      },
      status: spec.status,
    });
  };

  const adapter = new adapterModule.OpenAICodexAdapter({ credentials: credentialStore, timeoutMs: 5_000 });
  let adapterOutcome = 'throw';
  let completed = false;
  let failureCode = null;
  let finishReason = 'error';
  try {
    for await (const chunk of adapter.stream(generateOptions)) {
      if (chunk?.type !== 'finish') continue;
      adapterOutcome = 'terminal';
      completed = chunk.reason?.kind === 'stop';
      failureCode = chunk.reason?.failure?.code ?? null;
      finishReason = completed ? 'stop' : chunk.reason?.kind === 'error' || chunk.reason?.kind === 'aborted' ? 'error' : 'malformed';
    }
  } catch {
    adapterOutcome = 'throw';
  } finally {
    adapter.dispose();
  }
  const statusCategory = diagnosticStatusCategory(responseHttpStatus);
  const errorCategory = completed
    ? null
    : fetchOutcome === 'rejected'
      ? 'UNAVAILABLE'
      : statusCategory ?? (SAFE_ERROR_CATEGORIES.has(failureCode) ? failureCode : 'INTEGRATION');
  const failureStage = completed
    ? null
    : fetchOutcome === 'rejected'
      ? 'fetch_transport'
      : adapterOutcome === 'terminal' ? 'adapter_terminal' : 'adapter_throw';
  return Object.freeze({
    adapter_outcome: adapterOutcome,
    case_id: spec.caseId,
    completion: completed ? 'completed' : 'failed',
    error_category: errorCategory,
    failure_stage: failureStage,
    finish_reason: finishReason,
    http_request_count: httpRequestCount,
    payload_matches_primary: payloadMatchesPrimary,
    provider_calls: 0,
    response_http_status: responseHttpStatus,
  });
}

function canonicalJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function parseSimulatorArgs(argv) {
  if (argv.length !== 5 || argv[0] !== 'simulator' || argv[1] !== '--mode' ||
      !['success', 'failure'].includes(argv[2]) || argv[3] !== '--output') {
    throw new Error('invalid simulator arguments');
  }
  const outputPath = argv[4];
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath) || path.extname(outputPath) !== '.json' ||
      outputPath.includes('\0') || fs.existsSync(outputPath)) {
    throw new Error('invalid simulator output path');
  }
  const parent = path.dirname(path.resolve(outputPath));
  const parentInfo = fs.lstatSync(parent);
  const realParent = fs.realpathSync.native(parent);
  const normalize = (value) => process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value;
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink() || normalize(realParent) !== normalize(parent)) {
    throw new Error('invalid simulator output directory');
  }
  return Object.freeze({ mode: argv[2], outputPath: path.resolve(outputPath) });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function validateSimulatorPayload(value) {
  const keys = [
    'include', 'input', 'max_output_tokens', 'model', 'parallel_tool_calls', 'prompt_cache_key', 'reasoning',
    'store', 'stream', 'text', 'tool_choice',
  ];
  if (!exactKeys(value, keys) || value.model !== 'gpt-5.6-sol' || value.max_output_tokens !== 4_000 ||
      value.parallel_tool_calls !== false || value.store !== false || value.stream !== true || value.tool_choice !== 'none' ||
      JSON.stringify(value.include) !== JSON.stringify(['reasoning.encrypted_content']) ||
      !exactKeys(value.reasoning, ['effort', 'summary']) || value.reasoning.effort !== 'xhigh' || value.reasoning.summary !== 'auto' ||
      !exactKeys(value.text, ['verbosity']) || value.text.verbosity !== 'low' ||
      typeof value.prompt_cache_key !== 'string' || !/^rc5-(?:fact-01|fact-03|safe-01)$/u.test(value.prompt_cache_key) ||
      !Array.isArray(value.input) || value.input.length !== SIMULATOR_ROLES.length) {
    throw new Error('unexpected simulator payload');
  }
  for (let index = 0; index < value.input.length; index += 1) {
    const item = value.input[index];
    if (!exactKeys(item, ['content', 'role']) || item.role !== SIMULATOR_ROLES[index] ||
        !Array.isArray(item.content) || item.content.length !== 1 ||
        !exactKeys(item.content[0], ['text', 'type']) || item.content[0].type !== 'input_text' ||
        typeof item.content[0].text !== 'string' || item.content[0].text.length === 0) {
      throw new Error('unexpected simulator input');
    }
  }
  return true;
}

function simulatorHeaderNames(request) {
  const names = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    names.push(request.rawHeaders[index].toLocaleLowerCase('en-US'));
  }
  return names.sort();
}

function simulatorHeaderCounts(request) {
  const counts = new Map();
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index].toLocaleLowerCase('en-US');
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

function validateSimulatorFraming(request) {
  const counts = simulatorHeaderCounts(request);
  const contentLength = request.headers['content-length'];
  const contentType = request.headers['content-type'];
  const contentEncoding = request.headers['content-encoding'];
  if (request.method !== 'POST' || request.url !== SIMULATOR_PATH || request.httpVersion !== '1.1' || request.socket.encrypted === true ||
      request.rawHeaders.length / 2 > SIMULATOR_MAX_HEADER_COUNT || counts.get('host') !== 1 || counts.get('content-length') !== 1 ||
      counts.get('content-type') !== 1 || counts.get('authorization') !== 1 || counts.get('content-encoding') > 1 ||
      counts.has('transfer-encoding') || counts.has('expect') ||
      counts.has('upgrade') || counts.has('trailer') || counts.has('proxy-authorization') ||
      !['chatgpt.com', 'chatgpt.com:443'].includes(request.headers.host) ||
      !['application/json', 'application/json; charset=utf-8'].includes(contentType) ||
      !(contentEncoding === undefined || contentEncoding === 'zstd') ||
      typeof contentLength !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(contentLength)) {
    throw new Error('invalid simulator framing');
  }
  const length = Number(contentLength);
  if (!Number.isSafeInteger(length) || length < 1 || length > SIMULATOR_MAX_BODY_BYTES) {
    throw new Error('invalid simulator body length');
  }
  return Object.freeze({ contentEncoding, length });
}

function decodeSimulatorBody(input, framing) {
  if (!(input instanceof Uint8Array) || framing === null || typeof framing !== 'object' || Array.isArray(framing) ||
      !exactKeys(framing, ['contentEncoding', 'length']) ||
      !(framing.contentEncoding === undefined || framing.contentEncoding === 'zstd') ||
      !Number.isSafeInteger(framing.length) || framing.length < 1 || framing.length > SIMULATOR_MAX_BODY_BYTES) {
    throw new Error('simulator body representation rejected');
  }
  let bytes = Buffer.from(input);
  if (bytes.length !== framing.length) {
    throw new Error('simulator body framing mismatch');
  }
  if (framing.contentEncoding === 'zstd') {
    try {
      bytes = zlib.zstdDecompressSync(bytes, { maxOutputLength: SIMULATOR_MAX_BODY_BYTES });
    } catch {
      throw new Error('simulator compressed body rejected');
    }
  }
  if (bytes.length < 1 || bytes.length > SIMULATOR_MAX_BODY_BYTES) {
    throw new Error('simulator decoded body exceeded bound');
  }
  let payload;
  try { payload = JSON.parse(bytes.toString('utf8')); } catch {
    throw new Error('simulator JSON rejected');
  }
  validateSimulatorPayload(payload);
  return Object.freeze({
    canonicalBytes: Buffer.from(`${canonicalJson(payload)}\n`, 'utf8'),
    payload,
  });
}

function collectSimulatorBody(request, framing) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = [];
    let byteCount = 0;
    request.on('data', (chunk) => {
      byteCount += chunk.length;
      if (byteCount > SIMULATOR_MAX_BODY_BYTES || byteCount > framing.length) {
        rejectPromise(new Error('simulator body exceeded bound'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once('aborted', () => rejectPromise(new Error('simulator request aborted')));
    request.once('error', () => rejectPromise(new Error('simulator request failed')));
    request.once('end', () => {
      if (!request.complete || request.rawTrailers.length !== 0 || byteCount !== framing.length) {
        rejectPromise(new Error('simulator body framing mismatch'));
        return;
      }
      try { resolvePromise(decodeSimulatorBody(Buffer.concat(chunks), framing)); } catch (error) {
        rejectPromise(error);
      }
    });
  });
}

function writeSimulatorObservation(outputPath, observation) {
  fs.writeFileSync(outputPath, `${canonicalJson(observation)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function baseSimulatorObservation(mode, requestCount, headerNames = []) {
  return {
    body_byte_count: null,
    body_sha256: null,
    failure_code: null,
    header_count: headerNames.length,
    header_names: headerNames,
    mode,
    provider_calls: 0,
    request_count: requestCount,
    response_status: null,
    schema_version: '1.0.0',
    status: 'rejected',
  };
}

function runSimulator(options) {
  return new Promise((resolvePromise) => {
    let finished = false;
    let requestCount = 0;
    let idleTimer;
    const finish = (observation, accepted) => {
      if (finished) return;
      finished = true;
      clearTimeout(idleTimer);
      if (server.listening) server.close();
      try { writeSimulatorObservation(options.outputPath, observation); } catch {
        process.exitCode = 1;
        resolvePromise(false);
        return;
      }
      if (!accepted) process.exitCode = 1;
      resolvePromise(accepted);
    };
    const rejectRequest = (response, headerNames, failureCode, statusCode = 400) => {
      const observation = baseSimulatorObservation(options.mode, requestCount, headerNames);
      observation.failure_code = failureCode;
      observation.response_status = statusCode;
      if (!response.headersSent && !response.destroyed) {
        response.writeHead(statusCode, { connection: 'close', 'content-length': '0' });
        response.end(() => finish(observation, false));
      } else finish(observation, false);
    };
    const server = http.createServer({ maxHeaderSize: SIMULATOR_MAX_HEADER_BYTES }, async (request, response) => {
      requestCount += 1;
      server.close();
      const headerNames = simulatorHeaderNames(request);
      if (requestCount !== 1) {
        rejectRequest(response, headerNames, 'request_count');
        return;
      }
      let framing;
      try { framing = validateSimulatorFraming(request); } catch {
        rejectRequest(response, headerNames, 'request_framing');
        return;
      }
      let body;
      try { body = await collectSimulatorBody(request, framing); } catch {
        rejectRequest(response, headerNames, 'request_body');
        return;
      }
      const responseBody = options.mode === 'success' ? successEvents() : 'intentional provider-free failure';
      const responseStatus = options.mode === 'success' ? 200 : 503;
      const observation = baseSimulatorObservation(options.mode, requestCount, headerNames);
      observation.body_byte_count = body.canonicalBytes.length;
      observation.body_sha256 = crypto.createHash('sha256').update(body.canonicalBytes).digest('hex');
      observation.response_status = responseStatus;
      observation.status = 'completed';
      response.writeHead(responseStatus, {
        connection: 'close',
        'content-length': String(Buffer.byteLength(responseBody, 'utf8')),
        'content-type': options.mode === 'success' ? 'text/event-stream' : 'text/plain',
        'x-request-id': options.mode === 'success' ? 'request_rc5_fake' : 'request_rc5_retry_fake',
      });
      response.end(responseBody, () => finish(observation, true));
    });
    server.maxConnections = 1;
    server.maxHeadersCount = SIMULATOR_MAX_HEADER_COUNT;
    server.maxRequestsPerSocket = 1;
    server.headersTimeout = SIMULATOR_HEADERS_TIMEOUT_MS;
    server.requestTimeout = SIMULATOR_REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = 1_000;
    server.on('clientError', (_error, socket) => {
      if (!socket.destroyed) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      const observation = baseSimulatorObservation(options.mode, requestCount);
      observation.failure_code = 'request_framing';
      observation.response_status = 400;
      finish(observation, false);
    });
    server.once('error', () => {
      const observation = baseSimulatorObservation(options.mode, requestCount);
      observation.failure_code = 'server_error';
      finish(observation, false);
    });
    server.listen(SIMULATOR_PORT, SIMULATOR_HOST, () => {
      process.stdout.write('{"type":"simulator_ready"}\n');
      idleTimer = setTimeout(() => {
        const observation = baseSimulatorObservation(options.mode, requestCount);
        observation.failure_code = 'request_timeout';
        finish(observation, false);
      }, SIMULATOR_IDLE_TIMEOUT_MS);
      idleTimer.unref?.();
    });
  });
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const adapterModule = await import('file:///opt/recursus-profile/node_modules/deepseek-openai-codex/lib/index.js');
  let mode = 'success';
  let httpRequestCount = 0;
  let retryHttpRequestCount = 0;
  let retryPayload;
  let retryUrl;
  const payloads = [];
  const urls = [];

  globalThis.fetch = async (url, init) => {
    const payload = requestPayload(init);
    if (mode === 'success') {
      httpRequestCount += 1;
      payloads.push(payload);
      urls.push(String(url));
      return new Response(successEvents(), {
        headers: { 'content-type': 'text/event-stream', 'x-request-id': 'request_rc5_fake' },
        status: 200,
      });
    }
    retryHttpRequestCount += 1;
    retryPayload = payload;
    retryUrl = String(url);
    return new Response('intentional provider-free failure', {
      headers: { 'content-type': 'text/plain', 'x-request-id': 'request_rc5_retry_fake' },
      status: 503,
    });
  };

  const adapter = new adapterModule.OpenAICodexAdapter({ credentials: credentialStore, timeoutMs: 5_000 });
  for (const request of input.requests) {
    let finish;
    for await (const chunk of adapter.stream(request.dsh_generate_options)) finish = chunk;
    if (finish?.type !== 'finish' || finish?.reason?.kind !== 'stop') {
      throw new Error('fake stream did not complete');
    }
  }
  adapter.dispose();

  mode = 'retry';
  let completed = false;
  const retryAdapter = new adapterModule.OpenAICodexAdapter({ credentials: credentialStore, timeoutMs: 5_000 });
  try {
    for await (const chunk of retryAdapter.stream(input.requests[0].dsh_generate_options)) {
      if (chunk?.type === 'finish' && chunk?.reason?.kind === 'stop') completed = true;
    }
  } catch {
    // A rejected stream is the expected fail-closed outcome for this provider-free 503 probe.
  }
  retryAdapter.dispose();

  const diagnosticProbes = [];
  for (const spec of DIAGNOSTIC_PROBE_SPECS) {
    diagnosticProbes.push(await runAdapterDiagnosticProbe(
      adapterModule,
      input.requests[0].dsh_generate_options,
      spec,
      payloads[0],
    ));
  }

  process.stdout.write(JSON.stringify({
    capabilities: adapterModule.OPENAI_CODEX_TRANSPORT_CAPABILITIES,
    diagnostic_probes: diagnosticProbes,
    http_request_count: httpRequestCount,
    payloads,
    provider_calls: 0,
    retry_probe: {
      completed,
      http_request_count: retryHttpRequestCount,
      payload: retryPayload,
      provider_calls: 0,
      url: retryUrl,
    },
    urls,
  }));
}

async function dispatch() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    await main();
    return;
  }
  const accepted = await runSimulator(parseSimulatorArgs(argv));
  if (!accepted) throw new Error('provider-free simulator rejected the request');
}

module.exports = Object.freeze({
  baseSimulatorObservation,
  canonicalJson,
  decodeSimulatorBody,
  parseSimulatorArgs,
  simulatorHeaderNames,
  validateSimulatorFraming,
  validateSimulatorPayload,
});

if (require.main === module || module.parent === undefined) {
  dispatch().catch(() => {
    process.stderr.write('provider-free payload probe failed');
    process.exitCode = 1;
  });
}
