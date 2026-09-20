import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const BASE = '/dnd-2024-reference/';

// Counts come from the data rather than being hard-coded, so adding rules or
// items doesn't fail these tests; they still assert that everything renders.
const data = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf-8'));
const GLOSSARY_COUNT = data('glossary.json').length + data('combat-rules.json').length;
const WEAPON_COUNT = data('weapons.json').length;
const MASTERY_COUNT = data('masteries.json').length;
const PROPERTY_COUNT = data('properties.json').length;
const EQUIPMENT_COUNT = data('equipment.json').length;
const SEARCH_DOC_COUNT = GLOSSARY_COUNT + WEAPON_COUNT + MASTERY_COUNT + PROPERTY_COUNT + EQUIPMENT_COUNT;

// These checks are about content/links, not responsive layout, so there's no
// value in doubling the run by executing them on both projects.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'route/link checks are viewport-independent');
});

const SAMPLE_ROUTES = [
  { path: '', label: 'home' },
  { path: 'glossary/', label: 'glossary index' },
  { path: 'glossary/grappled-condition/', label: 'glossary detail (grappled)' },
  { path: 'glossary/prone-condition/', label: 'glossary detail (prone)' },
  { path: 'glossary/breaking-objects/', label: 'glossary detail (breaking objects, has tables)' },
  { path: 'weapons/', label: 'weapons index' },
  { path: 'weapons/longsword/', label: 'weapon detail' },
  { path: 'masteries/', label: 'masteries index' },
  { path: 'masteries/topple/', label: 'mastery detail' },
  { path: 'properties/', label: 'properties index' },
  { path: 'properties/finesse/', label: 'property detail' },
  { path: 'equipment/', label: 'equipment index' },
  { path: 'equipment/plate-armor/', label: 'equipment detail (armor, stats only)' },
  { path: 'equipment/oil/', label: 'equipment detail (gear, multi-paragraph body)' },
  { path: 'equipment/ammunition/', label: 'equipment detail (gear, has a table)' },
  { path: 'equipment/thieves-tools/', label: 'equipment detail (tool)' },
  { path: 'equipment/warhorse/', label: 'equipment detail (mount)' },
  { path: 'glossary/mounted-combat/', label: 'glossary detail (mounted combat)' },
  { path: 'glossary/underwater-combat/', label: 'glossary detail (underwater combat)' },
  { path: 'favourites/', label: 'favourites' },
];

for (const { path, label } of SAMPLE_ROUTES) {
  test(`${label} (/${path}) returns 200 with exactly one h1 and a title`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status(), `HTTP status for /${path}`).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page).toHaveTitle(/.+/);
  });
}

test('404 route returns a 404 status and a friendly page with one h1', async ({ page }) => {
  const response = await page.goto('this-page-does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveText('Natural 1');
  await expect(page).toHaveTitle(/.+/);
});

test('glossary index renders every entry', async ({ page }) => {
  await page.goto('glossary/');
  await expect(page.locator('[data-entry]')).toHaveCount(GLOSSARY_COUNT);
});

test('weapons index renders every weapon row', async ({ page }) => {
  await page.goto('weapons/');
  await expect(page.locator('tr[data-weapon]')).toHaveCount(WEAPON_COUNT);
});

test('masteries index renders every mastery section', async ({ page }) => {
  await page.goto('masteries/');
  await expect(page.locator('.def-list .def-item')).toHaveCount(MASTERY_COUNT);
});

test('properties index renders every property section', async ({ page }) => {
  await page.goto('properties/');
  await expect(page.locator('.def-list .def-item')).toHaveCount(PROPERTY_COUNT);
});

test('equipment index renders every item row', async ({ page }) => {
  await page.goto('equipment/');
  await expect(page.locator('tr[data-item]')).toHaveCount(EQUIPMENT_COUNT);
});

test('search-index.json covers every doc and every url resolves', async ({ request }) => {
  const res = await request.get('search-index.json');
  expect(res.status()).toBe(200);
  const docs = (await res.json()) as { id: string; url: string }[];
  expect(docs).toHaveLength(SEARCH_DOC_COUNT);

  const uniqueUrls = [...new Set(docs.map((d) => d.url))];
  expect(uniqueUrls).toHaveLength(SEARCH_DOC_COUNT);

  const results = await Promise.all(
    uniqueUrls.map(async (url) => {
      const r = await request.get(url);
      return { url, status: r.status() };
    }),
  );
  const broken = results.filter((r) => r.status !== 200);
  expect(broken, `broken search-index urls: ${JSON.stringify(broken)}`).toEqual([]);
});

test('every internal link on core index/detail pages resolves to 200', async ({ page, request }) => {
  const pagesToCrawl = [
    '',
    'glossary/',
    'weapons/',
    'masteries/',
    'properties/',
    'equipment/',
    // Sampled detail pages across the different kinds.
    'glossary/grappled-condition/',
    'glossary/prone-condition/',
    'glossary/breaking-objects/',
    'glossary/mounted-combat/',
    'weapons/longsword/',
    'masteries/topple/',
    'equipment/plate-armor/',
    'equipment/ammunition/',
  ];

  const hrefs = new Set<string>();
  for (const path of pagesToCrawl) {
    await page.goto(path);
    const pageHrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    for (const href of pageHrefs) {
      if (href && href.startsWith(BASE)) hrefs.add(href.split('#')[0]);
    }
  }

  expect(hrefs.size).toBeGreaterThan(0);

  const results = await Promise.all(
    [...hrefs].map(async (href) => {
      const r = await request.get(href);
      return { href, status: r.status() };
    }),
  );
  const broken = results.filter((r) => r.status !== 200);
  expect(broken, `broken internal links: ${JSON.stringify(broken)}`).toEqual([]);
});
