const fs = require('node:fs');
const zlib = require('node:zlib');

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

  process.stdout.write(JSON.stringify({
    capabilities: adapterModule.OPENAI_CODEX_TRANSPORT_CAPABILITIES,
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

main().catch(() => {
  process.stderr.write('provider-free payload probe failed');
  process.exitCode = 1;
});
