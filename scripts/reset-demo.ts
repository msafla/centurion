import { readdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { acquireInstanceLock } from '../src/server/storage/instance-lock';
import { canonicalDataDir, ensurePrivateDir } from '../src/server/storage/paths';
import { seedDemo } from './demo-data';

if (!process.argv.includes('--confirm')) {
  process.stderr.write('Refusing to reset without --confirm.\n');
  process.exit(1);
}

const demoRoot = resolve('data/demo');
const target = resolve(process.env.CENTURION_DATA_DIR ?? demoRoot);
if (target !== demoRoot && !target.startsWith(demoRoot + sep)) {
  process.stderr.write('Refusing to reset a target outside data/demo.\n');
  process.exit(1);
}

const dataDir = canonicalDataDir(target);

let lock: Awaited<ReturnType<typeof acquireInstanceLock>>;
try {
  lock = await acquireInstanceLock(dataDir);
} catch {
  process.stderr.write('Refusing to reset while an instance is running.\n');
  process.exit(1);
}

try {
  for (const entry of readdirSync(dataDir)) {
    rmSync(join(dataDir, entry), { recursive: true, force: true });
  }
  ensurePrivateDir(dataDir);
  seedDemo(dataDir);
} finally {
  await lock.release();
}

process.stdout.write('Demo reset to the deterministic 2028 state.\n');
