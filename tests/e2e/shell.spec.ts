import { expect, test } from '@playwright/test';

test('production shell renders locally and the dialog manages focus', async ({ page }) => {
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

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Plan annuel/i })).toBeVisible();

  const trigger = page.getByRole('button', { name: 'À propos' });
  await trigger.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('À propos de CENTURION')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
