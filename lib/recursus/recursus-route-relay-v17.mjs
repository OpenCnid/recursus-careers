import net from 'node:net';

const SOCKET_PATH = '/run/rc3-socket/v17/connect.sock';
const state = { active: new Set(), accepted: 0, upstreamFailures: 0 };

function emit(type, fields = {}) {
  process.stdout.write(`${JSON.stringify({ type, ...fields })}\n`);
}

const server = net.createServer((client) => {
  state.accepted += 1;
  const upstream = net.createConnection({ path: SOCKET_PATH });
  const pair = { client, upstream };
  state.active.add(pair);
  const close = () => {
    state.active.delete(pair);
    client.destroy();
    upstream.destroy();
  };
  upstream.once('connect', () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });
  upstream.once('error', () => {
    state.upstreamFailures += 1;
    close();
  });
  client.once('error', close);
  client.once('close', close);
  upstream.once('close', close);
});

server.listen({ host: '127.0.0.1', port: 8080, exclusive: true }, () => emit('relay_ready', { policy_version: 'rc3-relay-v17' }));

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    emit('relay_summary', { accepted_connections: state.accepted, clean_shutdown: true, upstream_failures: state.upstreamFailures });
    process.exit(0);
  });
  for (const pair of state.active) {
    pair.client.destroy();
    pair.upstream.destroy();
  }
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
