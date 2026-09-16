import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { Result } from 'axe-core';
import { openSearch } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const PAGES = [
  { name: 'home', path: '' },
  { name: 'glossary index', path: 'glossary/' },
  { name: 'glossary detail (grappled)', path: 'glossary/grappled-condition/' },
  { name: 'glossary detail (breaking objects, has tables)', path: 'glossary/breaking-objects/' },
  { name: 'weapons index', path: 'weapons/' },
  { name: 'weapon detail (longsword)', path: 'weapons/longsword/' },
  { name: 'masteries index', path: 'masteries/' },
  { name: 'favourites', path: 'favourites/' },
] as const;

const SCHEMES = ['light', 'dark'] as const;

function summarizeViolations(violations: Result[]): string {
  if (!violations.length) return 'No violations.';
  return violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => {
          const selector = n.target.join(', ');
          const contrast = n.any
            .map((c) => c.data)
            .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
            .map((d) => JSON.stringify(d))
            .join('; ');
          return `    - ${selector}${contrast ? `  [${contrast}]` : ''}`;
        })
        .join('\n');
      return `[${v.impact ?? 'unknown'}] ${v.id}: ${v.help}\n${nodes}`;
    })
    .join('\n\n');
}

async function checkNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const severe = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = `${label}\n\n${summarizeViolations(results.violations)}`;
  expect(severe, summary).toEqual([]);
}

for (const { name, path } of PAGES) {
  for (const scheme of SCHEMES) {
    test(`a11y: ${name} has no serious/critical violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await checkNoSeriousViolations(page, `${name} @ ${path} (${scheme})`);
    });
  }
}

for (const scheme of SCHEMES) {
  test(`a11y: search palette open has no serious/critical violations (${scheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('');
    await openSearch(page, testInfo);
    await page.locator('#palette-input').fill('grappled');
    await expect(page.locator('#palette-results li[role="option"]').first()).toBeVisible();
    await checkNoSeriousViolations(page, `search palette open (${scheme})`);
  });
}

test('keyboard: Tab from page load reaches the skip link first, and it moves focus to #main', async ({ page }) => {
  await page.goto('');
  await page.keyboard.press('Tab');

  const focused = page.locator(':focus');
  await expect(focused).toHaveClass(/skip-link/);
  await expect(focused).toHaveAttribute('href', '#main');

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
  const activeElementId = await page.evaluate(() => document.activeElement?.id);
  expect(activeElementId).toBe('main');
});
