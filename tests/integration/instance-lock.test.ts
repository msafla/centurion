import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireInstanceLock } from '../../src/server/storage/instance-lock';

const tsxBin = resolve('node_modules', '.bin', 'tsx');
const fixture = fileURLToPath(new URL('../fixtures/lock-holder.ts', import.meta.url));

const children: ChildProcess[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const child of children) {
    if (!child.killed) child.kill('SIGKILL');
  }
  children.length = 0;
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

function startHolder(dir: string): ChildProcess {
  const child = spawn(tsxBin, [fixture, dir], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return child;
}

function waitForOutput(child: ChildProcess, marker: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${marker}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      if (buffer.includes(marker)) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        resolvePromise(buffer);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', (code) => {
      if (buffer.includes(marker)) return;
      clearTimeout(timer);
      reject(new Error(`exited ${code} before ${marker}: ${buffer}`));
    });
  });
}

describe('single owner lock', () => {
  it('refuses a second real process and releases cleanly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'centurion-lock-'));
    dirs.push(dir);

    const first = startHolder(dir);
    await waitForOutput(first, 'LOCKED');

    const second = startHolder(dir);
    const output = await waitForOutput(second, 'ERROR');
    expect(output).toContain('instance_already_running');
    await new Promise<void>((resolveExit) => second.on('exit', () => resolveExit()));

    const firstExit = new Promise<void>((resolveExit) => first.on('exit', () => resolveExit()));
    first.kill('SIGTERM');
    await firstExit;

    const lock = await acquireInstanceLock(dir);
    await lock.release();
  }, 30_000);
});
