import type { Page, TestInfo } from '@playwright/test';

export const isMobileProject = (testInfo: TestInfo) => testInfo.project.name === 'mobile';

/** Open the command palette the way a user on this viewport would. */
export async function openSearch(page: Page, testInfo: TestInfo) {
  if (isMobileProject(testInfo)) {
    await page.locator('.bottom-nav button[data-open-search]').click();
  } else {
    await page.keyboard.press('Control+k');
  }
  await page.locator('#search-palette[open]').waitFor({ state: 'visible' });
  await page.locator('#palette-input').waitFor({ state: 'visible' });
}

export const paletteResults = (page: Page) => page.locator('#palette-results li[role="option"]');
