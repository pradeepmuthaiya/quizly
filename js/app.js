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
    store.getItem('worldly.probe');
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

// Home ---------------------------------------------------------------------

function segmented(action, label, options, selected) {
  return `
    <div class="setting">
      <span class="setting-label" id="${action}-label">${label}</span>
      <div class="segmented" role="group" aria-labelledby="${action}-label">
        ${options.map(([value, text]) => `
          <button class="segment" data-action="${action}" data-value="${value}" aria-pressed="${String(value) === String(selected)}">${text}</button>`).join('')}
      </div>
    </div>`;
}

function renderHome() {
  round = null;
  view = { name: 'home' };
  const best = bestScores(readHistory(storage), storage);
  const { length } = settings;
  const categories = CATEGORIES.map((category) => `
    <section class="category">
      <header class="category-head">
        <span class="category-icon" aria-hidden="true">${category.icon}</span>
        <div>
          <h2>${escapeHtml(category.title)}</h2>
          <p>${escapeHtml(category.blurb)}</p>
        </div>
      </header>
      <div class="modes">
        ${category.modes.map((mode) => {
          const score = best.get(`${mode.id}|${length}`);
          return `
          <button class="mode" data-action="start" data-mode="${mode.id}">
            <span class="mode-text">
              <span class="mode-title">${escapeHtml(mode.title)}</span>
              <span class="mode-hint">${escapeHtml(mode.hint)}</span>
            </span>
            ${score === undefined ? '' : `<span class="mode-best" aria-label="Best score ${score} of ${length}">${score}/${length}</span>`}
          </button>`;
        }).join('')}
      </div>
    </section>`).join('');

  show(`
    <header class="masthead">
      <div>
        <h1>Worldly</h1>
        <p>${data.countries.length} countries. How many do you really know?</p>
      </div>
      <button class="pill-button" data-action="progress">Progress</button>
    </header>
    <section class="settings" aria-label="Round settings">
      ${segmented('set-length', 'Questions', LENGTHS.map((value) => [value, value]), settings.length)}
      ${segmented('set-style', 'Style', Object.entries(STYLE_LABELS), settings.style)}
      <p class="setting-hint">${escapeHtml(STYLE_HINTS[settings.style])}</p>
    </section>
    ${categories}`);
}

function updateSettings(change) {
  settings = { ...settings, ...change };
  saveSettings(storage, settings);
  const scrollY = window.scrollY;
  renderHome();
  window.scrollTo(0, scrollY);
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
      <button class="icon-button" data-action="quit" aria-label="Quit to home">✕</button>
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
  if (ratio === 1) return 'Perfect round. The world is your oyster.';
  if (ratio >= 0.8) return 'Seasoned traveler.';
  if (ratio >= 0.5) return 'Solid. A few more stamps in the passport.';
  return 'Every expert started somewhere. Go again?';
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
      <section class="review">
        <h2>Worth another look</h2>
        <ul>${missed.map((question) => reviewItem(question, session.misses.get(question.code), isRepeat)).join('')}</ul>
      </section>` : ''}`);
  round = null;
}

// Progress -----------------------------------------------------------------

function statTile(label, value, note = '') {
  return `
    <div class="stat">
      <p class="stat-label">${escapeHtml(label)}</p>
      <p class="stat-value">${escapeHtml(value)}</p>
      ${note ? `<p class="stat-note">${escapeHtml(note)}</p>` : ''}
    </div>`;
}

function spotAnswer(spot, country) {
  if (spot.categoryId === 'capitals') return `Capital: ${country.capital}`;
  if (spot.categoryId === 'flags') return 'Flag';
  const language = data.languages[country.language].name;
  return spot.categoryId === 'writing' ? `Writing: ${language}` : `Language: ${language}`;
}

function troubleHtml(spots) {
  if (!spots.length) return '<p class="empty-note">Nothing right now. Countries you miss show up here until you get them right.</p>';
  return `<ul class="list">${spots.map((spot) => {
    const country = byCode.get(spot.code);
    if (!country) return '';
    const sample = spot.categoryId === 'writing' ? data.samples[country.sampleKey ?? country.language] : null;
    return `
      <li class="list-row spot">
        <span class="spot-flag" aria-hidden="true">${country.flag}</span>
        <span class="list-main">
          <span class="list-title">${escapeHtml(country.name)}</span>
          <span class="list-sub">${escapeHtml(spotAnswer(spot, country))}</span>
          ${sample ? `<span class="spot-sample">${sampleHtml(sample)}</span>` : ''}
        </span>
        <span class="list-side">missed ${spot.missed} of ${spot.seen}</span>
      </li>`;
  }).join('')}</ul>`;
}

function roundRow(game, withMode) {
  return `
    <li class="list-row">
      <span class="list-main">
        <span class="list-title">${escapeHtml(withMode ? modeLabel(game.mode) : formatDateTime(game.at))}</span>
        <span class="list-sub">${escapeHtml([withMode ? formatDate(game.at) : null, STYLE_LABELS[game.style], formatDuration(game.ms)].filter(Boolean).join(' · '))}</span>
      </span>
      <span class="list-score">${game.firstTry}/${game.total}</span>
    </li>`;
}

function barHtml(title, back) {
  return `
    <div class="quiz-bar">
      <button class="icon-button" data-action="${back}" aria-label="Back">‹</button>
      <div class="bar-title">${escapeHtml(title)}</div>
    </div>`;
}

function renderProgress() {
  view = { name: 'progress' };
  const history = readHistory(storage);
  const message = notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : '';
  notice = '';
  const backup = `
    <section class="panel">
      <h2>Backup</h2>
      <p class="panel-note">Your progress is saved on this phone only. Removing the app from your home screen deletes it, so export a backup now and then.</p>
      <div class="results-actions">
        <button class="button-quiet" data-action="export" ${history.length ? '' : 'disabled'}>Export</button>
        <button class="button-quiet" data-action="import">Import</button>
      </div>
      <input type="file" class="import-input" accept=".json,application/json" hidden>
      ${history.length ? '<button class="link-button link-danger" data-action="clear">Delete all progress</button>' : ''}
    </section>`;

  if (!history.length) {
    show(`${barHtml('Your progress', 'home')}${message}
      <div class="empty">
        <p class="empty-title">No rounds yet</p>
        <p>Finish a round and it'll show up here, so you can watch your scores climb.</p>
        <button class="button-primary" data-action="home">Pick a game</button>
      </div>
      ${backup}`);
    return;
  }

  const stats = summarize(history);
  const modes = modeSummaries(history).map((summary) => `
    <li>
      <button class="list-row list-button" data-action="mode-progress" data-mode="${summary.modeId}">
        <span class="list-main">
          <span class="list-title">${escapeHtml(modeLabel(summary.modeId))}</span>
          <span class="list-sub">${summary.games.length} ${summary.games.length === 1 ? 'round' : 'rounds'} · best ${percent(summary.best)}</span>
        </span>
        ${sparklineHtml(summary.games.slice(-12).map(share))}
        <span class="list-score">${percent(summary.latest)}</span>
      </button>
    </li>`).join('');

  show(`
    ${barHtml('Your progress', 'home')}
    ${message}
    <div class="stats">
      ${statTile('Rounds played', stats.rounds.toLocaleString())}
      ${statTile('Questions answered', stats.questions.toLocaleString())}
      ${statTile('Right first time', percent(stats.accuracy), stats.rounds > 10 ? `last 10 rounds: ${percent(stats.recentAccuracy)}` : '')}
      ${statTile('Days played', stats.days.toLocaleString())}
    </div>
    <section class="panel">
      <h2>By game</h2>
      <p class="panel-note">Latest round on the right. Tap a game for its full history.</p>
      <ul class="list">${modes}</ul>
    </section>
    <section class="panel">
      <h2>Trouble spots</h2>
      <p class="panel-note">Missed the last time you saw them.</p>
      ${troubleHtml(troubleSpots(history))}
    </section>
    <section class="panel">
      <h2>Recent rounds</h2>
      <ul class="list">${history.slice(-10).reverse().map((game) => roundRow(game, true)).join('')}</ul>
    </section>
    ${backup}`);
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
    ${barHtml(modeLabel(modeId), 'progress')}
    <div class="stats">
      ${statTile('Rounds played', games.length.toLocaleString())}
      ${statTile('Best', percent(best))}
      ${statTile(recent.length === 1 ? 'Latest round' : `Last ${recent.length} rounds`, percent(averageShare(recent)), trend)}
    </div>
    <section class="panel">
      <h2>Right first time, by round</h2>
      <div class="chart-slot" data-label="${label}"></div>
    </section>
    <section class="panel">
      <h2>Every round</h2>
      <ul class="list">${games.slice().reverse().map((game) => roundRow(game, false)).join('')}</ul>
    </section>
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
  const file = new File([text], `worldly-progress-${day}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Worldly progress' });
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
  else if (action === 'quit') quitRound();
  else if (action === 'progress') renderProgress();
  else if (action === 'mode-progress') renderModeProgress(target.dataset.mode);
  else if (action === 'set-length') updateSettings({ length: Number(target.dataset.value) });
  else if (action === 'set-style') updateSettings({ style: target.dataset.value });
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Offline support unavailable', error));
}

start();
