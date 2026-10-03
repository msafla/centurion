import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const outDir = 'docs/screenshots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = 'http://127.0.0.1:4317';

async function shot(name, path, waitFor) {
  await page.goto(`${base}${path}`);
  if (waitFor) await page.getByRole('heading', { name: waitFor }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  console.log('captured', name);
}

await shot('synthese', '/', /Synthèse/);
await shot('plan-annuel', '/plan', /Plan annuel/);
await shot('referentiels', '/references', /Référentiels/);
await shot('import', '/import', /Import/);
await shot('parametres', '/settings', /Paramètres/);

const plans = await (await page.request.get(`${base}/api/plans`)).json();
const planId = plans.items[0].id;
const controls = await (await page.request.get(`${base}/api/plans/${planId}/controls`)).json();
const controlId = controls.items[0].id;
await shot('fiche-controle', `/control/${controlId}`, /—/);

await browser.close();
