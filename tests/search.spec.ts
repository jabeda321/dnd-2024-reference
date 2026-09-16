import { expect, test } from '@playwright/test';
import { openSearch, paletteResults } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('');
});

test('search opens and "grappled" finds the Grappled condition, Enter navigates to it', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  await page.locator('#palette-input').fill('grappled');

  const results = paletteResults(page);
  await expect(results.first()).toBeVisible();
  await expect(results.first().locator('.r-title')).toHaveText('Grappled');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/glossary\/grappled-condition\/$/);
});

test('search for "longsword" surfaces the Longsword weapon result', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  await page.locator('#palette-input').fill('longsword');

  const results = paletteResults(page);
  await expect(results.first()).toBeVisible();
  await expect(results.first().locator('.r-title')).toHaveText('Longsword');
  await expect(results.first().locator('.badge')).toHaveText('Weapon');
});

test('kind filter "Masteries" limits results to mastery docs only', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  const dialog = page.locator('#search-palette');
  await dialog.locator('button.chip[data-kind="mastery"]').click();
  await page.locator('#palette-input').fill('a');

  // Every mastery doc's label is the literal string "Mastery" (which contains
  // "a"), so this query matches all 8 of them and none of anything else.
  const results = paletteResults(page);
  await expect(results).toHaveCount(8);

  const badges = await results.locator('.badge').allTextContents();
  for (const badge of badges) expect(badge).toBe('Mastery');
});

test('Escape closes the dialog with a single press', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  await expect(page.locator('#search-palette')).toBeVisible();
  await page.locator('#palette-input').press('Escape');
  await expect(page.locator('#search-palette')).toBeHidden();
});

test('nonsense query shows a no-results message', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  await page.locator('#palette-input').fill('zzzzqq');
  await expect(page.locator('#palette-status')).toHaveText(/No results for/);
  await expect(paletteResults(page)).toHaveCount(0);
});

test('recently viewed entries show up when the palette is opened empty', async ({ page }, testInfo) => {
  await page.goto('glossary/grappled-condition/');
  await openSearch(page, testInfo);

  const results = paletteResults(page);
  await expect(results.first()).toBeVisible();
  await expect(results.first().locator('.r-title')).toHaveText('Grappled');
  await expect(page.locator('#palette-status')).toHaveText('Recently viewed');
});
