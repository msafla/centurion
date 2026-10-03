import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
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

const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const CLOCK = '2028-04-15T10:00:00.000Z';
const TOKEN = 'test-token-32-bytes-0123456789ab';

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

async function makeApp(): Promise<{ app: FastifyInstance; runtime: Runtime }> {
  const raw = mkdtempSync(join(tmpdir(), 'centurion-proposal-'));
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
    true,
  );
  const app = await buildApp({ config: runtime.config, clock: runtime.clock, runtime });
  await app.ready();
  apps.push(app);
  runtimes.push(runtime);
  return { app, runtime };
}

function uiHeaders(): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
  };
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

async function dispatch(app: FastifyInstance, tool: string, args: unknown) {
  return app.inject({
    method: 'POST',
    url: '/internal/mcp/dispatch',
    headers: { host: HOST, 'content-type': 'application/json', 'x-centurion-mcp-token': TOKEN },
    payload: { tool, arguments: args },
  });
}

const controlInput = {
  code: 'C1',
  title: 'Titre',
  description: 'Description',
  referentiel: 'iso_27001',
  reference: 'REF',
  domain: 'Domaine',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: null,
  schedule: { kind: 'once', date: '2028-01-01' },
  active_from: null,
  active_to: null,
};

describe('MCP write confirmation', () => {
  it('creates a proposal without mutating, then applies it once with source=mcp', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);

    const proposed = await dispatch(app, 'create_control', { plan_id: planId, input: controlInput });
    expect(proposed.statusCode).toBe(200);
    const body = proposed.json() as { status: string; data: { id: string; state: string } };
    expect(body.status).toBe('human_confirmation_required');
    expect(body.data.state).toBe('pending');
    expect(
      runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get(),
    ).toEqual({ n: 0 });

    const approved = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${body.data.id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
    expect(runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get()).toEqual({ n: 1 });
    const audit = runtime.db.db
      .prepare(
        "SELECT source, COUNT(*) AS n FROM audit_events WHERE action = 'create' AND entity_type = 'control' GROUP BY source",
      )
      .all() as { source: string; n: number }[];
    expect(audit).toEqual([{ source: 'mcp', n: 1 }]);

    const replay = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${body.data.id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(replay.statusCode).toBe(200);
    expect(runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get()).toEqual({ n: 1 });
    expect(
      runtime.db.db
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_events WHERE action = 'create' AND entity_type = 'control'",
        )
        .get(),
    ).toEqual({ n: 1 });
  });

  it('refuses stale, tampered, expired and previous-epoch proposals without change', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    const proposed = await dispatch(app, 'create_control', { plan_id: planId, input: controlInput });
    const id = (proposed.json() as { data: { id: string } }).data.id;

    runtime.db.db.prepare('UPDATE plans SET data_revision = data_revision + 1 WHERE id = ?').run(planId);
    const stale = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(stale.statusCode).toBe(409);

    runtime.db.db.prepare('UPDATE plans SET data_revision = 0 WHERE id = ?').run(planId);
    runtime.db.db
      .prepare("UPDATE mcp_proposals SET normalized_arguments_json = '{}' WHERE id = ?")
      .run(id);
    const tampered = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(tampered.statusCode).toBe(409);

    runtime.engineEpoch = randomUUID();
    const epoch = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(epoch.statusCode).toBe(409);
    expect(runtime.db.db.prepare('SELECT COUNT(*) AS n FROM controls').get()).toEqual({ n: 0 });
  });

  it('rejects code and planning changes in update proposals', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: uiHeaders(),
      payload: controlInput,
    });
    const controlId = (
      runtime.db.db.prepare('SELECT id FROM controls LIMIT 1').get() as { id: string }
    ).id;
    for (const input of [{ code: 'X' }, { schedule: { kind: 'annual', anchorDate: '2028-01-01' } }, { status: 'archived' }]) {
      const res = await dispatch(app, 'update_control_metadata', {
        plan_id: planId,
        control_id: controlId,
        input,
      });
      expect(res.statusCode).toBe(422);
    }
  });

  it('applies set_occurrence with the same normalization as the API', async () => {
    const { app, runtime } = await makeApp();
    const planId = await createPlan(app);
    await app.inject({
      method: 'POST',
      url: `/api/plans/${planId}/controls`,
      headers: uiHeaders(),
      payload: controlInput,
    });
    const occurrence = runtime.db.db
      .prepare('SELECT id FROM occurrences LIMIT 1')
      .get() as { id: string };

    const proposed = await dispatch(app, 'set_occurrence', {
      plan_id: planId,
      occurrence_id: occurrence.id,
      input: {
        fait: false,
        conformite: 'conforme',
        completed_date: '2028-04-15',
        comment: 'constat',
        evidence_ref: 'ref',
      },
    });
    const id = (proposed.json() as { data: { id: string } }).data.id;
    const approved = await app.inject({
      method: 'POST',
      url: `/api/mcp-proposals/${id}/approve`,
      headers: uiHeaders(),
      payload: {},
    });
    expect(approved.statusCode).toBe(200);
    const realization = runtime.db.db
      .prepare('SELECT conformite, evidence_ref FROM realizations WHERE occurrence_id = ?')
      .get(occurrence.id) as { conformite: string; evidence_ref: string | null };
    expect(realization).toEqual({ conformite: 'non_applicable', evidence_ref: null });
  });

  it('refuses the 21st pending proposal', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    for (let index = 0; index < 20; index += 1) {
      const res = await dispatch(app, 'create_control', {
        plan_id: planId,
        input: { ...controlInput, code: `C${index}` },
      });
      expect(res.statusCode).toBe(200);
    }
    const overflow = await dispatch(app, 'create_control', {
      plan_id: planId,
      input: { ...controlInput, code: 'OVERFLOW' },
    });
    expect(overflow.statusCode).toBe(429);
  }, 60_000);

  it('cannot be approved through the MCP dispatch allowlist', async () => {
    const { app } = await makeApp();
    const planId = await createPlan(app);
    const res = await dispatch(app, 'approve_proposal', { plan_id: planId, proposal_id: randomUUID() });
    expect(res.statusCode).toBe(422);
  });
});
