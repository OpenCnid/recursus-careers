import net from 'node:net';

function connect(options, payload) {
  return new Promise((resolve) => {
    const socket = net.createConnection(options);
    let response = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1_500, () => finish({ connected: false, response: '' }));
    socket.once('error', () => finish({ connected: false, response: '' }));
    socket.once('connect', () => {
      if (payload) socket.write(payload);
      else finish({ connected: true, response: '' });
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1');
      if (response.includes('\r\n\r\n')) finish({ connected: true, response });
    });
    socket.once('close', () => finish({ connected: true, response }));
  });
}

const denied = await connect(
  { host: '127.0.0.1', port: 8080 },
  'CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n',
);
const dockerDns = await connect({ host: '127.0.0.11', port: 53 });
const metadata = await connect({ host: '169.254.169.254', port: 80 });
const publicNetwork = await connect({ host: '1.1.1.1', port: 443 });
const result = {
  docker_dns_unreachable: !dockerDns.connected,
  metadata_unreachable: !metadata.connected,
  public_network_unreachable: !publicNetwork.connected,
  registered_proxy_denied: denied.response.startsWith('HTTP/1.1 403 Forbidden\r\n'),
};
process.stdout.write(`${JSON.stringify(result)}\n`);
if (Object.values(result).some((value) => value !== true)) process.exitCode = 1;
