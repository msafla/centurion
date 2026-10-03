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

const esbuildBin = resolve('node_modules', '.bin', 'esbuild');
const buildArgs = [
  'src/server/index.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  '--packages=external',
  '--jsx=automatic',
  '--target=node24',
  '--sourcemap',
  '--outfile=dist/server/index.js',
];

// The server uses JSX (pdfcn report components). esbuild's automatic runtime is
// required; tsx would compile JSX to the classic runtime and break rendering.
execFileSync('node', ['scripts/copy-assets.mjs'], { stdio: 'inherit', env });
execFileSync(esbuildBin, buildArgs, { stdio: 'inherit', env });

const children: ChildProcess[] = [
  spawn(esbuildBin, [...buildArgs, '--watch'], { stdio: 'inherit', env }),
  spawn('node', ['--watch', 'dist/server/index.js'], { stdio: 'inherit', env }),
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
