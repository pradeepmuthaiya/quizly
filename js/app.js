// The interface: renders the home, quiz, results and progress screens.
import { attachLineChart, lineChartHtml, sparklineHtml } from './chart.js';
import { CATEGORIES, buildQuestion, buildRound, findMode, prepareData } from './game.js';
import {
  LENGTHS, appendGame, bestScores, clearHistory, exportHistory, importHistory, makeGameRecord,
  modeSummaries, readHistory, readSettings, saveSettings, share, summarize, troubleSpots,
} from './history.js';
import { matchAnswer } from './match.js';
import {
  advance, createSession, currentItem, firstPass, isLastItem, recordResult, remaining,
} from './session.js';

const root = document.getElementById('app');

// localStorage can throw when it's blocked; fall back to memory so the game still plays.
const storage = (() => {
  try {
    const store = window.localStorage;
    store.getItem('quizly.probe');
    return store;
  } catch {
    const memory = new Map();
    return {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
      removeItem: (key) => memory.delete(key),
    };
  }
})();

let data = null;
let byCode = new Map();
let settings = readSettings(storage);
let round = null;
let view = { name: 'home' };
let notice = ''; // a one-off message on the progress screen

const STYLE_LABELS = { standard: 'Standard', repeat: 'Repeat misses' };
const STYLE_HINTS = {
  standard: 'Each question is asked once.',
  repeat: "Miss one and it comes back at the end. The round ends when you've got them all right.",
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

const percent = (value) => `${Math.round(value * 100)}%`;
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const formatDate = (at) => dateFormat.format(new Date(at));
const formatDateTime = (at) => `${formatDate(at)}, ${timeFormat.format(new Date(at))}`;
const formatDuration = (ms) => {
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
};
const modeLabel = (modeId) => {
  const { category, mode } = findMode(modeId);
  return `${category.title} · ${mode.title}`;
};

function show(html) {
  root.innerHTML = html;
  window.scrollTo(0, 0);
}

// Shared pieces ------------------------------------------------------------

const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  progress: '<path d="M4 20h16"/><path d="M5 15l4-4 4 3 6-7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  capitals: '<path d="M3 21h18M5 21V10M19 21V10M9.7 21v-7M14.3 21v-7M12 3l9 5H3z"/>',
  flags: '<path d="M5 21V4M5 4h12l-2.5 4.5L17 13H5"/>',
  languages: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
  writing: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};
const icon = (name, className = 'icon') => `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function navBar(title, back) {
  return `
    <div class="nav-bar">
      <button class="icon-button back-button" data-action="${back}" aria-label="Back">${icon('back')}</button>
      <h1 class="nav-title">${escapeHtml(title)}</h1>
      <span></span>
    </div>`;
}

// Theme ----------------------------------------------------------------------

const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const BAR_COLORS = { light: '#f2f2f7', dark: '#000000' };

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'light' || theme === 'dark') html.dataset.theme = theme;
  else delete html.dataset.theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = BAR_COLORS[theme === 'system' ? scheme : theme];
  }
}

// Home -----------------------------------------------------------------------

function renderHome() {
  round = null;
  view = { name: 'home' };
  const best = bestScores(readHistory(storage), storage);
  const { length } = settings;
  const categories = CATEGORIES.map((category) => {
    const modeId = settings.modes[category.id];
    const { mode } = findMode(modeId);
    const score = best.get(`${modeId}|${length}`);
    return `
    <button class="row category-row" data-action="start" data-category="${category.id}" data-mode="${modeId}">
      <span class="row-icon" aria-hidden="true">${icon(category.id)}</span>
      <span class="row-main">
        <span class="row-title">${escapeHtml(category.title)}</span>
        <span class="row-sub">${escapeHtml(mode.title)}</span>
      </span>
      ${score === undefined ? '' : `<span class="row-value mode-best" aria-label="Best score ${score} of ${length}">${score}/${length}</span>`}
      ${icon('chevron', 'icon chevron')}
    </button>`;
  }).join('');

  show(`
    <header class="app-bar">
      <h1>Quizly</h1>
      <button class="icon-button menu-button" data-action="menu" aria-label="Menu" aria-haspopup="menu" aria-expanded="false">${icon('menu')}</button>
    </header>
    <p class="home-meta">${length} questions · ${escapeHtml(STYLE_LABELS[settings.style])}</p>
    <section class="group">
      <div class="card">${categories}</div>
      <p class="group-note">Change the game mode for each category in Settings.</p>
    </section>
    <div class="menu-layer" hidden>
      <div class="menu-backdrop" data-action="close-menu"></div>
      <div class="menu" role="menu" aria-label="Menu">
        <button class="menu-item" role="menuitem" data-action="settings">${icon('settings')}Settings</button>
        <button class="menu-item" role="menuitem" data-action="progress">${icon('progress')}Progress</button>
      </div>
    </div>`);
}

function setMenuOpen(open) {
  const layer = root.querySelector('.menu-layer');
  if (!layer) return;
  layer.hidden = !open;
  const button = root.querySelector('.menu-button');
  button.setAttribute('aria-expanded', String(open));
  if (open) layer.querySelector('.menu-item').focus();
  else button.focus();
}

// Settings -------------------------------------------------------------------

function segmentedRow(action, label, options, selected) {
  return `
    <div class="row setting-row">
      <span class="row-title" id="${action}-label">${escapeHtml(label)}</span>
      <div class="segmented" role="group" aria-labelledby="${action}-label">
        ${options.map(([value, text]) => `
          <button class="segment" data-action="${action}" data-value="${value}" aria-pressed="${String(value) === String(selected)}">${escapeHtml(text)}</button>`).join('')}
      </div>
    </div>`;
}

function renderSettings() {
  view = { name: 'settings' };
  const modeRows = CATEGORIES.map((category) => `
    <button class="row category-row" data-action="pick-mode" data-category="${category.id}">
      <span class="row-icon" aria-hidden="true">${icon(category.id)}</span>
      <span class="row-main"><span class="row-title">${escapeHtml(category.title)}</span></span>
      <span class="row-value">${escapeHtml(findMode(settings.modes[category.id]).mode.title)}</span>
      ${icon('chevron', 'icon chevron')}
    </button>`).join('');
  show(`
    ${navBar('Settings', 'home')}
    <section class="group">
      <h2 class="group-label">Game mode</h2>
      <div class="card">${modeRows}</div>
    </section>
    <section class="group">
      <h2 class="group-label">Rounds</h2>
      <div class="card">
        ${segmentedRow('set-length', 'Questions', LENGTHS.map((value) => [value, value]), settings.length)}
        ${segmentedRow('set-style', 'Round style', Object.entries(STYLE_LABELS), settings.style)}
      </div>
      <p class="group-note setting-hint">${escapeHtml(STYLE_HINTS[settings.style])}</p>
    </section>
    <section class="group">
      <h2 class="group-label">Appearance</h2>
      <div class="card">
        ${segmentedRow('set-theme', 'Theme', Object.entries(THEME_LABELS), settings.theme)}
      </div>
      <p class="group-note">System follows your phone's light or dark setting.</p>
    </section>`);
}

// The game modes for one category; the checked one is what that category plays.
function renderModePicker(categoryId) {
  const category = CATEGORIES.find((candidate) => candidate.id === categoryId);
  if (!category) {
    renderSettings();
    return;
  }
  view = { name: 'mode-picker', categoryId };
  const best = bestScores(readHistory(storage), storage);
  const { length } = settings;
  const rows = category.modes.map((mode) => {
    const selected = settings.modes[category.id] === mode.id;
    const score = best.get(`${mode.id}|${length}`);
    return `
      <button class="row mode-option" data-action="set-mode" data-category="${category.id}" data-mode="${mode.id}" aria-pressed="${selected}">
        <span class="row-main">
          <span class="row-title">${escapeHtml(mode.title)}</span>
          <span class="row-sub">${escapeHtml(mode.hint)}${score === undefined ? '' : ` · best ${score}/${length}`}</span>
        </span>
        ${selected ? icon('check', 'icon check') : '<span class="check-space"></span>'}
      </button>`;
  }).join('');
  show(`
    ${navBar(category.title, 'settings')}
    <section class="group">
      <h2 class="group-label">Game mode</h2>
      <div class="card">${rows}</div>
      <p class="group-note">Tapping ${escapeHtml(category.title)} on the home screen starts this game.</p>
    </section>`);
}

function updateSettings(change) {
  settings = { ...settings, ...change };
  saveSettings(storage, settings);
  if (change.theme) applyTheme(settings.theme);
  const scrollY = window.scrollY;
  const action = Object.keys(change)[0];
  if (view.name === 'mode-picker') renderModePicker(view.categoryId);
  else renderSettings();
  window.scrollTo(0, scrollY);
  // Keep keyboard focus on the control that was just used.
  const focusAction = action === 'modes' ? 'set-mode' : `set-${action}`;
  root.querySelector(`[data-action="${focusAction}"][aria-pressed="true"]`)?.focus({ preventScroll: true });
}

// Quiz ---------------------------------------------------------------------

function sampleHtml(sample, className = 'sample') {
  return `<span class="${className}" lang="${escapeHtml(sample.lang)}" dir="auto">${escapeHtml(sample.text)}</span>`;
}

function promptHtml(question) {
  const { prompt } = question;
  return `
    <div class="prompt">
      ${prompt.flag ? `<div class="flag-hero" role="img" aria-label="Flag">${prompt.flag}</div>` : ''}
      ${prompt.sample ? `<blockquote class="sample-hero">${sampleHtml(prompt.sample)}</blockquote>` : ''}
      <h2>${escapeHtml(prompt.text)}</h2>
    </div>`;
}

function optionContent(option, answered) {
  if (option.flag) {
    return `<span class="option-flag" role="img" aria-label="${answered ? escapeHtml(option.caption) : 'Flag option'}">${option.flag}</span>
      ${answered ? `<span class="option-caption">${escapeHtml(option.caption)}</span>` : ''}`;
  }
  if (option.sample) {
    return `${sampleHtml(option.sample)}
      ${answered ? `<span class="option-caption">${escapeHtml(option.caption)}</span>` : ''}`;
  }
  return `<span>${escapeHtml(option.text)}</span>`;
}

function optionsHtml(question) {
  const { picked } = round;
  const answered = picked !== null;
  const style = question.optionStyle ?? (question.kind === 'truefalse' ? 'truefalse' : 'list');
  const buttons = question.options.map((option) => {
    let state = '';
    if (answered && option.correct) state = 'is-correct';
    else if (answered && option.id === picked) state = 'is-wrong';
    return `<button class="option ${state}" data-action="pick" data-option="${option.id}" ${answered ? 'disabled' : ''}>
      ${optionContent(option, answered)}
      ${state === 'is-correct' ? '<span class="mark" aria-label="Correct">✓</span>' : ''}
      ${state === 'is-wrong' ? '<span class="mark" aria-label="Your answer, incorrect">✕</span>' : ''}
    </button>`;
  }).join('');
  return `<div class="options options-${style}">${buttons}</div>`;
}

function typeFormHtml(question) {
  const answered = round.picked !== null;
  const state = !answered ? '' : round.lastCorrect ? 'is-correct' : 'is-wrong';
  return `
    <form class="type-form" data-action="submit-typed" autocomplete="off">
      <input class="type-input ${state}" name="answer" type="text" aria-label="Your answer"
        placeholder="${escapeHtml(question.placeholder)}" value="${escapeHtml(round.typed)}"
        autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false"
        enterkeyhint="done" ${answered ? 'disabled' : ''}>
      ${answered ? '' : `
        <div class="type-actions">
          <button type="button" class="button-quiet" data-action="give-up">I don't know</button>
          <button type="submit" class="button-primary">Check</button>
        </div>`}
    </form>`;
}

function retryNote() {
  const { session } = round;
  if (session.style !== 'repeat' || round.lastCorrect) return '';
  const comesNext = session.position + 1 === session.queue.length - 1;
  return `<p class="feedback-note">${comesNext ? "Have another go." : "You'll see this one again at the end."}</p>`;
}

function feedbackHtml(question) {
  if (round.picked === null) return '';
  const headline = round.lastCorrect
    ? (round.closeMatch ? `Close enough! It's spelled ${question.answerText}.` : 'Correct!')
    : 'Not quite.';
  return `
    <div class="feedback ${round.lastCorrect ? 'feedback-good' : 'feedback-bad'}" role="status">
      <p class="feedback-headline">${escapeHtml(headline)}</p>
      <p class="feedback-fact">${escapeHtml(question.fact)}</p>
      ${retryNote()}
      <button class="button-primary" data-action="next">${isLastItem(round.session) ? 'See results' : 'Next'}</button>
    </div>`;
}

function countLabel() {
  const { session } = round;
  if (session.position < session.total) return `Question ${session.position + 1} of ${session.total}`;
  const left = remaining(session);
  return `Retry · ${left} left`;
}

function renderQuestion() {
  const { session } = round;
  const item = currentItem(session);
  const { question } = item;
  const progress = (session.finished / session.total) * 100;
  // How often this question was missed before this attempt; shown only when it comes back.
  const missedBefore = item.misses - (round.picked !== null && !round.lastCorrect ? 1 : 0);
  show(`
    <div class="quiz-bar">
      <button class="icon-button" data-action="quit" aria-label="Quit round">${icon('close')}</button>
      <div class="quiz-title">${escapeHtml(modeLabel(round.modeId))}</div>
      <div class="quiz-score">Score ${session.firstTry}</div>
    </div>
    <div class="progress" role="progressbar" aria-label="Questions done" aria-valuemin="0" aria-valuemax="${session.total}" aria-valuenow="${session.finished}">
      <span style="width:${progress}%"></span>
    </div>
    <p class="question-count">${escapeHtml(countLabel())}${missedBefore ? ` <span class="retry-tag">Missed ${missedBefore}×</span>` : ''}</p>
    ${promptHtml(question)}
    ${question.kind === 'type' ? typeFormHtml(question) : optionsHtml(question)}
    ${feedbackHtml(question)}`);

  if (question.kind === 'type' && round.picked === null) {
    root.querySelector('.type-input').focus();
  } else if (round.picked !== null) {
    root.querySelector('.feedback')?.scrollIntoView({ block: 'nearest' });
  }
}

function rebuild(question) {
  return buildQuestion(question.modeId, byCode.get(question.code), data, Math.random);
}

function recordAnswer(correct, details = {}) {
  round.lastCorrect = correct;
  round.closeMatch = details.close ?? false;
  round.typed = details.typed ?? '';
  round.picked = details.picked ?? 'typed';
  recordResult(round.session, correct, rebuild);
  renderQuestion();
}

function startRound(modeId) {
  const questions = buildRound(modeId, data, Math.random, settings.length);
  round = {
    modeId,
    session: createSession(questions, settings.style),
    startedAt: Date.now(),
    picked: null,
    typed: '',
    lastCorrect: false,
    closeMatch: false,
  };
  view = { name: 'quiz' };
  renderQuestion();
}

function nextQuestion() {
  if (!advance(round.session)) {
    finishRound();
    return;
  }
  round.picked = null;
  round.typed = '';
  renderQuestion();
}

function quitRound() {
  const started = round && (round.session.answers > 0 || round.picked !== null);
  if (started && !window.confirm("Quit this round? Rounds you don't finish aren't saved to your progress.")) return;
  renderHome();
}

// Results ------------------------------------------------------------------

function resultMessage(score, total) {
  const ratio = score / total;
  if (ratio === 1) return 'Perfect round.';
  if (ratio >= 0.8) return 'Great work.';
  if (ratio >= 0.5) return 'Good effort.';
  return 'Keep practicing.';
}

function reviewItem(question, misses, showCount) {
  return `
    <li class="review-item">
      ${question.reviewFlag ? `<div class="review-flag" role="img" aria-label="Flag">${question.reviewFlag}</div>` : ''}
      ${question.reviewSample ? `<div class="review-sample">${sampleHtml(question.reviewSample)}</div>` : ''}
      <p class="review-prompt">${escapeHtml(question.prompt.text)}</p>
      <p class="review-answer">${escapeHtml(question.answerText)}</p>
      ${showCount ? `<p class="review-misses">Missed ${misses}×</p>` : ''}
    </li>`;
}

async function askToKeepStorage() {
  // Asks the browser not to clear saved progress when space runs low.
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // not supported: progress is still saved, just without the guarantee
  }
}

function finishRound() {
  const { session, modeId } = round;
  const questions = firstPass(session);
  const history = readHistory(storage);
  const previousBest = bestScores(history, storage).get(`${modeId}|${session.total}`);
  const record = makeGameRecord({ modeId, session, questions, startedAt: round.startedAt, endedAt: Date.now() });
  const saved = appendGame(storage, record);
  if (saved) askToKeepStorage();
  const isNewBest = session.firstTry > 0 && session.firstTry > (previousBest ?? -1);
  const missed = questions.filter((question) => session.misses.has(question.code));
  const isRepeat = session.style === 'repeat';
  view = { name: 'results' };

  show(`
    <div class="results">
      <p class="results-mode">${escapeHtml(modeLabel(modeId))}</p>
      <p class="results-score"><strong>${session.firstTry}</strong><span>/${session.total}</span></p>
      ${isRepeat ? '<p class="results-sub">right first time</p>' : ''}
      <p class="results-message">${escapeHtml(resultMessage(session.firstTry, session.total))}</p>
      ${isRepeat && missed.length ? `<p class="results-detail">Cleared all ${session.total} in ${session.answers} answers.</p>` : ''}
      ${isNewBest ? '<p class="results-best">New best score</p>' : ''}
      ${saved ? '' : "<p class=\"results-detail\">This round couldn't be saved to your progress: storage on this device is full or blocked.</p>"}
      <div class="results-actions">
        <button class="button-primary" data-action="start" data-mode="${modeId}">Play again</button>
        <button class="button-quiet" data-action="home">All games</button>
      </div>
      <button class="link-button" data-action="progress">See your progress</button>
    </div>
    ${missed.length ? `
      <section class="group review">
        <h2 class="group-label">To review</h2>
        <ul class="card review-list">${missed.map((question) => reviewItem(question, session.misses.get(question.code), isRepeat)).join('')}</ul>
      </section>` : ''}`);
  round = null;
}

// Progress -------------------------------------------------------------------

function statTile(label, value, note = '') {
  return `
    <div class="stat">
      <p class="stat-label">${escapeHtml(label)}</p>
      <p class="stat-value">${escapeHtml(value)}</p>
      ${note ? `<p class="stat-note">${escapeHtml(note)}</p>` : ''}
    </div>`;
}

function group(label, body, note = '') {
  return `
    <section class="group">
      <h2 class="group-label">${escapeHtml(label)}</h2>
      ${body}
      ${note ? `<p class="group-note">${escapeHtml(note)}</p>` : ''}
    </section>`;
}

function spotAnswer(spot, country) {
  if (spot.categoryId === 'capitals') return `Capital: ${country.capital}`;
  if (spot.categoryId === 'flags') return 'Flag';
  const language = data.languages[country.language].name;
  return spot.categoryId === 'writing' ? `Writing: ${language}` : `Language: ${language}`;
}

function troubleHtml(spots) {
  if (!spots.length) {
    return '<div class="card"><div class="row empty-row">Nothing right now. Countries you miss show up here until you get them right.</div></div>';
  }
  return `<div class="card">${spots.map((spot) => {
    const country = byCode.get(spot.code);
    if (!country) return '';
    const sample = spot.categoryId === 'writing' ? data.samples[country.sampleKey ?? country.language] : null;
    return `
      <div class="row spot">
        <span class="spot-flag" aria-hidden="true">${country.flag}</span>
        <span class="row-main">
          <span class="row-title">${escapeHtml(country.name)}</span>
          <span class="row-sub">${escapeHtml(spotAnswer(spot, country))}</span>
          ${sample ? `<span class="spot-sample">${sampleHtml(sample)}</span>` : ''}
        </span>
        <span class="row-value">missed ${spot.missed} of ${spot.seen}</span>
      </div>`;
  }).join('')}</div>`;
}

function roundRow(game, withMode) {
  const details = [withMode ? formatDate(game.at) : null, STYLE_LABELS[game.style], formatDuration(game.ms)].filter(Boolean);
  return `
    <div class="row round-row">
      <span class="row-main">
        <span class="row-title">${escapeHtml(withMode ? modeLabel(game.mode) : formatDateTime(game.at))}</span>
        <span class="row-sub">${escapeHtml(details.join(' · '))}</span>
      </span>
      <span class="row-score">${game.firstTry}/${game.total}</span>
    </div>`;
}

function backupHtml(hasHistory) {
  return group('Backup', `
    <div class="card">
      <div class="backup-actions">
        <button class="button-quiet" data-action="export" ${hasHistory ? '' : 'disabled'}>Export</button>
        <button class="button-quiet" data-action="import">Import</button>
      </div>
      ${hasHistory ? '<button class="row danger" data-action="clear">Delete all progress</button>' : ''}
    </div>
    <input type="file" class="import-input" accept=".json,application/json" hidden>`,
  'Progress is saved on this phone only. Removing the app from your home screen deletes it, so export a backup now and then.');
}

function renderProgress() {
  view = { name: 'progress' };
  const history = readHistory(storage);
  const message = notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : '';
  notice = '';

  if (!history.length) {
    show(`${navBar('Progress', 'home')}${message}
      <div class="empty">
        <p class="empty-title">No rounds yet</p>
        <p>Finish a round and it will show up here, so you can watch your scores improve.</p>
        <button class="button-primary" data-action="home">Pick a game</button>
      </div>
      ${backupHtml(false)}`);
    return;
  }

  const stats = summarize(history);
  const modes = modeSummaries(history).map((summary) => `
    <button class="row list-button" data-action="mode-progress" data-mode="${summary.modeId}">
      <span class="row-main">
        <span class="row-title">${escapeHtml(modeLabel(summary.modeId))}</span>
        <span class="row-sub">${summary.games.length} ${summary.games.length === 1 ? 'round' : 'rounds'} · best ${percent(summary.best)}</span>
      </span>
      ${sparklineHtml(summary.games.slice(-12).map(share))}
      <span class="row-score">${percent(summary.latest)}</span>
      ${icon('chevron', 'icon chevron')}
    </button>`).join('');

  show(`
    ${navBar('Progress', 'home')}
    ${message}
    <div class="stats">
      ${statTile('Rounds played', stats.rounds.toLocaleString())}
      ${statTile('Questions answered', stats.questions.toLocaleString())}
      ${statTile('Right first time', percent(stats.accuracy), stats.rounds > 10 ? `Last 10 rounds: ${percent(stats.recentAccuracy)}` : '')}
      ${statTile('Days played', stats.days.toLocaleString())}
    </div>
    ${group('By game', `<div class="card">${modes}</div>`, 'Latest round on the right. Tap a game for its full history.')}
    ${group('Trouble spots', troubleHtml(troubleSpots(history)), 'Missed the last time you saw them.')}
    ${group('Recent rounds', `<div class="card">${history.slice(-10).reverse().map((game) => roundRow(game, true)).join('')}</div>`)}
    ${backupHtml(true)}`);
}

function averageShare(games) {
  return games.reduce((sum, game) => sum + share(game), 0) / games.length;
}

function renderModeProgress(modeId) {
  view = { name: 'mode-progress', modeId };
  const games = readHistory(storage).filter((game) => game.mode === modeId);
  if (!games.length) {
    renderProgress();
    return;
  }
  const best = Math.max(...games.map(share));
  const sample = Math.min(5, Math.floor(games.length / 2));
  let trend = '';
  if (sample >= 1) {
    const change = Math.round((averageShare(games.slice(-sample)) - averageShare(games.slice(0, sample))) * 100);
    const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
    trend = `${sign}${Math.abs(change)} pts vs your first ${sample === 1 ? 'round' : `${sample} rounds`}`;
  }
  const recent = games.slice(-Math.max(sample, 1));
  const label = escapeHtml(`${modeLabel(modeId)}: right first time in each of ${games.length} rounds, latest ${percent(share(games[games.length - 1]))}`);

  show(`
    ${navBar(modeLabel(modeId), 'progress')}
    <div class="stats">
      ${statTile('Rounds played', games.length.toLocaleString())}
      ${statTile('Best', percent(best))}
      ${statTile(recent.length === 1 ? 'Latest round' : `Last ${recent.length} rounds`, percent(averageShare(recent)), trend)}
    </div>
    ${group('Right first time, by round', `<div class="card chart-card"><div class="chart-slot" data-label="${label}"></div></div>`)}
    ${group('Every round', `<div class="card">${games.slice().reverse().map((game) => roundRow(game, false)).join('')}</div>`)}
    <button class="button-primary wide" data-action="start" data-mode="${modeId}">Play ${escapeHtml(findMode(modeId).mode.title)}</button>`);
  drawModeChart(games);
}

function drawModeChart(games) {
  const slot = root.querySelector('.chart-slot');
  if (!slot) return;
  const points = games.map((game) => ({
    value: share(game),
    detail: `${game.firstTry}/${game.total} · ${STYLE_LABELS[game.style]} · ${formatDateTime(game.at)}`,
  }));
  slot.innerHTML = lineChartHtml(points.map((point) => point.value), slot.clientWidth, slot.dataset.label);
  attachLineChart(slot, points);
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (view.name === 'mode-progress') {
      drawModeChart(readHistory(storage).filter((game) => game.mode === view.modeId));
    }
  }, 150);
});

async function exportBackup() {
  const text = exportHistory(readHistory(storage));
  const day = new Date().toISOString().slice(0, 10);
  const file = new File([text], `quizly-progress-${day}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Quizly progress' });
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

async function importBackup(file) {
  const result = importHistory(storage, await file.text());
  if (!result.ok) notice = result.error;
  else if (result.added === 0) notice = 'Nothing new in that backup: those rounds are already here.';
  else notice = `Added ${result.added} ${result.added === 1 ? 'round' : 'rounds'} from the backup.`;
  renderProgress();
}

function deleteProgress() {
  if (!window.confirm('Delete all your saved rounds and best scores? This can’t be undone.')) return;
  clearHistory(storage);
  notice = 'All progress deleted.';
  renderProgress();
}

// Events -------------------------------------------------------------------

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.tagName === 'FORM' || target.disabled) return;
  const { action } = target.dataset;
  if (action === 'start') startRound(target.dataset.mode);
  else if (action === 'home') renderHome();
  else if (action === 'pick-mode') renderModePicker(target.dataset.category);
  else if (action === 'set-mode') {
    updateSettings({ modes: { ...settings.modes, [target.dataset.category]: target.dataset.mode } });
  }
  else if (action === 'quit') quitRound();
  else if (action === 'menu') setMenuOpen(true);
  else if (action === 'close-menu') setMenuOpen(false);
  else if (action === 'settings') renderSettings();
  else if (action === 'progress') renderProgress();
  else if (action === 'mode-progress') renderModeProgress(target.dataset.mode);
  else if (action === 'set-length') updateSettings({ length: Number(target.dataset.value) });
  else if (action === 'set-style') updateSettings({ style: target.dataset.value });
  else if (action === 'set-theme') updateSettings({ theme: target.dataset.value });
  else if (action === 'export') exportBackup();
  else if (action === 'import') root.querySelector('.import-input').click();
  else if (action === 'clear') deleteProgress();
  else if (action === 'next') nextQuestion();
  else if (action === 'give-up' && round?.picked === null) recordAnswer(false);
  else if (action === 'pick' && round?.picked === null) {
    const { question } = currentItem(round.session);
    const option = question.options.find((candidate) => candidate.id === target.dataset.option);
    recordAnswer(option.correct, { picked: option.id });
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && root.querySelector('.menu-layer:not([hidden])')) setMenuOpen(false);
});

root.addEventListener('change', (event) => {
  if (event.target.matches('.import-input') && event.target.files[0]) importBackup(event.target.files[0]);
});

root.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!round || round.picked !== null) return;
  const typed = new FormData(event.target).get('answer').trim();
  if (!typed) return;
  const { question } = currentItem(round.session);
  const result = matchAnswer(typed, question.accepted, question.domain);
  recordAnswer(result !== 'wrong', { typed, close: result === 'close' });
});

// Startup ------------------------------------------------------------------

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function start() {
  try {
    const [countries, languages, samples] = await Promise.all(
      ['countries', 'languages', 'samples'].map((name) => loadJson(`data/${name}.json`)),
    );
    data = prepareData({ countries, languages, samples });
    byCode = new Map(data.countries.map((country) => [country.code, country]));
    renderHome();
  } catch (error) {
    console.error(error);
    show(`
      <div class="load-error">
        <h1>Couldn't load the game</h1>
        <p>Connect to the internet once so it can finish downloading.</p>
        <button class="button-primary" onclick="location.reload()">Try again</button>
      </div>`);
  }
}

applyTheme(settings.theme);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline support unavailable', error));
}

start();
