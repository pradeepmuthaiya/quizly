import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const countries = JSON.parse(readFileSync(new URL('../../data/countries.json', import.meta.url), 'utf8'));

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (error) => { throw error; });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Quizly');
});

async function currentCountry(page) {
  const prompt = await page.locator('.prompt h2').innerText();
  const name = prompt.replace('What is the capital of ', '').replace(/^the /, '').replace(/\?$/, '');
  return countries.find((c) => c.name === name);
}

async function typeCapital(page, right) {
  const country = await currentCountry(page);
  if (right) {
    await page.locator('.type-input').fill(country.capital);
    await page.getByRole('button', { name: 'Check' }).click();
  } else {
    await page.getByRole('button', { name: "I don't know" }).click();
  }
  return country;
}

const next = (page) => page.locator('.feedback .button-primary').click();

const CATEGORY_OF = { capital: 'capitals', flag: 'flags', language: 'languages', writing: 'writing' };

// Opens a game: taps its category first unless that category's list is already showing.
async function openMode(page, mode) {
  const button = page.locator(`[data-mode="${mode}"]`);
  if (!(await button.isVisible())) await page.locator(`[data-category="${CATEGORY_OF[mode.split('-')[0]]}"]`).click();
  await button.click();
}

async function openFromMenu(page, item) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function setSettings(page, ...choices) {
  await openFromMenu(page, 'Settings');
  for (const choice of choices) await page.getByRole('button', { name: choice, exact: true }).click();
  await page.getByRole('button', { name: 'Back' }).click();
}

test('settings are remembered and set the round length', async ({ page }) => {
  await setSettings(page, '25', 'Repeat misses');
  await expect(page.locator('.home-meta')).toHaveText('25 questions · Repeat misses');
  await page.reload();
  await openFromMenu(page, 'Settings');
  await expect(page.getByRole('button', { name: '25', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Repeat misses' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.setting-hint')).toContainText('comes back at the end');

  await page.getByRole('button', { name: 'Standard' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await openMode(page, 'capital-tf');
  for (let i = 1; i <= 25; i++) {
    await expect(page.locator('.question-count')).toHaveText(`Question ${i} of 25`);
    await page.locator('.option').first().click();
    await next(page);
  }
  await expect(page.locator('.results-score')).toContainText('/25');
  await page.getByRole('button', { name: 'Back to Capitals' }).click();
  await expect(page.locator('[data-mode="capital-tf"] .mode-best')).toContainText('/25');
  await page.getByRole('button', { name: 'Back' }).click();
  await setSettings(page, '50');
  await page.locator('[data-category="capitals"]').click();
  await expect(page.locator('.group-note')).toHaveText('50 questions · Standard. Change this in Settings.');
  await expect(page.locator('[data-mode="capital-tf"] .mode-best')).toHaveCount(0);
});

test('repeat mode brings a miss back until it is answered right', async ({ page }) => {
  await setSettings(page, 'Repeat misses');
  await openMode(page, 'capital-type');

  const missed = await typeCapital(page, false);
  await expect(page.locator('.feedback-note')).toHaveText("You'll see this one again at the end.");
  await expect(page.locator('.retry-tag')).toHaveCount(0);
  await next(page);
  for (let i = 2; i <= 10; i++) {
    await expect(page.locator('.question-count')).toHaveText(`Question ${i} of 10`);
    await typeCapital(page, true);
    await expect(page.locator('.feedback-headline')).toHaveText('Correct!');
    await next(page);
  }

  // The miss comes back; missing it again puts it straight back in the queue.
  await expect(page.locator('.question-count')).toContainText('Retry · 1 left');
  await expect(page.locator('.retry-tag')).toHaveText('Missed 1×');
  expect((await currentCountry(page)).code).toBe(missed.code);
  await typeCapital(page, false);
  await expect(page.locator('.feedback-note')).toHaveText('Have another go.');
  await expect(page.locator('.retry-tag')).toHaveText('Missed 1×');
  await expect(page.locator('.feedback .button-primary')).toHaveText('Next');
  await next(page);
  await expect(page.locator('.retry-tag')).toHaveText('Missed 2×');
  await typeCapital(page, true);
  await expect(page.locator('.feedback .button-primary')).toHaveText('See results');
  await next(page);

  await expect(page.locator('.results-score strong')).toHaveText('9');
  await expect(page.locator('.results-sub')).toHaveText('right first time');
  await expect(page.locator('.results-detail')).toHaveText('Cleared all 10 in 12 answers.');
  await expect(page.locator('.review-item')).toHaveCount(1);
  await expect(page.locator('.review-misses')).toHaveText('Missed 2×');
});

test('progress shows saved rounds, a chart per game and what to study', async ({ page }) => {
  await openFromMenu(page, 'Progress');
  await expect(page.locator('.empty-title')).toHaveText('No rounds yet');
  await page.getByRole('button', { name: 'Pick a game' }).click();

  const misses = [];
  for (let roundNumber = 0; roundNumber < 2; roundNumber++) {
    await openMode(page, 'capital-type');
    for (let i = 0; i < 10; i++) {
      const country = await typeCapital(page, i >= 3 + roundNumber * 3);
      if (i < 3 + roundNumber * 3) misses.push(country);
      await next(page);
    }
    await page.getByRole('button', { name: roundNumber === 0 ? 'Back to Capitals' : 'See your progress' }).click();
  }

  await expect(page.locator('.stat-value').nth(0)).toHaveText('2');
  await expect(page.locator('.stat-value').nth(1)).toHaveText('20');
  await expect(page.locator('.stat-value').nth(2)).toHaveText('55%');
  await expect(page.locator('.list-button')).toHaveCount(1);
  await expect(page.locator('.list-button .row-score')).toHaveText('40%');
  const lastMissed = misses.slice(3).map((c) => c.name);
  const spotNames = await page.locator('.spot .row-title').allInnerTexts();
  for (const name of lastMissed) expect(spotNames).toContain(name);
  await expect(page.locator('.spot .row-sub').first()).toContainText('Capital: ');

  await page.locator('.list-button').click();
  await expect(page.locator('.nav-title')).toHaveText('Capitals · Type it');
  await expect(page.locator('.stat-note')).toHaveText('−30 pts vs your first round');
  await expect(page.locator('.chart-dot')).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.chart-readout strong')).toHaveText('40%');
  await page.locator('.chart-svg').click({ position: { x: 50, y: 60 } });
  await expect(page.locator('.chart-readout strong')).toHaveText('70%');
  await expect(page.locator('.chart-readout span')).toContainText('7/10 · Standard');
  await expect(page.locator('.round-row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('[data-category="capitals"]').click();
  await expect(page.locator('[data-mode="capital-type"] .mode-best')).toHaveText('7/10');
});

test('progress can be backed up, restored and deleted', async ({ page }) => {
  await openMode(page, 'flag-tf');
  for (let i = 0; i < 10; i++) {
    await page.locator('.option').first().click();
    await next(page);
  }
  await page.getByRole('button', { name: 'See your progress' }).click();

  // On iPhone, Export opens the share sheet (Save to Files, AirDrop...). Stand in for it.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      value: async ({ files }) => { window.sharedFile = { name: files[0].name, text: await files[0].text() }; },
    });
  });
  await page.getByRole('button', { name: 'Export' }).click();
  const shared = await page.waitForFunction(() => window.sharedFile).then((handle) => handle.jsonValue());
  expect(shared.name).toMatch(/^quizly-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = shared.text;
  expect(JSON.parse(backup).games).toHaveLength(1);

  // Where files can't be shared, it downloads instead.
  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: () => false }));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).games).toEqual(JSON.parse(backup).games);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete all progress' }).click();
  await expect(page.locator('.notice')).toHaveText('All progress deleted.');
  await expect(page.locator('.empty-title')).toBeVisible();

  const file = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) };
  await page.locator('.import-input').setInputFiles(file);
  await expect(page.locator('.notice')).toHaveText('Added 1 round from the backup.');
  await expect(page.locator('.stat-value').first()).toHaveText('1');
  await page.locator('.import-input').setInputFiles(file);
  await expect(page.locator('.notice')).toHaveText('Nothing new in that backup: those rounds are already here.');
  await page.locator('.import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.locator('.notice')).toHaveText("That file isn't a Quizly backup.");
});

test('quitting partway asks first, and a quit round is not saved', async ({ page }) => {
  await openMode(page, 'capital-choice');
  await page.locator('.option').first().click();
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Quit round' }).click();
  await expect(page.locator('.feedback')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Quit round' }).click();
  await expect(page.locator('.nav-title')).toHaveText('Capitals');
  await page.getByRole('button', { name: 'Back' }).click();
  await openFromMenu(page, 'Progress');
  await expect(page.locator('.empty-title')).toHaveText('No rounds yet');
});

test('the menu opens and closes, and the theme setting sticks', async ({ page }) => {
  const menuButton = page.getByRole('button', { name: 'Menu' });
  await menuButton.click();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menuitem')).toHaveText(['Settings', 'Progress']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(menuButton).toHaveAttribute('aria-expanded', 'false');

  const theme = () => page.evaluate(() => document.documentElement.dataset.theme ?? 'system');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await setSettings(page, 'Dark');
  expect(await theme()).toBe('dark');
  expect(await background()).toBe('rgb(0, 0, 0)');
  await page.reload();
  expect(await theme()).toBe('dark');
  await setSettings(page, 'Light');
  expect(await background()).toBe('rgb(242, 242, 247)');
  await setSettings(page, 'System');
  expect(await theme()).toBe('system');
});
