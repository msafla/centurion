import { type ChildProcess, spawn } from 'node:child_process';

const demo = process.argv.includes('--demo');
const env: NodeJS.ProcessEnv = { ...process.env };
if (demo) {
  env.CENTURION_DEMO = '1';
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
