import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchAnswer, normalize } from '../js/match.js';

const domain = ['Gambia', 'Zambia', 'Iran', 'Iraq', 'Niger', 'Nigeria', 'Austria', 'Australia', 'Slovakia', 'Slovenia', 'Guinea', 'Guyana'];

test('normalize ignores case, accents, punctuation and saint/st', () => {
  assert.equal(normalize('  Bogotá '), 'bogota');
  assert.equal(normalize("N'Djamena"), 'ndjamena');
  assert.equal(normalize("Saint John's"), normalize("St. John's"));
  assert.equal(normalize('Washington, D.C.'), 'washington d c');
  assert.equal(normalize('The Bahamas'), 'bahamas');
  assert.equal(normalize('Chișinău'), 'chisinau');
});

test('exact answers and aliases count', () => {
  assert.equal(matchAnswer('kiev', ['Kyiv', 'Kiev'], ['Kyiv', 'Kiev']), 'exact');
  assert.equal(matchAnswer('BOGOTA', ['Bogotá'], ['Bogotá']), 'exact');
});

test('small typos are forgiven', () => {
  assert.equal(matchAnswer('Gambja', ['Gambia'], domain), 'close');
  assert.equal(matchAnswer('Tegucigalpha', ['Tegucigalpa'], ['Tegucigalpa']), 'close');
});

test('a different real answer is never a typo', () => {
  for (const [typed, answer] of [
    ['Zambia', 'Gambia'], ['Iraq', 'Iran'], ['Niger', 'Nigeria'], ['Nigeria', 'Niger'],
    ['Austria', 'Australia'], ['Slovakia', 'Slovenia'], ['Guinea', 'Guyana'],
  ]) {
    assert.equal(matchAnswer(typed, [answer], domain), 'wrong', `${typed} for ${answer}`);
  }
});

test('a typo closer to another answer does not count', () => {
  assert.equal(matchAnswer('Zambja', ['Gambia'], domain), 'wrong');
});

test('short answers need exact spelling, and junk fails', () => {
  assert.equal(matchAnswer('Lma', ['Lima'], ['Lima']), 'wrong');
  assert.equal(matchAnswer('', ['Lima'], ['Lima']), 'wrong');
  assert.equal(matchAnswer('   ', ['Lima'], ['Lima']), 'wrong');
});
