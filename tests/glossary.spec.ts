import { expect, test } from '@playwright/test';
import { isMobileProject } from './helpers';

test('filter input narrows results, updates the count and the URL', async ({ page }) => {
  await page.goto('glossary/');
  await page.locator('[data-filter-input]').fill('prone');

  await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(1);
  await expect(page.locator('[data-result-count]')).toHaveText('1 rule');
  await expect(page).toHaveURL(/[?&]q=prone(&|$)/);
});

test('Conditions category chip shows 16 entries and sets the URL', async ({ page }) => {
  await page.goto('glossary/');
  await page.locator('button[data-category="conditions"]').click();

  await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(16);
  await expect(page.locator('[data-result-count]')).toHaveText('16 rules');
  await expect(page).toHaveURL(/[?&]category=conditions(&|$)/);
  await expect(page.locator('button[data-category="conditions"]')).toHaveAttribute('aria-pressed', 'true');
});

test('loading /glossary/?category=conditions pre-applies the filter', async ({ page }) => {
  await page.goto('glossary/?category=conditions');

  await expect(page.locator('[data-entry]:not([hidden])')).toHaveCount(16);
  await expect(page.locator('button[data-category="conditions"]')).toHaveAttribute('aria-pressed', 'true');
});

test('detail page "See also" chips navigate to the related entry', async ({ page }) => {
  await page.goto('glossary/grappled-condition/');
  const firstChip = page.locator('.panel-accent .chips a.chip').first();
  const label = await firstChip.textContent();
  await firstChip.click();

  await expect(page.locator('h1')).toHaveText(label!.trim());
});

test('term tooltip appears on hover with a non-empty summary (desktop)', async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), 'hover tooltips are a mouse-only interaction');
  await page.goto('glossary/grappled-condition/');

  const term = page.locator('a.term[data-term="glossary/disadvantage"]');
  await term.hover();

  const tip = page.locator('#term-tip');
  await expect(tip).toBeVisible();
  await expect(tip.locator('.tip-title')).toHaveText('Disadvantage');
  const summary = await tip.locator('.tip-summary').textContent();
  expect(summary?.trim().length).toBeGreaterThan(0);
  // The hover-only tooltip has no "open" link — it's a preview, not a navigation target.
  await expect(tip.locator('.tip-open')).toHaveCount(0);
});

test('tapping a term shows the tip without navigating (mobile)', async ({ page }, testInfo) => {
  test.skip(!isMobileProject(testInfo), 'touch-only interaction');
  await page.goto('glossary/grappled-condition/');

  const term = page.locator('a.term[data-term="glossary/disadvantage"]');
  await term.tap();

  await expect(page).toHaveURL(/\/glossary\/grappled-condition\/$/);
  const tip = page.locator('#term-tip');
  await expect(tip).toBeVisible();
  const openLink = tip.locator('.tip-open');
  await expect(openLink).toHaveCount(1);

  // A second tap, on the tip's own "open" link, does navigate.
  await openLink.tap();
  await expect(page).toHaveURL(/\/glossary\/disadvantage\/$/);
});
