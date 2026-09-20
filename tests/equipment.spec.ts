import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { isMobileProject } from './helpers';

interface Item {
  slug: string;
  name: string;
  kind: string;
  group: string;
  summary: string;
  costCp: number | null;
  weightLb: number | null;
}

const items: Item[] = JSON.parse(
  readFileSync(new URL('../src/data/equipment.json', import.meta.url), 'utf-8'),
);
const ofKind = (kind: string) => items.filter((i) => i.kind === kind);

function visibleRows(page: Page) {
  return page.locator('tr[data-item]:not([hidden])');
}

// Mirrors the weapons table: <thead> sort buttons on desktop, a select on mobile.
async function sortBy(page: Page, testInfo: import('@playwright/test').TestInfo, key: string, dir: 'asc' | 'desc') {
  if (isMobileProject(testInfo)) {
    await page.locator('select[data-card-sort]').selectOption(`${key}:${dir}`);
  } else {
    await page.locator(`button[data-sort="${key}"]`).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('equipment/');
});

test('the Armor filter shows exactly the armor items', async ({ page }) => {
  await page.locator('button[data-set="kind"][data-value="armor"]').click();

  const expected = ofKind('armor');
  await expect(visibleRows(page)).toHaveCount(expected.length);
  await expect(page.locator('[data-result-count]')).toHaveText(`${expected.length} items`);

  const names = new Set(await visibleRows(page).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.name)));
  expect(names).toEqual(new Set(expected.map((i) => i.name)));
});

test('a group chip narrows to that SRD table', async ({ page }) => {
  const expected = items.filter((i) => i.group === 'Heavy Armor');
  await page.locator('button[data-set="group"][data-value="Heavy Armor"]').click();

  await expect(visibleRows(page)).toHaveCount(expected.length);
  const names = new Set(await visibleRows(page).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.name)));
  expect(names).toEqual(new Set(['Ring Mail', 'Chain Mail', 'Splint Armor', 'Plate Armor']));
});

test('sorting by name orders rows ascending A-Z', async ({ page }, testInfo) => {
  await sortBy(page, testInfo, 'name', 'asc');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'ascending');

  const names = (await visibleRows(page).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.name))) as string[];
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test('sorting by cost descending puts the most expensive item first', async ({ page }, testInfo) => {
  await sortBy(page, testInfo, 'cost', 'desc');
  await expect(page.locator('th[aria-sort]')).toHaveAttribute('aria-sort', 'descending');

  const priciest = items.reduce((a, b) => ((b.costCp ?? -1) > (a.costCp ?? -1) ? b : a));
  await expect(visibleRows(page).first()).toHaveAttribute('data-name', priciest.name);
});

test('items with no listed cost sort last, not first', async ({ page }, testInfo) => {
  const unpriced = items.filter((i) => i.costCp === null);
  test.skip(unpriced.length === 0, 'no unpriced items in the data');

  await sortBy(page, testInfo, 'cost', 'asc');
  const names = (await visibleRows(page).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.name))) as string[];
  const tail = new Set(names.slice(-unpriced.length));
  expect(tail).toEqual(new Set(unpriced.map((i) => i.name)));
});

test('text filter matches an item summary, not just its name', async ({ page }) => {
  // The row filter searches name, group and summary; full descriptions are the
  // command palette's job. "poisoned" appears only in summaries here.
  const expected = items.filter((i) =>
    `${i.name} ${i.group} ${i.summary}`.toLowerCase().includes('poisoned'),
  );
  expect(expected.length).toBeGreaterThan(0);

  await page.locator('[data-filter-input]').fill('poisoned');
  await expect(visibleRows(page)).toHaveCount(expected.length);

  const names = await visibleRows(page).evaluateAll((r) => r.map((x) => (x as HTMLElement).dataset.name));
  for (const n of names) expect(n?.toLowerCase()).not.toContain('poisoned');
});

test('clearing filters from the empty state restores every row', async ({ page }) => {
  await page.locator('[data-filter-input]').fill('zzzzqq');
  await expect(page.locator('[data-empty]')).toBeVisible();
  await expect(visibleRows(page)).toHaveCount(0);

  await page.locator('[data-reset]').click();
  await expect(page.locator('[data-empty]')).toBeHidden();
  await expect(visibleRows(page)).toHaveCount(items.length);
  await expect(page.locator('[data-filter-input]')).toHaveValue('');
});

test('an armor detail page shows its SRD stats', async ({ page }) => {
  await page.goto('equipment/plate-armor/');
  const body = page.locator('.entry');
  await expect(body).toContainText('Armor Class (AC)');
  await expect(body).toContainText('18');
  await expect(body).toContainText('Str 15');
  await expect(body).toContainText('Disadvantage');
  await expect(body).toContainText('1,500 GP');
});

test('a gear detail page renders its description and inline table', async ({ page }) => {
  await page.goto('equipment/ammunition/');
  await expect(page.locator('.prose table')).toHaveCount(1);
  await expect(page.locator('.prose table caption')).toHaveText('Ammunition');
  await expect(page.locator('.prose')).toContainText('Ammunition is required by a weapon');
});

test('the Mounted Combat rules are a reachable glossary entry with all three parts', async ({ page }) => {
  await page.goto('glossary/mounted-combat/');
  await expect(page.locator('h1')).toHaveText('Mounted Combat');

  const headings = await page.locator('.prose h3').allTextContents();
  expect(headings).toEqual(['Mounting and Dismounting', 'Controlling a Mount', 'Falling Off']);

  // The page-16 "Resting" sidebar interrupts this section in the PDF and must
  // not have been swept into the rules text.
  await expect(page.locator('.prose')).not.toContainText('Short Rests');
});

test('the Underwater Combat rules are a reachable glossary entry with both parts', async ({ page }) => {
  await page.goto('glossary/underwater-combat/');
  await expect(page.locator('h1')).toHaveText('Underwater Combat');

  const headings = await page.locator('.prose h3').allTextContents();
  expect(headings).toEqual(['Impeded Weapons', 'Fire Resistance']);
});

test('mobile: rows render as cards, not a table, with no horizontal overflow', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'mobile-only layout check');

  await expect(page.locator('.equipment-table thead')).toBeHidden();
  await expect(page.locator('select[data-card-sort]')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(overflow).toBe(true);
});
