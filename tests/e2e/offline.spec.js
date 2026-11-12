import { expect, test } from '@playwright/test';

test('works with no network after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Worldly');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Worldly');

  await page.locator('[data-mode="writing-name"]').click();
  await page.locator('.option').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
});

test('every precached file exists', async ({ page, request }) => {
  const source = await (await request.get('/sw.js')).text();
  const assets = JSON.parse(source.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  expect(assets.length).toBeGreaterThan(5);
  for (const asset of assets) {
    expect((await request.get(`/${asset}`)).ok(), asset).toBe(true);
  }
});

test.describe('served from a subfolder, as GitHub Pages does', () => {
  test.use({ baseURL: process.env.SUBFOLDER_URL });
  test.skip(!process.env.SUBFOLDER_URL, 'set SUBFOLDER_URL to run');

  test('loads, plays, and works offline', async ({ page, context }) => {
    await page.goto('');
    await expect(page.locator('h1')).toHaveText('Worldly');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-mode="flag-pick"]').click();
    await page.locator('.option').first().click();
    await expect(page.locator('.feedback')).toBeVisible();
  });
});
