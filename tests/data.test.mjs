import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const load = (name) => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const countries = load('countries');
const languages = load('languages');
const samples = load('samples');

test('every country is complete and unique', () => {
  assert.equal(countries.length, 197);
  assert.equal(new Set(countries.map((c) => c.code)).size, countries.length);
  assert.equal(new Set(countries.map((c) => c.name)).size, countries.length);
  for (const c of countries) {
    assert.match(c.code, /^[A-Z]{2}$/);
    assert.ok(c.capital, c.name);
    assert.ok(['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'].includes(c.region), c.name);
  }
});

test('every language reference resolves', () => {
  for (const c of countries) {
    for (const id of [c.language, ...(c.also ?? []), ...(c.accept ?? [])]) {
      assert.ok(languages[id], `${c.name}: ${id}`);
    }
    assert.ok(!(c.also ?? []).includes(c.language), `${c.name} lists its primary language as also`);
    if (c.sampleKey) assert.ok(samples[c.sampleKey], c.name);
  }
  for (const [id, language] of Object.entries(languages)) {
    for (const sibling of language.siblings ?? []) assert.ok(languages[sibling], `${id}: ${sibling}`);
  }
});

test('samples are tagged, short, and never name their own language', () => {
  for (const [id, sample] of Object.entries(samples)) {
    assert.ok(sample.lang && sample.script, id);
    assert.ok(sample.text.length >= 20 && sample.text.length <= 95, `${id}: ${sample.text.length}`);
    if (languages[id]) {
      assert.ok(!sample.text.toLowerCase().includes(languages[id].name.toLowerCase()), id);
    }
  }
});

test('the 2026 Equatorial Guinea capital move is reflected, with Malabo still accepted', () => {
  const guinea = countries.find((c) => c.code === 'GQ');
  assert.equal(guinea.capital, 'Ciudad de la Paz');
  assert.ok(guinea.capitalAliases.includes('Malabo'));
});
