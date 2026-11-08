import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function createControl(
  page: import('@playwright/test').Page,
  code: string,
): Promise<void> {
  await page.getByRole('button', { name: 'Nouveau contrôle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Code').fill(code);
  await dialog.getByLabel('Titre').fill('Contrôle smoke nouvelles fonctionnalités');
  await dialog.getByLabel('Description').fill('Description smoke');
  await dialog.getByLabel('Référence').fill('REF-SMOKE');
  await dialog.getByLabel('Domaine').fill('Gouvernance');
  await dialog.getByRole('checkbox', { name: 'ISO 27001' }).check();
  await dialog.getByLabel('Fréquence').selectOption('quarterly');
  await dialog.getByLabel('Ancre').fill('2026-03-31');
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).toBeHidden();
}

test('smoke nouvelles fonctionnalités', async ({ page }) => {
  const tmpDir = join(tmpdir(), 'centurion-smoke');
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, 'piece.pdf'), '%PDF-1.4\n% smoke\n');

  await page.goto('/');
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await createControl(page, 'SMOKE');
  await expect(page.locator('tbody tr', { hasText: 'SMOKE' })).toHaveCount(4);

  // Tendances.
  await page.getByRole('link', { name: 'Tendances' }).click();
  await expect(page.getByRole('heading', { name: /Tendances/ })).toBeVisible();
  await expect(page.locator('table')).toBeVisible();

  // Fiche contrôle + clauses + justificatifs.
  await page.getByRole('link', { name: 'Plan annuel' }).click();
  await page.getByRole('link', { name: /SMOKE —/ }).first().click();
  await expect(page.getByRole('heading', { name: /SMOKE —/ })).toBeVisible();
  await page.getByRole('button', { name: 'Définition' }).click();
  await expect(page.getByText('Clauses')).toBeVisible();

  await page.getByRole('button', { name: 'Réalisations' }).click();
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(join(tmpDir, 'piece.pdf'));
  await page.waitForTimeout(1000);
  await expect(page.getByText('piece.pdf')).toBeVisible();

  // Navigation all main screens.
  for (const label of ['Synthèse', 'Recherche', 'Référentiels', 'Archivés', 'Reporting', 'Import', 'Paramètres']) {
    await page.getByRole('link', { name: label }).click();
    await expect(page.locator('main')).toBeVisible();
  }

  // Recherche : état vide puis résultat.
  await page.getByRole('link', { name: 'Recherche' }).click();
  await page.getByRole('textbox', { name: 'Recherche' }).fill('SMOKE');
  await expect(page.locator('tbody tr', { hasText: 'SMOKE' })).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Recherche' }).fill('zzz-rien');
  await expect(page.getByText('Aucun résultat pour cette recherche.')).toBeVisible();
});
