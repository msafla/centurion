import { expect, test } from '@playwright/test';

test('production shell renders locally and a dialog manages focus', async ({ page }) => {
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:4317') && !url.startsWith('data:')) {
      externalRequests.push(url);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: /Plan annuel/i })).toBeVisible();

  const trigger = page.getByRole('button', { name: 'Nouveau contrôle' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Nouveau contrôle')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('renders at 390 and 1440 with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/plan');
  await expect(page.getByRole('heading', { name: /Plan annuel/i })).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Nouveau contrôle' })).toBeVisible();
});
