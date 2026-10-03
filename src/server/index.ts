import { buildApp } from './app';
import { systemClock } from './clock';
import { loadConfig } from './config';

const config = loadConfig(process.env);
const app = await buildApp({ config, clock: systemClock() });

async function shutdown(): Promise<void> {
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await app.listen({ host: config.host, port: config.port });
