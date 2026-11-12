import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_GAMES, appendGame, bestScores, clearHistory, exportHistory, importHistory, makeGameRecord,
  modeSummaries, readHistory, readSettings, saveSettings, summarize, troubleSpots,
} from '../js/history.js';
import { advance, createSession, recordResult } from '../js/session.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    map,
  };
}

// A finished round: codes listed in `missed` were answered wrong once.
function game({ mode = 'capital-choice', codes = ['FR', 'DE', 'IT', 'ES'], missed = [], at = 1000, style = 'standard' }) {
  const questions = codes.map((code) => ({ code }));
  const session = createSession(questions, style);
  for (const question of questions) {
    recordResult(session, !missed.includes(question.code), (q) => q);
    advance(session);
  }
  return makeGameRecord({ modeId: mode, session, questions, startedAt: at - 60000, endedAt: at });
}

test('settings default to 10 standard questions in the system theme, and reject bad values', () => {
  const defaults = { length: 10, style: 'standard', theme: 'system' };
  const storage = fakeStorage();
  assert.deepEqual(readSettings(storage), defaults);
  saveSettings(storage, { length: 50, style: 'repeat', theme: 'dark' });
  assert.deepEqual(readSettings(storage), { length: 50, style: 'repeat', theme: 'dark' });
  storage.setItem('quizly.settings.v1', JSON.stringify({ length: 7, style: 'chaos', theme: 'neon' }));
  assert.deepEqual(readSettings(storage), defaults);
  storage.setItem('quizly.settings.v1', '{not json');
  assert.deepEqual(readSettings(storage), defaults);
});

test('a finished round is saved with its score, misses and time taken', () => {
  const storage = fakeStorage();
  const record = game({ missed: ['DE'], at: 5000 });
  assert.equal(appendGame(storage, record), true);
  const [saved] = readHistory(storage);
  assert.equal(saved.mode, 'capital-choice');
  assert.equal(saved.total, 4);
  assert.equal(saved.firstTry, 3);
  assert.equal(saved.ms, 60000);
  assert.deepEqual(saved.q, ['FR', 'DE', 'IT', 'ES']);
  assert.deepEqual(saved.miss, { DE: 1 });
});

test('corrupt or unknown entries are ignored, and history is capped', () => {
  const storage = fakeStorage({ 'quizly.history.v1': JSON.stringify([{ id: 'x', mode: 'nope' }, null, game({})]) });
  assert.equal(readHistory(storage).length, 1);
  const many = Array.from({ length: MAX_GAMES + 5 }, (_, i) => ({ ...game({ at: i + 1 }), id: `g${i}` }));
  storage.setItem('quizly.history.v1', JSON.stringify(many.slice(0, -1)));
  appendGame(storage, many[many.length - 1]);
  const kept = readHistory(storage);
  assert.equal(kept.length, MAX_GAMES);
  assert.equal(kept[kept.length - 1].id, `g${MAX_GAMES + 4}`, 'the oldest rounds are dropped first');
});

test('a full or blocked storage reports that the round was not saved', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} };
  assert.equal(appendGame(storage, game({})), false);
});

test('best scores are kept per mode and round length, including old saved bests', () => {
  const storage = fakeStorage({ 'quizly.best.v1': JSON.stringify({ 'flag-name': 9, 'capital-choice': 2 }) });
  const history = [game({ missed: ['DE'] }), game({ missed: ['DE', 'IT'] }), game({ codes: Array(10).fill('FR'), missed: [] })];
  const best = bestScores(history, storage);
  assert.equal(best.get('capital-choice|4'), 3);
  assert.equal(best.get('capital-choice|10'), 10);
  assert.equal(best.get('flag-name|10'), 9);
  assert.equal(best.get('flag-name|25'), undefined);
});

test('summary and per-mode stats', () => {
  const history = [
    game({ missed: ['FR', 'DE'], at: Date.UTC(2026, 0, 1, 12) }),
    game({ missed: [], at: Date.UTC(2026, 0, 1, 13) }),
    game({ mode: 'flag-tf', missed: ['IT'], at: Date.UTC(2026, 0, 3, 12) }),
  ];
  const stats = summarize(history);
  assert.equal(stats.rounds, 3);
  assert.equal(stats.questions, 12);
  assert.equal(stats.accuracy, 9 / 12);
  assert.equal(stats.days, 2);
  const modes = modeSummaries(history);
  assert.deepEqual(modes.map((m) => m.modeId), ['flag-tf', 'capital-choice']);
  assert.equal(modes[1].best, 1);
  assert.equal(modes[1].latest, 1);
});

test('trouble spots list what you missed last time, and drop it once you get it right', () => {
  const history = [
    game({ missed: ['FR', 'DE'], at: 1 }),
    game({ missed: ['FR'], at: 2 }),
    game({ mode: 'capital-type', codes: ['DE'], missed: [], at: 3 }),
    game({ mode: 'flag-name', codes: ['DE'], missed: ['DE'], at: 4 }),
  ];
  const spots = troubleSpots(history);
  assert.deepEqual(spots.map((s) => `${s.categoryId}|${s.code}|${s.missed}/${s.seen}`), ['capitals|FR|2/2', 'flags|DE|1/1']);
});

test('a backup round-trips, and importing it twice adds nothing', () => {
  const source = fakeStorage();
  appendGame(source, game({ at: 1 }));
  appendGame(source, game({ at: 2, missed: ['FR'] }));
  const backup = exportHistory(readHistory(source));

  const target = fakeStorage();
  appendGame(target, game({ at: 3 }));
  assert.deepEqual(importHistory(target, backup), { ok: true, added: 2, skipped: 0 });
  assert.deepEqual(readHistory(target).map((g) => g.at), [1, 2, 3]);
  assert.deepEqual(importHistory(target, backup), { ok: true, added: 0, skipped: 2 });
  assert.equal(importHistory(target, 'hello').ok, false);
  assert.equal(importHistory(target, '{"games": 4}').ok, false);
});

test('clearing removes rounds and old best scores but keeps settings', () => {
  const storage = fakeStorage({ 'quizly.best.v1': '{"flag-name":3}' });
  saveSettings(storage, { length: 25, style: 'repeat' });
  appendGame(storage, game({}));
  clearHistory(storage);
  assert.equal(readHistory(storage).length, 0);
  assert.equal(bestScores([], storage).size, 0);
  assert.equal(readSettings(storage).length, 25);
});
