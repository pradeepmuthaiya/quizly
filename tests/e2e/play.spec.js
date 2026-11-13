import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const load = (name) => JSON.parse(readFileSync(new URL(`../../data/${name}.json`, import.meta.url), 'utf8'));
const countries = load('countries');

const CATEGORY_OF = { capital: 'capitals', flag: 'flags', language: 'languages', writing: 'writing' };

// Starts a game from the home screen, choosing it in Settings first if its category
// is set to a different game mode.
async function openMode(page, mode) {
  const category = CATEGORY_OF[mode.split('-')[0]];
  const row = page.locator(`.category-row[data-category="${category}"]`);
  if ((await row.getAttribute('data-mode')) !== mode) {
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await page.locator(`[data-action="pick-mode"][data-category="${category}"]`).click();
    await page.locator(`[data-action="set-mode"][data-mode="${mode}"]`).click();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
  }
  await row.click();
}
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
    await openMode(page, `${mode}`);
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
  await openMode(page, 'capital-type');
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
  await expect(page.locator('.category-row[data-mode="capital-type"] .mode-best')).toHaveText('10/10');
});

test('missed questions appear in the review with the right answer', async ({ page }) => {
  await openMode(page, 'flag-type');
  for (let i = 0; i < 10; i++) {
    await page.getByRole('button', { name: "I don't know" }).click();
    await page.locator('.feedback .button-primary').click();
  }
  await expect(page.locator('.results-score strong')).toHaveText('0');
  await expect(page.locator('.review-item')).toHaveCount(10);
  await expect(page.locator('.results-best')).toHaveCount(0);
});

test('quitting returns home and an empty answer is not submitted', async ({ page }) => {
  await openMode(page, 'language-type');
  await page.locator('.type-input').press('Enter');
  await expect(page.locator('.feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quit round' }).click();
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

test('game modes are chosen per category in Settings, and home starts the chosen one', async ({ page }) => {
  await expect(page.locator('.category-row .row-title')).toHaveText(['Capitals', 'Flags', 'Languages', 'Writing']);
  await expect(page.locator('.category-row .row-sub')).toHaveText(['Multiple choice', 'Name the flag', 'Multiple choice', 'Find the writing']);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.locator('.mode-option')).toHaveCount(0);
  await page.locator('[data-action="pick-mode"][data-category="flags"]').click();
  await expect(page.locator('.nav-title')).toHaveText('Flags');
  await expect(page.locator('.mode-option .row-title')).toHaveText(['Name the flag', 'Find the flag', 'True or false', 'Type it']);
  await expect(page.locator('.mode-option[aria-pressed="true"] .row-title')).toHaveText('Name the flag');
  await page.locator('.mode-option[data-mode="flag-tf"]').click();
  await expect(page.locator('.mode-option[aria-pressed="true"] .row-title')).toHaveText('True or false');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('[data-action="pick-mode"][data-category="flags"] .row-value')).toHaveText('True or false');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.category-row[data-category="flags"] .row-sub')).toHaveText('True or false');
  await page.reload();
  await page.locator('.category-row[data-category="flags"]').click();
  await expect(page.locator('.quiz-title')).toHaveText('Flags · True or false');
});
