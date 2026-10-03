import { expect, test } from '@playwright/test';

test('new control dialog has an opaque theme background', async ({ page }) => {
  await page.goto('/plan');
  await page.getByRole('button', { name: 'Nouveau contrôle' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nouveau contrôle' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Code')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Créer' })).toBeVisible();

  await expect
    .poll(() => dialog.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(255, 255, 255)');
});
