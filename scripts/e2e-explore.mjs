import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:4317';
const consoleErrors = [];
const pageErrors = [];
const failedResponses = [];
const steps = [];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(12_000);

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('response', (res) => {
  const url = res.url();
  if (res.status() >= 400 && (url.includes('/api/') || url.includes('/internal/'))) {
    failedResponses.push(`${res.status()} ${res.request().method()} ${url}`);
  }
});

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    steps.push(`OK   ${name} (${Date.now() - started}ms)`);
    console.log(`OK   ${name}`);
  } catch (error) {
    steps.push(`FAIL ${name} :: ${error.message.split('\n')[0]}`);
    console.log(`FAIL ${name} :: ${error.message.split('\n')[0]}`);
    await page.screenshot({ path: `/tmp/opencode/e2e-fail-${steps.length}.png` }).catch(() => {});
  }
}

const watchdog = setTimeout(() => {
  console.log('\nWATCHDOG: blocage détecté, arrêt.');
  console.log(JSON.stringify({ consoleErrors, pageErrors, failedResponses }, null, 2));
  process.exit(2);
}, 150_000);

const api = async (path) => {
  const res = await context.request.get(`${BASE}${path}`);
  return { status: res.status(), body: await res.json().catch(() => null) };
};

await step('Sélection du plan 2028', async () => {
  await page.goto(`${BASE}/`);
  const plans = await api('/api/plans');
  const target = plans.body.items.find((p) => p.year === 2028);
  if (!target) throw new Error('plan 2028 introuvable');
  await page.getByLabel('Choix du plan').selectOption(target.id);
});

await step('Synthèse', async () => {
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: /Synthèse/ }).waitFor({ timeout: 8000 });
  if ((await page.locator('main .rounded-lg').count()) < 5) throw new Error('cartes manquantes');
});

await step('Plan annuel affiche des lignes', async () => {
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await page.getByRole('heading', { name: /Plan annuel/ }).waitFor();
  if ((await page.locator('tbody tr').count()) < 5) throw new Error('trop peu de lignes');
});

await step('Filtre recherche', async () => {
  await page.getByLabel('Recherche').fill('ACC-01');
  await page.waitForTimeout(400);
  if ((await page.locator('tbody tr').count()) === 0) throw new Error('aucune ligne ACC-01');
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
});

await step('Filtre état superseded', async () => {
  await page.getByLabel('État').selectOption('superseded');
  await page.waitForTimeout(400);
  if ((await page.locator('tbody tr').count()) !== 1) throw new Error('superseded != 1');
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
});

await step('Vue douze mois', async () => {
  await page.getByRole('button', { name: 'Douze mois' }).click();
  await page.waitForTimeout(200);
  if ((await page.locator('main .grid > div').count()) < 12) throw new Error('moins de 12 mois');
  await page.getByRole('button', { name: 'Tableau' }).click();
});

await step('Réalisation FAIT Oui', async () => {
  await page.locator('tbody tr').first().getByRole('button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Oui' }).check();
  await dialog.getByLabel('Date de réalisation').fill('2028-04-01');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await dialog.waitFor({ state: 'hidden' });
});

await step('Création contrôle', async () => {
  await page.getByRole('button', { name: 'Nouveau contrôle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill('E2E-1');
  await dialog.getByLabel('Titre').fill('Contrôle e2e');
  await dialog.getByLabel('Description').fill('Créé par le test e2e');
  await dialog.getByLabel('Référence').fill('E2E');
  await dialog.getByLabel('Domaine').fill('Test');
  await dialog.getByLabel('Fréquence').selectOption('once');
  await dialog.getByLabel('Date').fill('2028-05-01');
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await dialog.waitFor({ state: 'hidden' });
});

await step('Import CSV : upload → mapping → aperçu → apply', async () => {
  await page.getByRole('link', { name: 'Import' }).click();
  await page.getByRole('heading', { name: 'Import' }).waitFor();
  await page.setInputFiles('#file', 'examples/import/centurion-controls.csv');
  await page.getByText(/colonnes détectées/).waitFor({ timeout: 8000 });
  const columns = {
    code: 0, title: 1, description: 2, referentiel: 3, reference: 4, domain: 5,
    owner_name: 6, method: 7, expected_evidence: 8, automated: 9,
    automation_github_url: 10, frequency_kind: 11, anchor_date: 12,
    explicit_dates: 13, active_from: 14, active_to: 15,
  };
  for (const [column, index] of Object.entries(columns)) {
    await page.getByLabel(`Colonne ${column}`).selectOption(String(index));
  }
  await page.getByLabel("Date d'effet").fill('2028-07-01');
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByText(/Créations/).waitFor({ timeout: 10000 });
  const apply = page.getByRole('button', { name: 'Appliquer' });
  if (!(await apply.isEnabled())) throw new Error('apply désactivé (lignes invalides)');
  await apply.click();
  await page.getByText('Import appliqué.').waitFor({ timeout: 10000 });
});

await step('Fiche contrôle : onglets', async () => {
  const plans = await api('/api/plans');
  const controls = await api(`/api/plans/${plans.body.items.find((p) => p.year === 2028).id}/controls`);
  await page.goto(`${BASE}/control/${controls.body.items[0].id}`);
  await page.getByRole('heading', { name: /—/ }).waitFor();
  for (const tab of ['Calendrier', 'Réalisations', 'Historique', 'Définition']) {
    await page.getByRole('button', { name: tab }).click();
    await page.waitForTimeout(150);
  }
});

await step('Aperçu de planning puis application', async () => {
  await page.getByRole('button', { name: 'Calendrier' }).click();
  await page.getByRole('button', { name: 'Modifier le planning' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fréquence').selectOption('explicit');
  await dialog.getByLabel('Dates (séparées par | )').fill('2028-06-30|2028-12-31');
  await dialog.getByLabel("Date d'effet du planning").fill('2028-05-01');
  await dialog.getByRole('button', { name: 'Aperçu' }).click();
  await dialog.getByText(/Créées/).waitFor();
  await dialog.getByRole('button', { name: 'Appliquer' }).click();
  await dialog.waitFor({ state: 'hidden' });
});

await step('Archivage du contrôle', async () => {
  await page.getByLabel("Date d'effet d'archivage").fill('2028-05-01');
  await page.getByRole('button', { name: 'Archiver' }).click();
  await page.getByText('Archivé').waitFor({ timeout: 5000 });
});

await step('Référentiels', async () => {
  await page.getByRole('link', { name: 'Référentiels' }).click();
  await page.getByRole('heading', { name: 'Référentiels' }).waitFor();
  if ((await page.locator('main article').count()) !== 3) throw new Error('catégories != 3');
});

await step('Reporting', async () => {
  await page.getByRole('link', { name: 'Reporting' }).click();
  await page.getByRole('heading', { name: 'Reporting' }).waitFor();
  await page.getByText(/Généré le/).waitFor({ timeout: 8000 });
});

await step('Export CSV téléchargeable', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.getByRole('link', { name: 'Export CSV' }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('.csv')) throw new Error('pas un CSV');
});

await step('Export PDF téléchargeable', async () => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('link', { name: 'Export PDF' }).click(),
  ]);
  if (!download.suggestedFilename().endsWith('.pdf')) throw new Error('pas un PDF');
});

await step('Paramètres : renommage plan', async () => {
  await page.getByRole('link', { name: 'Paramètres' }).click();
  await page.getByRole('heading', { name: 'Paramètres' }).waitFor();
  await page.getByLabel('Nom').fill('Plan annuel 2028 (e2e)');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByText('Plan mis à jour.').waitFor({ timeout: 5000 });
});

await step('Paramètres : sauvegarde puis restauration', async () => {
  await page.getByRole('button', { name: 'Créer une sauvegarde' }).click();
  await page.getByText('Sauvegarde créée.').waitFor({ timeout: 8000 });
  await page.locator('table tbody tr').first().getByRole('button', { name: 'Restaurer' }).click();
  await page.getByText('Restauration effectuée.').waitFor({ timeout: 15000 });
});

clearTimeout(watchdog);
await browser.close();

console.log('\n=== ERREURS CONSOLE ===');
console.log(consoleErrors.length ? [...new Set(consoleErrors)].join('\n') : 'aucune');
console.log('\n=== EXCEPTIONS PAGE ===');
console.log(pageErrors.length ? [...new Set(pageErrors)].join('\n') : 'aucune');
console.log('\n=== RÉPONSES HTTP >= 400 ===');
console.log(failedResponses.length ? [...new Set(failedResponses)].join('\n') : 'aucune');
const failed = steps.filter((s) => s.startsWith('FAIL')).length;
console.log(`\nRÉSULTAT: ${steps.length - failed}/${steps.length} étapes OK`);
process.exit(failed > 0 ? 1 : 0);
