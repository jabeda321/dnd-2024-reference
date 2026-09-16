import { expect, test } from '@playwright/test';

const BASE = '/dnd-2024-reference/';

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

test('glossary index renders all 155 entries', async ({ page }) => {
  await page.goto('glossary/');
  await expect(page.locator('[data-entry]')).toHaveCount(155);
});

test('weapons index renders all 38 weapon rows', async ({ page }) => {
  await page.goto('weapons/');
  await expect(page.locator('tr[data-weapon]')).toHaveCount(38);
});

test('masteries index renders all 8 mastery sections', async ({ page }) => {
  await page.goto('masteries/');
  await expect(page.locator('.def-list .def-item')).toHaveCount(8);
});

test('properties index renders all 10 property sections', async ({ page }) => {
  await page.goto('properties/');
  await expect(page.locator('.def-list .def-item')).toHaveCount(10);
});

test('search-index.json has 211 docs and every url resolves', async ({ request }) => {
  const res = await request.get('search-index.json');
  expect(res.status()).toBe(200);
  const docs = (await res.json()) as { id: string; url: string }[];
  expect(docs).toHaveLength(211);

  const uniqueUrls = [...new Set(docs.map((d) => d.url))];
  expect(uniqueUrls).toHaveLength(211);

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
    // 5 sampled detail pages across the different kinds.
    'glossary/grappled-condition/',
    'glossary/prone-condition/',
    'glossary/breaking-objects/',
    'weapons/longsword/',
    'masteries/topple/',
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
