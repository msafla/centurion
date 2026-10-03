import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

const tempDirs: string[] = [];
const makeTemp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'centurion-t0-'));
  tempDirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('T0 dependency smoke', () => {
  it('backs up a WAL SQLite database and verifies integrity and foreign keys', async () => {
    const dir = makeTemp();
    const source = join(dir, 'source.sqlite');
    const backup = join(dir, 'backup.sqlite');

    const db = new Database(source);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE child(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE parent(id INTEGER PRIMARY KEY, child_id INTEGER NOT NULL REFERENCES child(id));
      INSERT INTO child(id, name) VALUES (1, 'a');
      INSERT INTO parent(id, child_id) VALUES (1, 1);
    `);
    await db.backup(backup);
    db.close();

    const restored = new Database(backup, { readonly: true });
    expect(restored.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(restored.pragma('foreign_key_check')).toEqual([]);
    expect(restored.prepare('SELECT count(*) AS c FROM parent').get()).toEqual({ c: 1 });
    restored.close();
  });

  it('renders a multipage PDF with local Poppins and extracts accented text', () => {
    const dir = makeTemp();
    const out = join(dir, 'report.pdf');
    const stdout = execFileSync(process.execPath, [fixture('pdf-smoke.mjs'), out], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
    });
    const result = JSON.parse(stdout.trim()) as {
      byteLength: number;
      pages: number;
      hasTitle: boolean;
      hasAccents: boolean;
    };
    expect(result.byteLength).toBeGreaterThan(1_000);
    expect(result.pages).toBeGreaterThanOrEqual(2);
    expect(result.hasTitle).toBe(true);
    expect(result.hasAccents).toBe(true);
    expect(statSync(out).size).toBe(result.byteLength);
  });

  it('handshakes over real stdio with both legacy and modern MCP clients', async () => {
    const serverPath = fixture('mcp-smoke-server.mjs');

    async function probe(mode: 'legacy' | 'modern') {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [serverPath],
        stderr: 'pipe',
      });
      const client = new Client(
        { name: `smoke-${mode}`, version: '1.0.0' },
        mode === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined,
      );
      await client.connect(transport);
      try {
        const tools = await client.listTools();
        expect(tools.tools.map((tool) => tool.name)).toContain('echo');
        const result = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });
        expect(result.content).toEqual([{ type: 'text', text: 'echo:hi' }]);
      } finally {
        await client.close();
      }
    }

    await probe('legacy');
    await probe('modern');
  });
});
