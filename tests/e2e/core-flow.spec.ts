import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function createControl(
  page: import('@playwright/test').Page,
  fields: { code: string; title: string; reference?: string; automated?: boolean; url?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Nouveau contrôle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill(fields.code);
  await dialog.getByLabel('Titre').fill(fields.title);
  await dialog.getByLabel('Description').fill('Description de test');
  await dialog.getByLabel('Référence').fill(fields.reference ?? 'REF');
  await dialog.getByLabel('Domaine').fill('Gouvernance');
  await dialog.getByLabel('Fréquence').selectOption('quarterly');
  await dialog.getByLabel('Ancre').fill('2026-03-31');
  if (fields.automated) {
    await dialog.getByLabel('Automatisé').check();
    await dialog.getByLabel('URL GitHub (facultatif)').fill(fields.url ?? 'https://github.com/org/repo');
  }
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).toBeHidden();
}

test('core annual tracking flow', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await expect(page.getByRole('heading', { name: /Plan annuel/ })).toBeVisible();

  // Create a quarterly control -> four occurrences.
  await createControl(page, { code: 'Q1', title: 'Contrôle trimestriel' });
  await expect(page.locator('tbody tr')).toHaveCount(4);

  // FAIT Oui on the first occurrence.
  await page.locator('tbody tr').first().getByRole('button').click();
  const realization = page.getByRole('dialog');
  await realization.getByRole('radio', { name: 'Oui' }).check();
  await realization.getByLabel('Date de réalisation').fill('2026-03-31');
  await realization.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(realization).toBeHidden();
  await expect(page.locator('tbody tr').first()).toContainText('Oui');

  // FAIT Non on the second occurrence.
  await page.locator('tbody tr').nth(1).getByRole('button').click();
  await realization.getByRole('radio', { name: 'Non' }).check();
  await realization.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(realization).toBeHidden();
  await expect(page.locator('tbody tr').nth(1)).toContainText('Non réalisé');

  // Modify the schedule through a preview.
  await page.getByRole('link', { name: /Q1 —/ }).first().click();
  await expect(page.getByRole('heading', { name: /Q1 —/ })).toBeVisible();
  await page.getByRole('button', { name: 'Calendrier' }).click();
  await page.getByRole('button', { name: 'Modifier le planning' }).click();
  const schedule = page.getByRole('dialog');
  await schedule.getByLabel('Fréquence').selectOption('explicit');
  await schedule.getByLabel('Dates (séparées par | )').fill('2026-07-31|2026-12-31');
  await schedule.getByLabel("Date d'effet du planning").fill('2026-07-01');
  await schedule.getByRole('button', { name: 'Aperçu' }).click();
  await expect(schedule).toContainText('Créées');
  await schedule.getByRole('button', { name: 'Appliquer' }).click();
  await expect(schedule).toBeHidden();

  // Archive the control.
  await page.getByLabel("Date d'effet d'archivage").fill('2026-07-01');
  await page.getByRole('button', { name: 'Archiver' }).click();
  await expect(page.getByText('Archivé')).toBeVisible();

  // Safe GitHub link and XSS-as-text on a new automated control.
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await createControl(page, {
    code: 'AUTO',
    title: '<img src=x onerror=window.__xss=1>',
    automated: true,
  });
  const xssRow = page.locator('tbody tr', { hasText: 'AUTO' }).first();
  await expect(xssRow).toContainText('<img src=x onerror=window.__xss=1>');
  await expect(page.locator('img')).toHaveCount(0);
  expect(
    await page.evaluate(() => (globalThis as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();

  await page.getByRole('link', { name: /AUTO —/ }).first().click();
  const githubLink = page.getByRole('link', { name: 'Voir le script' });
  await expect(githubLink).toHaveAttribute('target', '_blank');
  await expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');

  // Visible 409 on a duplicate code.
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await createControl(page, { code: 'DUP', title: 'Doublon' });
  await page.getByRole('button', { name: 'Nouveau contrôle' }).click();
  const dupDialog = page.getByRole('dialog');
  await dupDialog.getByLabel('Code').fill('DUP');
  await dupDialog.getByLabel('Titre').fill('Doublon 2');
  await dupDialog.getByLabel('Description').fill('Description');
  await dupDialog.getByLabel('Référence').fill('REF');
  await dupDialog.getByLabel('Domaine').fill('Gouvernance');
  await dupDialog.getByLabel('Fréquence').selectOption('quarterly');
  await dupDialog.getByLabel('Ancre').fill('2026-03-31');
  await dupDialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dupDialog.getByRole('alert')).toContainText('code_collision');
  await dupDialog.getByRole('button', { name: 'Annuler' }).click();

  // Select another plan after cloning the next year.
  await page.getByRole('link', { name: 'Paramètres' }).click();
  await page.getByRole('button', { name: "Créer l'année suivante" }).click();
  await page.getByLabel('Choix du plan').selectOption({ label: 'Plan annuel 2027' });
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await expect(page.getByRole('heading', { name: /2027/ })).toBeVisible();
});
