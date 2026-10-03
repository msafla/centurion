import { expect, test, type APIRequestContext } from '@playwright/test';

const BASE = 'http://127.0.0.1:4317';
const HOST = '127.0.0.1:4317';
const ORIGIN = 'http://127.0.0.1:4317';
const PLAN_YEAR = 2033;

function mutationHeaders(): Record<string, string> {
  return {
    host: HOST,
    origin: ORIGIN,
    'x-centurion-request': '1',
    'content-type': 'application/json',
  };
}

const metadata = {
  title: 'Titre',
  description: 'Description',
  referentials: ['iso_27001'],
  reference: 'REF',
  domain: 'Domaine',
  owner_name: '',
  method: '',
  expected_evidence: '',
  automated: false,
  automation_github_url: null,
  active_from: null,
  active_to: null,
};

function firstDaysOfYear(year: number, count: number): string[] {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const days: string[] = [];
  for (let month = 1; month <= 12 && days.length < count; month += 1) {
    for (let day = 1; day <= (lengths[month - 1] ?? 0) && days.length < count; day += 1) {
      days.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
  }
  return days;
}

async function seedPlan(request: APIRequestContext): Promise<string> {
  const plan = await request.post(`${BASE}/api/plans`, {
    headers: mutationHeaders(),
    data: { year: PLAN_YEAR, name: `Plan annuel ${PLAN_YEAR}`, perimeter: '' },
  });
  const planId = ((await plan.json()) as { id: string }).id;
  const big = await request.post(`${BASE}/api/plans/${planId}/controls`, {
    headers: mutationHeaders(),
    data: { ...metadata, code: 'C1', title: 'Contrôle paginé', schedule: { kind: 'explicit', dates: firstDaysOfYear(PLAN_YEAR, 151) } },
  });
  expect(big.status()).toBe(201);
  const single = await request.post(`${BASE}/api/plans/${planId}/controls`, {
    headers: mutationHeaders(),
    data: { ...metadata, code: 'C2', title: 'Contrôle unique', schedule: { kind: 'explicit', dates: [`${PLAN_YEAR}-06-01`] } },
  });
  expect(single.status()).toBe(201);
  return planId;
}

test('annual plan pagination keeps filters and resets to page 1 on filter change', async ({
  page,
  request,
}) => {
  const planId = await seedPlan(request);

  await page.goto('/plan');
  await page.getByLabel('Choix du plan').selectOption(planId);
  await expect(page.getByText('Page 1 · 152 occurrences')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Précédent' })).toBeDisabled();

  // Next preserves filters and updates the URL.
  const firstRowPage1 = await page.locator('tbody tr').first().innerText();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Page 2 · 152 occurrences')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(await page.locator('tbody tr').first().innerText()).not.toBe(firstRowPage1);

  // Changing a filter resets to page 1.
  await page.getByLabel('État').selectOption('open');
  await expect(page.getByText('Page 1 · 152 occurrences')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBeNull();

  // An active filter is preserved across page navigation.
  await page.getByLabel('Recherche').fill('C1');
  await expect(page.getByText('Page 1 · 151 occurrences')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Page 3 · 151 occurrences')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('search')).toBe('C1');
  expect(new URL(page.url()).searchParams.get('page')).toBe('3');

  // A filter with a single page resets to page 1.
  await page.getByLabel('Recherche').fill('C2');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('page')).toBeNull();

  // Last page disables Next, and browser back restores the URL.
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(page.getByText('Page 1 · 152 occurrences')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByText('Page 4 · 152 occurrences')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();
  await page.goBack();
  await expect(page.getByText('Page 3 · 152 occurrences')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBe('3');
});

test('annual plan header stays usable and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Nouveau contrôle' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tableau' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Douze mois' })).toBeVisible();
  const mobileOverflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  );
  expect(mobileOverflow).toBeLessThanOrEqual(0);
  const tableScroll = await page.evaluate<{ scrollWidth: number; clientWidth: number } | null>(
    `(() => {
      const el = document.querySelector('.overflow-x-auto');
      return el ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth } : null;
    })()`,
  );
  expect(tableScroll).not.toBeNull();
  expect((tableScroll?.scrollWidth ?? 0) > (tableScroll?.clientWidth ?? 0)).toBe(true);
  await page.screenshot({ path: 'docs/presentation/assets/annual-plan-390.png' });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/plan');
  await expect(page.getByRole('button', { name: 'Nouveau contrôle' })).toBeVisible();
  const desktopOverflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - window.innerWidth',
  );
  expect(desktopOverflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'docs/presentation/assets/annual-plan-1440.png' });
});
