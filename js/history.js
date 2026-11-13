// Settings and the log of finished rounds, kept in localStorage on this device.
// Everything takes the storage object as an argument so tests can pass a fake.
import { CATEGORIES, findMode } from './game.js';
import { STYLES } from './session.js';

export const LENGTHS = [10, 25, 50];
export const THEMES = ['system', 'light', 'dark'];
// The game mode played for each category: the first one listed until you pick another.
const DEFAULT_MODES = Object.fromEntries(CATEGORIES.map((category) => [category.id, category.modes[0].id]));
export const DEFAULT_SETTINGS = { length: 10, style: 'standard', theme: 'system', modes: DEFAULT_MODES };
export const MAX_GAMES = 2000;

const SETTINGS_KEY = 'quizly.settings.v1';
const HISTORY_KEY = 'quizly.history.v1';
const LEGACY_BEST_KEY = 'quizly.best.v1'; // best scores saved before the history existed: 10-question rounds

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // full, or blocked in private browsing
  }
}

// Settings -----------------------------------------------------------------

export function readSettings(storage) {
  const saved = readJson(storage, SETTINGS_KEY, {});
  return {
    length: LENGTHS.includes(saved.length) ? saved.length : DEFAULT_SETTINGS.length,
    style: STYLES.includes(saved.style) ? saved.style : DEFAULT_SETTINGS.style,
    theme: THEMES.includes(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    modes: Object.fromEntries(CATEGORIES.map((category) => {
      const chosen = saved.modes?.[category.id];
      const valid = category.modes.some((mode) => mode.id === chosen);
      return [category.id, valid ? chosen : DEFAULT_MODES[category.id]];
    })),
  };
}

export const saveSettings = (storage, settings) => writeJson(storage, SETTINGS_KEY, settings);

// History ------------------------------------------------------------------

const isCount = (value) => Number.isInteger(value) && value >= 0;

export function isValidGame(game) {
  return Boolean(game)
    && typeof game.id === 'string'
    && Number.isFinite(game.at)
    && findMode(game.mode) !== null
    && STYLES.includes(game.style)
    && isCount(game.total) && game.total > 0
    && isCount(game.firstTry) && game.firstTry <= game.total
    && Array.isArray(game.q) && game.q.every((code) => typeof code === 'string')
    && game.miss !== null && typeof game.miss === 'object'
    && Object.values(game.miss).every((count) => isCount(count) && count > 0);
}

export function readHistory(storage) {
  const games = readJson(storage, HISTORY_KEY, []);
  return Array.isArray(games) ? games.filter(isValidGame).sort((a, b) => a.at - b.at) : [];
}

const newId = (at) => `${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function makeGameRecord({ modeId, session, questions, startedAt, endedAt }) {
  return {
    id: newId(endedAt),
    at: endedAt,
    mode: modeId,
    style: session.style,
    total: session.total,
    firstTry: session.firstTry,
    answers: session.answers,
    ms: Math.max(0, endedAt - startedAt),
    q: questions.map((question) => question.code),
    miss: Object.fromEntries(session.misses),
  };
}

function writeHistory(storage, games) {
  return writeJson(storage, HISTORY_KEY, games.slice(-MAX_GAMES));
}

export function appendGame(storage, game) {
  return writeHistory(storage, [...readHistory(storage), game]);
}

export function clearHistory(storage) {
  try {
    storage.removeItem(HISTORY_KEY);
    storage.removeItem(LEGACY_BEST_KEY);
  } catch {
    // nothing to clear
  }
}

// Best first-try score for each mode at each round length, as "mode|length".
export function bestScores(history, storage) {
  const best = new Map();
  const legacy = readJson(storage, LEGACY_BEST_KEY, {});
  for (const [mode, score] of Object.entries(legacy)) {
    if (isCount(score) && score <= 10) best.set(`${mode}|10`, score);
  }
  for (const game of history) {
    const key = `${game.mode}|${game.total}`;
    if (game.firstTry > (best.get(key) ?? -1)) best.set(key, game.firstTry);
  }
  return best;
}

// Backup -------------------------------------------------------------------

export function exportHistory(history, now = Date.now()) {
  return JSON.stringify({ app: 'quizly', version: 1, exportedAt: now, games: history });
}

// Adds the games from a backup file; games already here are kept, not duplicated.
export function importHistory(storage, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't a Quizly backup." };
  }
  const incoming = Array.isArray(parsed) ? parsed : parsed?.games;
  if (!Array.isArray(incoming)) return { ok: false, error: "That file isn't a Quizly backup." };
  const valid = incoming.filter(isValidGame);
  const current = readHistory(storage);
  const known = new Set(current.map((game) => game.id));
  const added = valid.filter((game) => !known.has(game.id) && known.add(game.id));
  const merged = [...current, ...added].sort((a, b) => a.at - b.at);
  if (added.length && !writeHistory(storage, merged)) {
    return { ok: false, error: "There isn't enough room on this device to save the backup." };
  }
  return { ok: true, added: added.length, skipped: incoming.length - added.length };
}

// Stats --------------------------------------------------------------------

export const share = (game) => game.firstTry / game.total;

const dayKey = (at) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

export function summarize(history) {
  const questions = history.reduce((sum, game) => sum + game.total, 0);
  const right = history.reduce((sum, game) => sum + game.firstTry, 0);
  const recent = history.slice(-10);
  const recentQuestions = recent.reduce((sum, game) => sum + game.total, 0);
  return {
    rounds: history.length,
    questions,
    accuracy: questions ? right / questions : 0,
    recentAccuracy: recentQuestions ? recent.reduce((sum, game) => sum + game.firstTry, 0) / recentQuestions : 0,
    days: new Set(history.map((game) => dayKey(game.at))).size,
  };
}

// Played modes, most recently played first.
export function modeSummaries(history) {
  const byMode = new Map();
  for (const game of history) {
    if (!byMode.has(game.mode)) byMode.set(game.mode, []);
    byMode.get(game.mode).push(game);
  }
  return [...byMode.entries()]
    .map(([modeId, games]) => ({
      modeId,
      games,
      best: Math.max(...games.map(share)),
      latest: share(games[games.length - 1]),
      lastPlayed: games[games.length - 1].at,
    }))
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
}

// Countries whose latest appearance in a category was a miss: what to study.
// A country drops off the list as soon as you get it right first time.
export function troubleSpots(history, limit = 12) {
  const spots = new Map();
  for (const game of history) {
    const categoryId = findMode(game.mode).category.id;
    for (const code of game.q) {
      const key = `${categoryId}|${code}`;
      const spot = spots.get(key) ?? { categoryId, code, seen: 0, missed: 0, lastMissed: false, lastAt: 0 };
      const missed = (game.miss[code] ?? 0) > 0;
      spot.seen += 1;
      spot.missed += missed ? 1 : 0;
      spot.lastMissed = missed;
      spot.lastAt = game.at;
      spots.set(key, spot);
    }
  }
  return [...spots.values()]
    .filter((spot) => spot.lastMissed)
    .sort((a, b) => b.missed - a.missed || b.missed / b.seen - a.missed / a.seen || b.lastAt - a.lastAt)
    .slice(0, limit);
}
