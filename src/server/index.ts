import Fastify from 'fastify';

const HOST = '127.0.0.1';
const PORT = 4317;

const app = Fastify({ logger: false, trustProxy: false });

app.get('/health', async () => ({ status: 'ok', schema_version: 1 }));

await app.listen({ host: HOST, port: PORT });
