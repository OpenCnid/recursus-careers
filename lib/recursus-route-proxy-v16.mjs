import { lookup } from 'node:dns/promises';
import { chmodSync, lstatSync, readdirSync, unlinkSync } from 'node:fs';
import net from 'node:net';

const SOCKET_DIRECTORY = '/run/rc3-socket/v16';
const SOCKET_PATH = `${SOCKET_DIRECTORY}/connect.sock`;
const MAX_HEADER_BYTES = 8_192;
const MAX_TUNNEL_BYTES = 12 * 1024 * 1024;
const DNS_TIMEOUT_MS = 10_000;
const UPSTREAM_CONNECT_TIMEOUT_MS = 10_000;
const TUNNEL_TIMEOUT_MS = 120_000;
const DESTINATIONS = new Map([
  ['chatgpt.com:443', { host: 'chatgpt.com', id: 'responses', maxTunnels: 2 }],
  ['auth.openai.com:443', { host: 'auth.openai.com', id: 'oauth_refresh', maxTunnels: 2 }],
]);

const state = {
  active: new Set(),
  admitted: { oauth_refresh: 0, responses: 0 },
  attempted: { oauth_refresh: 0, responses: 0 },
  downloadBytes: 0,
  denied: 0,
  pending: new Set(),
  unexpected: 0,
  uploadBytes: 0,
};
const rejectedSockets = new Set();

function emit(type, fields = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...fields })}\n`);
}

function publicIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function rejectSocket(socket, reason) {
  if (rejectedSockets.has(socket) || socket.destroyed) return;
  rejectedSockets.add(socket);
  socket.once('close', () => rejectedSockets.delete(socket));
  state.denied += 1;
  emit('connect_denied', { reason_code: reason });
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
}

function parseConnect(bytes) {
  const text = bytes.toString('latin1');
  if (!text.endsWith('\r\n\r\n') || /[^\x09\x20-\x7e\r\n]/u.test(text)) return { error: 'malformed_header' };
  const lines = text.slice(0, -4).split('\r\n');
  if (lines.length < 2 || lines.length > 33) return { error: 'header_count' };
  const match = /^CONNECT ([a-z0-9.-]+:443) HTTP\/1\.1$/u.exec(lines[0]);
  if (!match) return { error: 'request_line' };
  const destination = DESTINATIONS.get(match[1]);
  if (!destination) return { error: 'destination' };
  const headers = [];
  for (const line of lines.slice(1)) {
    if (line.length > 1_024 || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[\x09\x20-\x7e]*$/u.test(line)) return { error: 'malformed_header' };
    const separator = line.indexOf(':');
    headers.push([line.slice(0, separator).toLowerCase(), line.slice(separator + 1).trim()]);
  }
  const hosts = headers.filter(([name]) => name === 'host');
  if (hosts.length !== 1 || (hosts[0][1] !== match[1] && hosts[0][1] !== destination.host)) return { error: 'host_header' };
  if (headers.some(([name]) => ['proxy-authorization', 'authorization', 'cookie', 'transfer-encoding', 'content-length'].includes(name))) return { error: 'sensitive_header' };
  return { authority: match[1], ...destination };
}

async function admit(client, parsed, remainder) {
  if (state.active.size !== 0 || state.pending.size !== 0) return rejectSocket(client, 'concurrency');
  if (state.attempted[parsed.id] >= parsed.maxTunnels) return rejectSocket(client, 'destination_cap');
  state.attempted[parsed.id] += 1;
  const ordinal = state.attempted[parsed.id];
  state.pending.add(client);
  let clientClosed = false;
  const onPendingClose = () => {
    clientClosed = true;
    state.pending.delete(client);
  };
  client.once('close', onPendingClose);
  let answers;
  let dnsTimer;
  try {
    answers = await Promise.race([
      lookup(parsed.host, { all: true, family: 4, verbatim: true }),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('dns timeout')), DNS_TIMEOUT_MS); }),
    ]);
  } catch {
    state.pending.delete(client);
    return rejectSocket(client, 'dns_failure');
  } finally {
    if (dnsTimer !== undefined) clearTimeout(dnsTimer);
  }
  if (clientClosed || client.destroyed || !state.pending.has(client)) return;
  const addresses = [...new Set(answers.map((answer) => answer.address))].filter(publicIpv4).sort();
  if (addresses.length === 0) {
    state.pending.delete(client);
    return rejectSocket(client, 'non_global_address');
  }
  const upstream = net.createConnection({ host: addresses[0], port: 443, family: 4 });
  const tunnel = { client, upstream, upload: remainder.length, download: 0, id: parsed.id, ordinal, closed: false };
  state.uploadBytes += remainder.length;
  state.active.add(tunnel);
  state.pending.delete(client);
  client.off('close', onPendingClose);
  let absoluteTimer;
  let connectTimer;
  const close = (reason) => {
    if (tunnel.closed) return;
    tunnel.closed = true;
    state.active.delete(tunnel);
    if (absoluteTimer !== undefined) clearTimeout(absoluteTimer);
    if (connectTimer !== undefined) clearTimeout(connectTimer);
    if (!['client_closed', 'upstream_closed'].includes(reason)) state.unexpected += 1;
    client.destroy();
    upstream.destroy();
    emit('tunnel_closed', { close_reason: reason, destination_id: tunnel.id, download_bytes: Math.min(tunnel.download, MAX_TUNNEL_BYTES + 1), ordinal: tunnel.ordinal, upload_bytes: Math.min(tunnel.upload, MAX_TUNNEL_BYTES + 1) });
  };
  if (state.uploadBytes > MAX_TUNNEL_BYTES) {
    close('byte_limit');
    return;
  }
  connectTimer = setTimeout(() => close('upstream_error'), UPSTREAM_CONNECT_TIMEOUT_MS);
  absoluteTimer = setTimeout(() => close('idle_timeout'), TUNNEL_TIMEOUT_MS);
  client.setTimeout(TUNNEL_TIMEOUT_MS, () => close('idle_timeout'));
  upstream.setTimeout(TUNNEL_TIMEOUT_MS, () => close('idle_timeout'));
  upstream.once('error', () => close('upstream_error'));
  client.once('error', () => close('client_error'));
  upstream.once('connect', () => {
    clearTimeout(connectTimer);
    connectTimer = undefined;
    state.admitted[parsed.id] += 1;
    emit('connect_admitted', { destination_id: parsed.id, ordinal: tunnel.ordinal });
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (remainder.length > 0) upstream.write(remainder);
    client.on('data', (chunk) => {
      tunnel.upload += chunk.length;
      state.uploadBytes += chunk.length;
      if (state.uploadBytes > MAX_TUNNEL_BYTES) close('byte_limit');
    });
    upstream.on('data', (chunk) => {
      tunnel.download += chunk.length;
      state.downloadBytes += chunk.length;
      if (state.downloadBytes > MAX_TUNNEL_BYTES) close('byte_limit');
    });
    client.pipe(upstream);
    upstream.pipe(client);
  });
  client.once('close', () => close('client_closed'));
  upstream.once('close', () => close('upstream_closed'));
}

function handle(client) {
  let buffered = Buffer.alloc(0);
  const headerTimer = setTimeout(() => rejectSocket(client, 'header_timeout'), 5_000);
  const clearHeaderTimer = () => clearTimeout(headerTimer);
  client.once('close', clearHeaderTimer);
  const onData = (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > MAX_HEADER_BYTES) {
      client.off('data', onData);
      clearHeaderTimer();
      rejectSocket(client, 'header_bytes');
      return;
    }
    const boundary = buffered.indexOf('\r\n\r\n');
    if (boundary < 0) return;
    client.off('data', onData);
    clearHeaderTimer();
    const headerEnd = boundary + 4;
    const parsed = parseConnect(buffered.subarray(0, headerEnd));
    if (parsed.error) rejectSocket(client, parsed.error);
    else void admit(client, parsed, buffered.subarray(headerEnd)).catch(() => rejectSocket(client, 'proxy_failure'));
  };
  client.on('data', onData);
}

const directory = lstatSync(SOCKET_DIRECTORY);
if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o777) !== 0o700 || directory.uid !== process.getuid() || directory.gid !== process.getgid() || readdirSync(SOCKET_DIRECTORY).length !== 0) {
  throw new Error('socket directory authority mismatch');
}
process.umask(0o077);
const server = net.createServer(handle);
server.listen(SOCKET_PATH, () => {
  chmodSync(SOCKET_PATH, 0o600);
  emit('proxy_ready', { policy_version: 'rc3-proxy-v16' });
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    try { unlinkSync(SOCKET_PATH); } catch {}
    emit('proxy_summary', {
      clean_shutdown: true,
      denied: state.denied,
      download_bytes: Math.min(state.downloadBytes, MAX_TUNNEL_BYTES + 1),
      oauth_admitted: state.admitted.oauth_refresh,
      responses_admitted: state.admitted.responses,
      unexpected: state.unexpected,
      upload_bytes: Math.min(state.uploadBytes, MAX_TUNNEL_BYTES + 1),
    });
    process.exit(0);
  });
  for (const tunnel of state.active) {
    tunnel.client.destroy();
    tunnel.upstream.destroy();
  }
  for (const socket of state.pending) socket.destroy();
  for (const socket of rejectedSockets) socket.destroy();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
