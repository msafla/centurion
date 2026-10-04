import { expect, test } from '@playwright/test';

const CHECKBOX = /Écriture — créer un contrôle/;
const SAVED = 'Permissions MCP mises à jour.';

test('MCP permissions are editable and persisted from Settings', async ({ page, request }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Permissions MCP' })).toBeVisible();

  const create = page.getByRole('checkbox', { name: CHECKBOX });
  const initial = await create.isChecked();
  const target = !initial;

  await create.click();
  await expect(page.getByText(SAVED)).toBeVisible();

  const policy = (await (await request.get('http://127.0.0.1:4317/api/mcp-policy')).json()) as {
    write_create_enabled: boolean;
  };
  expect(policy.write_create_enabled).toBe(target);

  await page.reload();
  await expect(page.getByRole('checkbox', { name: CHECKBOX })).toBeChecked({ checked: target });

  // Restore the initial state so other journeys are unaffected.
  await page.getByRole('checkbox', { name: CHECKBOX }).click();
  await expect(page.getByText(SAVED)).toBeVisible();
});
