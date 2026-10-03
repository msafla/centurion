import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { buildApp } from './app';
import { recoverOnStartup } from './backups/recovery';
import { systemClock } from './clock';
import { loadConfig } from './config';
import { type DatabaseHandle, openDatabase } from './db/database';
import { bootstrapPlanIfEmpty } from './domain/plans';
import { Runtime } from './runtime';
import { acquireInstanceLock, type InstanceLock } from './storage/instance-lock';
import { OperationGate } from './storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from './storage/paths';

const config = loadConfig(process.env);
const clock = systemClock();

const dataDir = canonicalDataDir(config.dataDir);
ensurePrivateDir(dataDir);

const lock: InstanceLock = await acquireInstanceLock(dataDir);

let db: DatabaseHandle | undefined;
let closing = false;

async function shutdown(exitCode = 0): Promise<void> {
  if (closing) return;
  closing = true;
  try {
    db?.close();
  } finally {
    await lock.release().catch(() => undefined);
  }
  process.exit(exitCode);
}

try {
  // Finish or roll back an interrupted restore before opening the database.
  recoverOnStartup(dataDir);

  db = openDatabase(join(dataDir, 'centurion.sqlite'));
  bootstrapPlanIfEmpty(db, clock);

  const runtime = new Runtime(config, clock, dataDir, new OperationGate(), db, randomUUID());
  const app = await buildApp({ config, clock, runtime });

  process.on('SIGTERM', () => void shutdown(0));
  process.on('SIGINT', () => void shutdown(0));
  void lock.compromised.then(() => shutdown(1));

  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  await shutdown(1);
  throw error;
}
