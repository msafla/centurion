// Docker HEALTHCHECK (exec form, no shell): GET /health on loopback with the
// canonical Host header, exit 0 only when the JSON body reports status "ok".
import { get } from 'node:http';

const TIMEOUT_MS = 3000;

const req = get(
  {
    host: '127.0.0.1',
    port: 4317,
    path: '/health',
    headers: { Host: '127.0.0.1:4317' },
    timeout: TIMEOUT_MS,
  },
  (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      try {
        process.exit(JSON.parse(body).status === 'ok' ? 0 : 1);
      } catch {
        process.exit(1);
      }
    });
  },
);

req.on('timeout', () => req.destroy(new Error('healthcheck timeout')));
req.on('error', () => process.exit(1));
