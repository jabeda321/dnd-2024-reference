import { expect, test, type Page } from '@playwright/test';
import { isMobileProject } from './helpers';

function visibleRows(page: Page) {
  return page.locator('tr[data-weapon]:not([hidden])');
}

// The sort-by-column buttons live in <thead>, which is hidden on mobile (the
// table becomes a card list there); mobile exposes the same sort through
// `select[data-card-sort]` instead. Both drive the same applySort() logic and
// both set aria-sort on the (visually hidden but still present) <th>.
async function sortBy(page: Page, testInfo: import('@playwright/test').TestInfo, key: string, dir: 'asc' | 'desc') {
  if (isMobileProject(testInfo)) {
    await page.locator('select[data-card-sort]').selectOption(`${key}:${dir}`);
  } else {
    await page.locator(`button[data-sort="${key}"]`).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('weapons/');
});

test('sorting by damage puts the highest-average weapons on top and sets aria-sort', async ({ page }, testInfo) => {
  // diceAverage("2d6") = 7, diceAverage("1d12") = 6.5 — Greatsword and Maul (2d6)
  // rank above Greataxe and Musket (1d12).
  await sortBy(page, testInfo, 'damage', 'desc');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'descending');

  const names = await visibleRows(page).evaluateAll((rows) => rows.slice(0, 4).map((r) => (r as HTMLElement).dataset.name));
  expect(new Set(names.slice(0, 2))).toEqual(new Set(['Greatsword', 'Maul']));
  expect(new Set(names.slice(2, 4))).toEqual(new Set(['Greataxe', 'Musket']));
});

test('sorting by name orders rows ascending A-Z', async ({ page }, testInfo) => {
  await sortBy(page, testInfo, 'name', 'asc');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'ascending');

  const names = (await visibleRows(page).evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.name))) as string[];
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  expect(names).toEqual(sorted);
  expect(names[0]).toBe('Battleaxe');
});

test('Martial + Ranged filter shows exactly 6 rows', async ({ page }) => {
  await page.locator('button[data-set="category"][data-value="martial"]').click();
  await page.locator('button[data-set="kind"][data-value="ranged"]').click();

  await expect(visibleRows(page)).toHaveCount(6);
  await expect(page.locator('[data-result-count]')).toHaveText('6 weapons');
});

test('Topple mastery chip filters to exactly the 5 Topple weapons', async ({ page }) => {
  await page.locator('button[data-set="mastery"][data-value="topple"]').click();

  await expect(visibleRows(page)).toHaveCount(5);
  const names = new Set(await visibleRows(page).evaluateAll((rows) => rows.map((r) => (r as HTMLElement).dataset.name)));
  expect(names).toEqual(new Set(['Quarterstaff', 'Battleaxe', 'Lance', 'Maul', 'Trident']));
});

test('text filter "finesse" shows only rows with the Finesse property', async ({ page }) => {
  await page.locator('[data-filter-input]').fill('finesse');
  await expect(visibleRows(page)).toHaveCount(6);

  const propsTexts = await page.locator('tr[data-weapon]:not([hidden]) .w-props').allTextContents();
  for (const text of propsTexts) expect(text).toContain('Finesse');
});

test('clearing filters from the empty state restores all 38 rows', async ({ page }) => {
  await page.locator('[data-filter-input]').fill('zzzzqq');
  await expect(page.locator('[data-empty]')).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(0);

  await page.locator('[data-reset]').click();
  await expect(page.locator('[data-empty]')).toBeHidden();
  await expect(visibleRows(page)).toHaveCount(38);
  await expect(page.locator('[data-filter-input]')).toHaveValue('');
});

test('mobile: rows render as cards, not a table, with no horizontal overflow', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'mobile-only layout check');

  await expect(page.locator('.weapons-table thead')).toBeHidden();
  await expect(page.locator('select[data-card-sort]')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
});
