import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const demo = process.argv.includes('--demo');
const env: NodeJS.ProcessEnv = { ...process.env };

if (demo) {
  env.CENTURION_DEMO = '1';
  env.CENTURION_DATA_DIR = env.CENTURION_DATA_DIR ?? resolve('data', 'demo');
  const dbPath = resolve(env.CENTURION_DATA_DIR, 'centurion.sqlite');
  // Seed only when empty; never reset implicitly.
  if (!existsSync(dbPath)) {
    execFileSync('tsx', ['scripts/seed-demo.ts'], { stdio: 'inherit', env });
  }
}

const children: ChildProcess[] = [
  spawn('tsx', ['watch', 'src/server/index.ts'], { stdio: 'inherit', env }),
  spawn('vite', [], { stdio: 'inherit', env }),
];

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill(signal);
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
