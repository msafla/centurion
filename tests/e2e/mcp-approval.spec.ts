import { readdirSync, readFileSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

function newestDataDir(): string {
  const base = join(process.cwd(), 'data');
  const dirs = readdirSync(base)
    .filter((entry) => entry.startsWith('e2e-') && !entry.endsWith('.lock'))
    .map((entry) => ({ entry, mtime: statSync(join(base, entry)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const newest = dirs[0];
  if (!newest) throw new Error('no e2e data directory found');
  return join(base, newest.entry);
}

function dispatch(
  origin: string,
  token: string,
  tool: string,
  args: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ tool, arguments: args });
    const request = httpRequest(
      new URL('/internal/mcp/dispatch', origin),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
          'x-centurion-mcp-token': token,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          }),
        );
      },
    );
    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

test('an MCP write proposal changes nothing until approved in the UI', async ({ page, request }) => {
  const dataDir = newestDataDir();
  const token = readFileSync(join(dataDir, 'runtime', 'mcp-token'), 'utf8').trim();
  const origin = 'http://127.0.0.1:4317';

  const plan = await request.post(`${origin}/api/plans`, {
    headers: {
      origin,
      'x-centurion-request': '1',
      'content-type': 'application/json',
      host: '127.0.0.1:4317',
    },
    data: { year: 2031, name: 'Plan annuel 2031', perimeter: '' },
  });
  const planId = ((await plan.json()) as { id: string }).id;

  const proposed = await dispatch(origin, token, 'create_control', {
    plan_id: planId,
    input: {
      code: 'MCP1',
      title: 'Contrôle proposé',
      description: 'Description',
      referentials: ['iso_27001'],
      reference: 'REF',
      domain: 'Domaine',
      owner_name: '',
      method: '',
      expected_evidence: '',
      automated: false,
      automation_github_url: null,
      schedule: { kind: 'once', date: '2031-06-30' },
      active_from: null,
      active_to: null,
    },
  });
  expect(proposed.status).toBe(200);
  expect((proposed.body as { status: string }).status).toBe('human_confirmation_required');

  const before = await request.get(`${origin}/api/plans/${planId}/controls`);
  expect(((await before.json()) as { total: number }).total).toBe(0);

  await page.goto('/settings');
  await expect(page.getByText('create_control')).toBeVisible();
  await page.getByRole('button', { name: 'Approuver' }).first().click();
  await expect(page.getByText('Proposition approuvée.')).toBeVisible();

  const after = await request.get(`${origin}/api/plans/${planId}/controls`);
  expect(((await after.json()) as { total: number }).total).toBe(1);
});
