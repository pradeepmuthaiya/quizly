import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
const countries = load('countries');
const MODES = [
  'capital-choice', 'capital-tf', 'capital-type',
  'flag-name', 'flag-pick', 'flag-tf', 'flag-type',
  'language-choice', 'language-tf', 'language-type',
  'writing-pick', 'writing-name', 'writing-tf',
];

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Quizly');
});

async function assertFitsScreen(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const mode of MODES) {
  test(`plays a full round of ${mode}`, async ({ page }) => {
    await page.locator(`[data-mode="${mode}"]`).click();
    for (let i = 1; i <= 10; i++) {
      await expect(page.locator('.question-count')).toHaveText(`Question ${i} of 10`);
      await assertFitsScreen(page);
      if (mode.endsWith('-type')) {
        await page.locator('.type-input').fill('Atlantis');
        await page.getByRole('button', { name: 'Check' }).click();
        await expect(page.locator('.feedback-headline')).toHaveText('Not quite.');
      } else {
        await page.locator('.option').first().click();
        await expect(page.locator('.option.is-correct')).toHaveCount(1);
        await expect(page.locator('.option:disabled').first()).toBeDisabled();
      }
      await assertFitsScreen(page);
      await page.locator('.feedback .button-primary').click();
    }
    await expect(page.locator('.results-score')).toContainText('/10');
    await assertFitsScreen(page);
  });
}

test('typing every right capital scores 10/10 and saves the best score', async ({ page }) => {
  await page.locator('[data-mode="capital-type"]').click();
  for (let i = 0; i < 10; i++) {
    const prompt = await page.locator('.prompt h2').innerText();
    const name = prompt.replace('What is the capital of ', '').replace(/^the /, '').replace(/\?$/, '');
    const country = countries.find((c) => c.name === name);
    await page.locator('.type-input').fill(country.capital.toUpperCase());
    await page.locator('.type-input').press('Enter');
    await expect(page.locator('.feedback-headline')).toHaveText('Correct!');
    await page.locator('.feedback .button-primary').click();
  }
  await expect(page.locator('.results-score strong')).toHaveText('10');
  await expect(page.locator('.results-best')).toBeVisible();
  await expect(page.locator('.review')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-mode="capital-type"] .mode-best')).toHaveText('10/10');
});

test('missed questions appear in the review with the right answer', async ({ page }) => {
  await page.locator('[data-mode="flag-type"]').click();
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: "I don't know" }).click();
    await page.locator('.feedback .button-primary').click();
  }
  await expect(page.locator('.results-score strong')).toHaveText('0');
  await expect(page.locator('.review-item')).toHaveCount(10);
  await expect(page.locator('.results-best')).toHaveCount(0);
});

test('quitting returns home and an empty answer is not submitted', async ({ page }) => {
  await page.locator('[data-mode="language-type"]').click();
  await page.locator('.type-input').press('Enter');
  await expect(page.locator('.feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quit to home' }).click();
  await expect(page.locator('h1')).toHaveText('Quizly');
});

test('installs as a home screen app', async ({ page, request }) => {
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/icon-180.png');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok()).toBe(true);
  }
});
