import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { openDatabase } from '../../src/server/db/database';
import { Runtime } from '../../src/server/runtime';
import { OperationGate } from '../../src/server/storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from '../../src/server/storage/paths';
import { writeRuntimeFiles } from '../../src/server/storage/runtime-files';
import { READ_TOOLS } from '../../src/server/mcp/policy';

const tsxBin = resolve('node_modules', '.bin', 'tsx');
const serverPath = fileURLToPath(new URL('../../src/mcp/server.ts', import.meta.url));

let app: FastifyInstance;
let dataDir: string;
let runtime: Runtime;
const dirs: string[] = [];

beforeAll(async () => {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-mcp-'));
  dirs.push(raw);
  dataDir = canonicalDataDir(raw);
  ensurePrivateDir(dataDir);
  const db = openDatabase(join(dataDir, 'centurion.sqlite'));
  runtime = new Runtime(
    loadConfig({}, { dataDir, port: 4317 }),
    fixedClock('2028-04-15T10:00:00.000Z'),
    dataDir,
    new OperationGate(),
    db,
    randomUUID(),
  );
  runtime.mcpWriteEnabled = false;
  runtime.mcpToken = writeRuntimeFiles(dataDir, {
    origin: 'http://127.0.0.1:4317',
    epoch: runtime.engineEpoch,
    mcp_write_enabled: false,
  });
  app = await buildApp({ config: runtime.config, clock: runtime.clock, runtime });
  await app.listen({ host: '127.0.0.1', port: 4317 });

  await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: {
      host: '127.0.0.1:4317',
      origin: 'http://127.0.0.1:4317',
      'x-centurion-request': '1',
      'content-type': 'application/json',
    },
    payload: { year: 2028, name: 'Plan annuel 2028', perimeter: '' },
  });
});

afterAll(async () => {
  await app.close();
  runtime.db.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function connect(mode: 'legacy' | 'modern', dir: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: tsxBin,
    args: [serverPath],
    env: { ...process.env, CENTURION_DATA_DIR: dir },
    stderr: 'pipe',
  });
  const client = new Client(
    { name: `centurion-${mode}`, version: '1.0.0' },
    mode === 'modern' ? { versionNegotiation: { mode: 'auto' } } : undefined,
  );
  await client.connect(transport);
  return client;
}

function textOf(result: { content?: unknown }): Record<string, unknown> {
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('MCP stdio read-only', () => {
  it('lists exactly the eight read tools and answers a call in legacy and modern modes', async () => {
    for (const mode of ['legacy', 'modern'] as const) {
      const client = await connect(mode, dataDir);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([...READ_TOOLS].sort());
      expect(tools.tools.some((tool) => tool.name === 'create_control')).toBe(false);

      const result = await client.callTool({ name: 'list_plans', arguments: {} });
      const body = textOf(result);
      expect(body.status).toBe('ok');
      expect(body.data_origin).toBe('centurion_data');
      expect(body.trust).toBe('untrusted_data');
      await client.close();
    }
  }, 60_000);

  it('returns a typed error when the backend is absent, without polluting stdout', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'centurion-mcp-empty-'));
    dirs.push(emptyDir);
    const client = await connect('modern', emptyDir);
    const result = await client.callTool({ name: 'list_plans', arguments: {} });
    const body = textOf(result);
    expect(body.status).toBe('error');
    expect((body.error as { code: string }).code).toBe('backend_unavailable');
    await client.close();
  }, 60_000);
});

describe('MCP transport and token boundary', () => {
  it('refuses a missing or wrong token and exposes no HTTP MCP endpoint', async () => {
    const noToken = await fetch('http://127.0.0.1:4317/internal/mcp/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool: 'list_plans', arguments: {} }),
    });
    expect(noToken.status).toBe(403);

    const wrongToken = await fetch('http://127.0.0.1:4317/internal/mcp/dispatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-centurion-mcp-token': 'wrong' },
      body: JSON.stringify({ tool: 'list_plans', arguments: {} }),
    });
    expect(wrongToken.status).toBe(403);

    const sse = await fetch('http://127.0.0.1:4317/sse');
    expect(sse.status).toBe(404);
  });

  it('does not accept a forged public source header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: {
        host: '127.0.0.1:4317',
        'x-centurion-source': 'mcp',
        'content-type': 'application/json',
      },
      payload: { year: 2030, name: 'Plan annuel 2030', perimeter: '' },
    });
    expect(res.statusCode).toBe(403);
  });
});
