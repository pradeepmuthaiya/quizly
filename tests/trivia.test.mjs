import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CATEGORIES, buildQuestion, buildRound, prepareData, subjectsFor } from '../js/game.js';
import { matchAnswer, normalize } from '../js/match.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const trivia = load('trivia');
const data = prepareData({ countries: load('countries'), languages: load('languages'), samples: load('samples'), trivia });
const triviaCategories = CATEGORIES.filter((category) => category.trivia);

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('every trivia category has a full question bank', () => {
  assert.deepEqual(Object.keys(trivia).sort(), triviaCategories.map((c) => c.id).sort());
  for (const category of triviaCategories) {
    const items = trivia[category.id];
    assert.ok(items.length >= 55, `${category.id} has ${items.length}`);
    assert.ok(items.filter((item) => item.type !== false).length >= 50, `${category.id} type pool`);
  }
});

test('questions are well formed, with ids that never repeat', () => {
  const all = Object.values(trivia).flat();
  assert.equal(new Set(all.map((item) => item.id)).size, all.length);
  assert.equal(new Set(all.map((item) => item.q)).size, all.length, 'duplicate question text');
  for (const item of all) {
    assert.match(item.id, /^(sp|hi|re|po)\d{2,}$/);
    assert.ok(item.q.endsWith('?'), item.q);
    assert.ok(item.a.trim(), item.id);
    assert.equal(item.wrong.length, 3, item.q);
    const right = new Set([item.a, ...(item.accept ?? [])].map(normalize));
    const wrong = item.wrong.map(normalize);
    assert.equal(new Set(wrong).size, 3, `${item.q}: repeated wrong answer`);
    for (const answer of wrong) assert.ok(!right.has(answer), `${item.q}: "${answer}" is listed as right and wrong`);
  }
});

test('typing any accepted spelling counts, and typing a wrong option never does', () => {
  for (const category of triviaCategories) {
    const typeMode = category.modes.find((mode) => mode.id.endsWith('-type')).id;
    for (const item of subjectsFor(typeMode, data)) {
      const q = buildQuestion(typeMode, item, data, seeded(1));
      for (const spelling of q.accepted) {
        assert.equal(matchAnswer(spelling, q.accepted, q.domain), 'exact', `${item.q}: "${spelling}"`);
      }
      for (const wrong of item.wrong) {
        assert.equal(matchAnswer(wrong, q.accepted, q.domain), 'wrong', `${item.q}: "${wrong}" was accepted`);
      }
    }
  }
});

test('trivia questions build in every mode, with one right option', () => {
  for (const category of triviaCategories) {
    for (const mode of category.modes) {
      for (const item of subjectsFor(mode.id, data)) {
        for (let seed = 0; seed < 6; seed++) {
          const q = buildQuestion(mode.id, item, data, seeded(seed));
          assert.equal(q.code, item.id);
          if (q.kind === 'type') continue;
          assert.equal(q.options.filter((o) => o.correct).length, 1, item.q);
          if (q.kind === 'choice') {
            assert.equal(new Set(q.options.map((o) => o.text)).size, 4, item.q);
            assert.equal(q.options.find((o) => o.correct).text, item.a);
          } else {
            const isTrue = q.options.find((o) => o.correct).id === 'true';
            assert.equal(isTrue, q.prompt.claim === item.a, `${item.q}: claim ${q.prompt.claim}`);
            if (!isTrue) assert.ok(item.wrong.includes(q.prompt.claim));
          }
        }
      }
    }
  }
});

test('trivia rounds of 50 never repeat a question', () => {
  for (const category of triviaCategories) {
    for (const mode of category.modes) {
      const round = buildRound(mode.id, data, seeded(3), 50);
      assert.equal(round.length, 50, mode.id);
      assert.equal(new Set(round.map((q) => q.code)).size, 50, mode.id);
    }
  }
});

test('questions marked not typeable stay out of type rounds', () => {
  const marathon = trivia.sports.find((item) => item.type === false);
  assert.ok(marathon);
  assert.ok(!subjectsFor('sports-type', data).includes(marathon));
  assert.ok(subjectsFor('sports-choice', data).includes(marathon));
});
