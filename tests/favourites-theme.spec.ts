import { expect, test } from '@playwright/test';

test('starring a glossary entry persists, shows on /favourites/, and can be unstarred there', async ({ page }) => {
  await page.goto('glossary/grappled-condition/');

  const favBtn = page.locator('[data-fav="glossary/grappled-condition"]');
  await expect(favBtn).toHaveAttribute('aria-pressed', 'false');
  await favBtn.click();
  await expect(favBtn).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.locator('[data-fav="glossary/grappled-condition"]')).toHaveAttribute('aria-pressed', 'true');

  await page.goto('favourites/');
  const card = page.locator('[data-fav-grid] .card', { hasText: 'Grappled' });
  await expect(card).toBeVisible();
  await expect(page.locator('[data-fav-empty]')).toBeHidden();

  await card.locator('[data-fav]').click();
  await expect(page.locator('[data-fav-grid] .card', { hasText: 'Grappled' })).toHaveCount(0);
  await expect(page.locator('[data-fav-empty]')).toBeVisible();
});

test('theme toggle flips the resolved theme and persists across navigation', async ({ page }) => {
  await page.goto('');
  const html = page.locator('html');
  const toggle = page.locator('[data-theme-toggle]');

  const initial = await html.getAttribute('data-resolved-theme');
  await toggle.click();
  const flipped = initial === 'dark' ? 'light' : 'dark';
  await expect(html).toHaveAttribute('data-resolved-theme', flipped);

  await page.goto('glossary/');
  await expect(html).toHaveAttribute('data-resolved-theme', flipped);

  const stored = await page.evaluate(() => localStorage.getItem('dnd-ref:theme'));
  expect(stored).toBe(flipped);
});
