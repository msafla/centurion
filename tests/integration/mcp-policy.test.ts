import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { fixedClock } from '../../src/server/clock';
import { loadConfig } from '../../src/server/config';
import { openDatabase } from '../../src/server/db/database';
import { Runtime } from '../../src/server/runtime';
import { OperationGate } from '../../src/server/storage/operation-gate';
import { canonicalDataDir, ensurePrivateDir } from '../../src/server/storage/paths';
import { backendInfoPath } from '../../src/server/storage/runtime-files';

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';
const TOKEN = 'policy-test-token-0123456789abcdef';

const apps: FastifyInstance[] = [];
const runtimes: Runtime[] = [];
const dirs: string[] = [];

afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close();
  while (runtimes.length > 0) {
    try {
      runtimes.pop()?.db.close();
    } catch {
      // ignore
    }
  }
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs.length = 0;
});

async function makeApp(): Promise<{ app: FastifyInstance; runtime: Runtime; dataDir: string }> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-policy-'));
  dirs.push(raw);
  const dataDir = canonicalDataDir(raw);
  ensurePrivateDir(dataDir);
  const db = openDatabase(join(dataDir, 'centurion.sqlite'));
  const runtime = new Runtime(
    loadConfig({}, { dataDir }),
    fixedClock(CLOCK),
    dataDir,
    new OperationGate(),
    db,
    randomUUID(),
    TOKEN,
  );
  const app = await buildApp({ config: runtime.config, clock: runtime.clock, runtime });
  await app.ready();
  apps.push(app);
  runtimes.push(runtime);
  return { app, runtime, dataDir };
}

function uiHeaders(): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
  };
}

async function dispatch(app: FastifyInstance, tool: string, args: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/mcp/dispatch',
    headers: { host: HOST, 'content-type': 'application/json', 'x-centurion-mcp-token': TOKEN },
    payload: { tool, arguments: args },
  });
}

async function createPlan(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/plans',
    headers: uiHeaders(),
    payload: { year: 2028, name: 'Plan annuel 2028', perimeter: '' },
  });
  return (res.json() as { id: string }).id;
}

describe('MCP permissions', () => {
  it('exposes read and exports by default, writes disabled', async () => {
    const { app } = await makeApp();
    const policy = await app.inject({ method: 'GET', url: '/api/mcp-policy', headers: { host: HOST } });
    expect(policy.json()).toMatchObject({
      read_enabled: true,
      exports_enabled: true,
      write_create_enabled: false,
      write_update_enabled: false,
      write_set_occurrence_enabled: false,
    });

    const planId = await createPlan(app);
    const read = await dispatch(app, 'list_plans', {});
    expect(read.statusCode).toBe(200);
    const write = await dispatch(app, 'create_control', { plan_id: planId, input: {} });
    expect(write.statusCode).toBe(403);
    expect((write.json() as { error: { code: string } }).error.code).toBe('mcp_tool_disabled');
  });

  it('applies a policy update immediately to dispatch and to the adapter bootstrap', async () => {
    const { app, dataDir } = await makeApp();
    const planId = await createPlan(app);

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/mcp-policy',
      headers: uiHeaders(),
      payload: { write_create_enabled: true, exports_enabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ write_create_enabled: true, exports_enabled: false });

    // Adapter bootstrap reflects the new permissions.
    const info = JSON.parse(readFileSync(backendInfoPath(dataDir), 'utf8')) as {
      policy: { write_create_enabled: boolean; exports_enabled: boolean };
    };
    expect(info.policy).toMatchObject({ write_create_enabled: true, exports_enabled: false });

    const create = await dispatch(app, 'create_control', {
      plan_id: planId,
      input: {
        code: 'C1',
        title: 'Titre',
        description: 'Description',
        referentials: ['iso_27001'],
        reference: 'REF',
        domain: 'Domaine',
        owner_name: '',
        method: '',
        expected_evidence: '',
        automated: false,
        automation_github_url: null,
        schedule: { kind: 'once', date: '2028-06-01' },
        active_from: null,
        active_to: null,
      },
    });
    expect(create.statusCode).toBe(200);
    expect((create.json() as { status: string }).status).toBe('human_confirmation_required');

    const exportRes = await dispatch(app, 'export_controls_csv', { plan_id: planId });
    expect(exportRes.statusCode).toBe(403);

    const readOff = await app.inject({
      method: 'PUT',
      url: '/api/mcp-policy',
      headers: uiHeaders(),
      payload: { read_enabled: false },
    });
    expect(readOff.statusCode).toBe(200);
    const read = await dispatch(app, 'list_plans', {});
    expect(read.statusCode).toBe(403);
  });

  it('rejects unknown or empty policy patches', async () => {
    const { app } = await makeApp();
    const unknown = await app.inject({
      method: 'PUT',
      url: '/api/mcp-policy',
      headers: uiHeaders(),
      payload: { unknown: true },
    });
    expect(unknown.statusCode).toBe(422);
    const empty = await app.inject({
      method: 'PUT',
      url: '/api/mcp-policy',
      headers: uiHeaders(),
      payload: {},
    });
    expect(empty.statusCode).toBe(422);
  });
});
