import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ROUND_LENGTH, allModeIds, buildQuestion, buildRound, prepareData } from '../js/game.js';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const data = prepareData({ countries: load('countries'), languages: load('languages'), samples: load('samples') });

function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const optionKey = (option) => option.text ?? option.flag ?? option.sample.text;
const byCode = new Map(data.countries.map((c) => [c.code, c]));
const eligible = (modeId) => (modeId.startsWith('writing-')
  ? data.countries.filter((c) => data.samples[c.sampleKey ?? c.language])
  : data.countries);

test('every mode builds a full round with no repeated country', () => {
  for (const modeId of allModeIds()) {
    for (let seed = 0; seed < 50; seed++) {
      const round = buildRound(modeId, data, seeded(seed));
      assert.equal(round.length, ROUND_LENGTH, modeId);
      assert.equal(new Set(round.map((q) => q.code)).size, ROUND_LENGTH, modeId);
    }
  }
});

test('every mode fills 25 and 50 question rounds with no repeats', () => {
  for (const modeId of allModeIds()) {
    for (const length of [25, 50]) {
      for (let seed = 0; seed < 20; seed++) {
        const round = buildRound(modeId, data, seeded(seed), length);
        assert.equal(round.length, length, `${modeId} ${length}`);
        assert.equal(new Set(round.map((q) => q.code)).size, length, `${modeId} ${length}`);
      }
    }
  }
});

test('every question for every country has a valid answer, in every mode', () => {
  for (const modeId of allModeIds()) {
    for (const country of eligible(modeId)) {
      for (let seed = 0; seed < 8; seed++) {
        const q = buildQuestion(modeId, country, data, seeded(seed * 1000 + country.code.charCodeAt(0)));
        const label = `${modeId} ${country.name} seed ${seed}`;
        assert.ok(q.prompt.text && q.fact && q.answerText, label);
        if (q.kind === 'type') {
          assert.ok(q.accepted.length && q.domain.length, label);
        } else {
          assert.equal(q.options.filter((o) => o.correct).length, 1, label);
          assert.equal(q.options.length, q.kind === 'truefalse' ? 2 : 4, label);
          if (q.kind === 'choice') {
            assert.equal(new Set(q.options.map(optionKey)).size, 4, `${label} has duplicate options`);
          }
        }
      }
    }
  }
});

test('wrong language answers are never defensible', () => {
  for (const country of data.countries) {
    const spoken = new Set([country.language, ...(country.also ?? []), ...(country.accept ?? [])]);
    for (const id of [...spoken]) for (const s of data.languages[id].siblings ?? []) spoken.add(s);
    const names = new Set([...spoken].map((id) => data.languages[id].name));
    for (let seed = 0; seed < 25; seed++) {
      const q = buildQuestion('language-choice', country, data, seeded(seed));
      for (const option of q.options.filter((o) => !o.correct)) {
        assert.ok(!names.has(option.text), `${country.name} offered ${option.text}`);
      }
    }
  }
});

test('true/false never states a false claim as true or a true claim as false', () => {
  for (const country of data.countries) {
    const capitals = [country.capital, ...(country.capitalAliases ?? [])];
    for (let seed = 0; seed < 25; seed++) {
      const q = buildQuestion('capital-tf', country, data, seeded(seed));
      const isTrue = q.options.find((o) => o.correct).id === 'true';
      const named = capitals.some((capital) => q.prompt.text.startsWith(`${capital} is the capital`));
      assert.equal(isTrue, named, q.prompt.text);
    }
  }
});

test('true/false comes up both ways', () => {
  const answers = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const q = buildQuestion('capital-tf', data.countries[0], data, seeded(seed));
    answers.add(q.options.find((o) => o.correct).id);
  }
  assert.deepEqual([...answers].sort(), ['false', 'true']);
});

test('flag questions never pair flags that look identical at emoji size', () => {
  const twins = [['ID', 'MC'], ['RO', 'TD']];
  const flagOf = (code) => byCode.get(code).flag;
  for (const country of data.countries) {
    for (let seed = 0; seed < 25; seed++) {
      const flags = buildQuestion('flag-pick', country, data, seeded(seed)).options.map((o) => o.flag);
      for (const [a, b] of twins) {
        assert.ok(!(flags.includes(flagOf(a)) && flags.includes(flagOf(b))), `${country.name} shows twin flags`);
      }
    }
  }
});

test('language modes vary the languages in a round', () => {
  for (let seed = 0; seed < 100; seed++) {
    const counts = {};
    for (const q of buildRound('language-choice', data, seeded(seed))) {
      const language = byCode.get(q.code).language;
      counts[language] = (counts[language] ?? 0) + 1;
    }
    assert.ok(Math.max(...Object.values(counts)) <= 2);
    const names = buildRound('writing-name', data, seeded(seed)).map((q) => byCode.get(q.code).language);
    assert.equal(new Set(names).size, ROUND_LENGTH);
  }
});

test('Taiwan shows traditional characters and China simplified', () => {
  const shown = (code) => buildQuestion('writing-name', byCode.get(code), data, seeded(1)).prompt.sample.lang;
  assert.equal(shown('TW'), 'zh-Hant');
  assert.equal(shown('CN'), 'zh-Hans');
});

test('names read naturally mid-sentence', () => {
  const prompt = (code) => buildQuestion('capital-type', byCode.get(code), data, seeded(1)).prompt.text;
  assert.equal(prompt('NL'), 'What is the capital of the Netherlands?');
  assert.equal(prompt('DO'), 'What is the capital of the Dominican Republic?');
  assert.equal(prompt('FR'), 'What is the capital of France?');
});
