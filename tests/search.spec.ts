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

// Word-form coverage: the palette should find a rule from the form a player
// actually types, not only the exact wording the SRD prints.
const WORD_FORMS = [
  { query: 'escaping a grapple', title: 'Grappling', why: 'the rule says "escape DC", never "escaping"' },
  { query: 'grapple', title: 'Grappled', why: 'singular noun against the "Grappled"/"Grappling" titles' },
  { query: 'hiding', title: 'Hide', why: '-ing form of the Hide action' },
  { query: 'dodging', title: 'Dodge', why: '-ing form of the Dodge action' },
  { query: 'conditions', title: 'Condition', why: 'plural of the Condition entry' },
];

for (const { query, title, why } of WORD_FORMS) {
  test(`search "${query}" ranks ${title} first (${why})`, async ({ page }, testInfo) => {
    await openSearch(page, testInfo);
    await page.locator('#palette-input').fill(query);

    const results = paletteResults(page);
    await expect(results.first()).toBeVisible();
    await expect(results.first().locator('.r-title')).toHaveText(title);
  });
}

test('search "underwater" finds the Underwater Combat rules', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  await page.locator('#palette-input').fill('underwater');

  const results = paletteResults(page);
  await expect(results.first()).toBeVisible();
  await expect(results.first().locator('.r-title')).toHaveText('Underwater Combat');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/glossary\/underwater-combat\/$/);
});

// The palette used to sit at a fixed 10dvh, which crowded or covered the app
// header on shorter windows. It is now anchored below the header instead.
for (const height of [900, 768, 720, 640]) {
  test(`open palette never covers the top bar at ${height}px tall`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'mobile search is deliberately full screen');
    await page.setViewportSize({ width: 1280, height });
    await page.goto('');
    await openSearch(page, testInfo);
    await page.locator('#palette-input').fill('grap');
    await expect(paletteResults(page).first()).toBeVisible();

    const { headerBottom, paletteTop, paletteBottom } = await page.evaluate(() => {
      const h = document.querySelector('.app-header')!.getBoundingClientRect();
      const p = document.querySelector('#search-palette')!.getBoundingClientRect();
      return { headerBottom: h.bottom, paletteTop: p.top, paletteBottom: p.bottom };
    });
    expect(paletteTop, 'palette overlaps the header').toBeGreaterThanOrEqual(headerBottom);
    expect(paletteBottom, 'palette runs past the viewport').toBeLessThanOrEqual(height);
  });
}

test('the palette shows a live match count while typing', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  const badge = page.locator('[data-palette-count]');
  await expect(badge).toBeEmpty();

  await page.locator('#palette-input').fill('grap');
  await expect(paletteResults(page).first()).toBeVisible();
  const shown = await paletteResults(page).count();
  await expect(badge).toHaveText(String(shown));

  await page.locator('#palette-input').fill('zzzqq');
  await expect(badge).toBeEmpty();
});

test('every kind filter is reachable without horizontal scrolling', async ({ page }, testInfo) => {
  await openSearch(page, testInfo);
  const chips = page.locator('.palette-filters .chip');
  await expect(chips).toHaveCount(6);
  for (const chip of await chips.all()) await expect(chip).toBeInViewport();
});
