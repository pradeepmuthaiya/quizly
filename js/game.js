// Pure game logic: builds rounds of questions from the data. No DOM access.

export const ROUND_LENGTH = 10;
const MAX_PER_LANGUAGE = 2;

export const CATEGORIES = [
  {
    id: 'capitals',
    group: 'Geography',
    title: 'Capitals',
    blurb: 'Name the capital city.',
    modes: [
      { id: 'capital-choice', title: 'Multiple choice', hint: 'Pick from four cities' },
      { id: 'capital-tf', title: 'True or false', hint: 'Is this the capital?' },
      { id: 'capital-type', title: 'Type it', hint: 'No hints, just spelling' },
    ],
  },
  {
    id: 'flags',
    group: 'Geography',
    title: 'Flags',
    blurb: 'Match flags and countries.',
    modes: [
      { id: 'flag-name', title: 'Name the flag', hint: 'See a flag, pick the country' },
      { id: 'flag-pick', title: 'Find the flag', hint: 'See a country, pick its flag' },
      { id: 'flag-tf', title: 'True or false', hint: 'Is this their flag?' },
      { id: 'flag-type', title: 'Type it', hint: 'See a flag, type the country' },
    ],
  },
  {
    id: 'languages',
    group: 'Geography',
    title: 'Languages',
    blurb: 'Name the main spoken language.',
    modes: [
      { id: 'language-choice', title: 'Multiple choice', hint: 'Pick from four languages' },
      { id: 'language-tf', title: 'True or false', hint: 'Is this what they speak?' },
      { id: 'language-type', title: 'Type it', hint: 'No hints, just spelling' },
    ],
  },
  {
    id: 'writing',
    group: 'Geography',
    title: 'Writing',
    blurb: 'Recognize how a language looks.',
    modes: [
      { id: 'writing-pick', title: 'Find the writing', hint: 'See a country, pick its text' },
      { id: 'writing-name', title: 'Name the language', hint: 'See text, pick the language' },
      { id: 'writing-tf', title: 'True or false', hint: 'Is this their language?' },
    ],
  },
  ...[
    ['sports', 'sports', 'Sports', 'Teams, records and champions.'],
    ['history', 'history', 'World history', 'Empires, wars and turning points.'],
    ['religion', 'religion', 'Religious history', 'Faiths, figures and events.'],
    ['popculture', 'pop', 'Pop culture', 'Music, film, TV and games.'],
  ].map(([id, prefix, title, blurb]) => ({
    id,
    group: 'General knowledge',
    trivia: true,
    title,
    blurb,
    modes: [
      { id: `${prefix}-choice`, title: 'Multiple choice', hint: 'Pick from four answers' },
      { id: `${prefix}-tf`, title: 'True or false', hint: 'Is this the right answer?' },
      { id: `${prefix}-type`, title: 'Type it', hint: 'No hints, just spelling' },
    ],
  })),
];

// Flags worth pairing: similar enough to be a fair challenge.
const SIMILAR_FLAGS = [
  ['IE', 'CI'], ['NL', 'LU'], ['AU', 'NZ'], ['ML', 'SN'], ['ML', 'GN'], ['SI', 'SK'], ['SK', 'RU'],
  ['NO', 'IS'], ['CO', 'EC'], ['EC', 'VE'], ['CO', 'VE'], ['SV', 'NI'], ['HN', 'SV'], ['JO', 'PS'],
  ['KW', 'AE'], ['BH', 'QA'], ['IN', 'NE'], ['GN', 'CI'], ['CG', 'SN'], ['AT', 'LV'], ['DK', 'CH'],
];
// Identical at emoji size, so a question separating them would be a coin flip.
const TWIN_FLAGS = [['ID', 'MC'], ['RO', 'TD']];

// Countries that take "the" mid-sentence: "the flag of the Netherlands".
const NAMES_WITH_THE = new Set(['AE', 'BS', 'CD', 'CF', 'CG', 'DO', 'GB', 'GM', 'KM', 'MH', 'MV', 'NL', 'PH', 'SB', 'SC', 'US']);

function flagEmoji(code) {
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function partners(pairs, code) {
  return pairs.flatMap(([a, b]) => (a === code ? [b] : b === code ? [a] : []));
}

export function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Picks `count` items, at most `nearCap` of them near, so wrong answers stay varied. */
function pickMixed(pool, isNear, count, rng, nearCap = 2) {
  const mixed = shuffled(pool, rng);
  const near = mixed.filter(isNear).slice(0, nearCap);
  const rest = mixed.filter((item) => !near.includes(item));
  return [...near, ...rest].slice(0, count);
}

export function prepareData({ countries, languages, samples, trivia = {} }) {
  const enriched = countries.map((country) => ({
    ...country,
    flag: flagEmoji(country.code),
    inSentence: NAMES_WITH_THE.has(country.code) ? `the ${country.name}` : country.name,
  }));
  const languageNames = (id) => [languages[id].name, ...(languages[id].aliases ?? [])];
  const primaryIds = [...new Set(enriched.map((country) => country.language))];
  const triviaDomains = Object.fromEntries(Object.entries(trivia).map(([categoryId, items]) => [
    categoryId,
    items.flatMap((item) => [item.a, ...(item.accept ?? []), ...item.wrong]),
  ]));
  return {
    countries: enriched,
    languages,
    samples,
    trivia,
    triviaDomains,
    primaryIds,
    languageNames,
    domains: {
      capital: enriched.flatMap((c) => [c.capital, ...(c.capitalAliases ?? [])]),
      country: enriched.flatMap((c) => [c.name, ...(c.aliases ?? [])]),
      language: Object.keys(languages).flatMap(languageNames),
    },
  };
}

/** Languages that would make a wrong answer actually defensible for this country. */
function ruledOutLanguages(country, data) {
  const ids = new Set([country.language, ...(country.also ?? []), ...(country.accept ?? [])]);
  for (const id of [...ids]) {
    for (const sibling of data.languages[id]?.siblings ?? []) ids.add(sibling);
  }
  return ids;
}

/** Takes three languages from an ordered list, never two near-identical siblings together. */
function firstThreeDistinct(orderedIds, data) {
  const picked = [];
  for (const id of orderedIds) {
    if (picked.length === 3) break;
    if (!picked.some((other) => data.languages[other].siblings?.includes(id))) picked.push(id);
  }
  return picked;
}

function languageChoices(country, data, rng) {
  const ruledOut = ruledOutLanguages(country, data);
  const regional = new Set(
    data.countries.filter((c) => c.region === country.region).map((c) => c.language),
  );
  const pool = data.primaryIds.filter((id) => !ruledOut.has(id));
  return firstThreeDistinct(pickMixed(pool, (id) => regional.has(id), pool.length, rng), data);
}

function capitalChoices(country, data, rng) {
  const pool = data.countries.filter((c) => c.code !== country.code);
  return pickMixed(pool, (c) => c.region === country.region, 3, rng);
}

function flagChoices(country, data, rng) {
  const similar = partners(SIMILAR_FLAGS, country.code);
  const twins = partners(TWIN_FLAGS, country.code);
  const pool = data.countries.filter((c) => c.code !== country.code && !twins.includes(c.code));
  const others = pool.filter((c) => !similar.includes(c.code));
  const picked = shuffled(pool.filter((c) => similar.includes(c.code)), rng).slice(0, 1);
  for (const candidate of pickMixed(others, (c) => c.region === country.region, others.length, rng)) {
    if (picked.length === 3) break;
    // Two twins side by side would look like the same option twice.
    if (!picked.some((c) => partners(TWIN_FLAGS, c.code).includes(candidate.code))) picked.push(candidate);
  }
  return picked;
}

function sampleFor(country, data) {
  return data.samples[country.sampleKey ?? country.language];
}

function writingChoices(country, data, rng) {
  const ruledOut = ruledOutLanguages(country, data);
  const script = sampleFor(country, data).script;
  const pool = data.primaryIds.filter((id) => !ruledOut.has(id) && data.samples[id]);
  return firstThreeDistinct(pickMixed(pool, (id) => data.samples[id].script === script, pool.length, rng), data);
}

function choiceOptions(correct, wrong, rng) {
  return shuffled(
    [{ ...correct, correct: true }, ...wrong.map((option) => ({ ...option, correct: false }))],
    rng,
  ).map((option, index) => ({ ...option, id: String(index) }));
}

function otherSpoken(country, data) {
  const also = (country.also ?? []).map((id) => data.languages[id].name);
  return also.length ? ` Also widely spoken: ${also.join(', ')}.` : '';
}

function languageFact(country, data) {
  const name = data.languages[country.language].name;
  return `${name} is the main language of ${country.inSentence}.${otherSpoken(country, data)}`;
}

const trueFalseOptions = (isTrue) => [
  { id: 'true', text: 'True', correct: isTrue },
  { id: 'false', text: 'False', correct: !isTrue },
];

const BUILDERS = {
  'capital-choice': (country, data, rng) => ({
    kind: 'choice',
    prompt: { text: `What is the capital of ${country.inSentence}?` },
    options: choiceOptions(
      { text: country.capital },
      capitalChoices(country, data, rng).map((c) => ({ text: c.capital })),
      rng,
    ),
    answerText: country.capital,
    fact: `${country.capital} is the capital of ${country.inSentence}.`,
  }),

  'capital-tf': (country, data, rng) => {
    const isTrue = rng() < 0.5;
    const decoy = capitalChoices(country, data, rng)[0];
    const shown = isTrue ? country.capital : decoy.capital;
    const fact = `${country.capital} is the capital of ${country.inSentence}.`;
    return {
      kind: 'truefalse',
      prompt: { text: `${shown} is the capital of ${country.inSentence}.` },
      options: trueFalseOptions(isTrue),
      answerText: isTrue ? 'True' : `False: it's ${country.capital}`,
      fact: isTrue ? fact : `${fact} ${decoy.capital} is the capital of ${decoy.inSentence}.`,
    };
  },

  'capital-type': (country, data) => ({
    kind: 'type',
    prompt: { text: `What is the capital of ${country.inSentence}?` },
    placeholder: 'Type the city',
    accepted: [country.capital, ...(country.capitalAliases ?? [])],
    domain: data.domains.capital,
    answerText: country.capital,
    fact: `${country.capital} is the capital of ${country.inSentence}.`,
  }),

  'flag-name': (country, data, rng) => ({
    kind: 'choice',
    prompt: { text: 'Which country does this flag belong to?', flag: country.flag },
    options: choiceOptions(
      { text: country.name },
      flagChoices(country, data, rng).map((c) => ({ text: c.name })),
      rng,
    ),
    answerText: country.name,
    fact: `This is the flag of ${country.inSentence}.`,
    reviewFlag: country.flag,
  }),

  'flag-pick': (country, data, rng) => ({
    kind: 'choice',
    optionStyle: 'flags',
    prompt: { text: `Which flag belongs to ${country.inSentence}?` },
    options: choiceOptions(
      { flag: country.flag, caption: country.name },
      flagChoices(country, data, rng).map((c) => ({ flag: c.flag, caption: c.name })),
      rng,
    ),
    answerText: country.name,
    fact: `This is the flag of ${country.inSentence}.`,
    reviewFlag: country.flag,
  }),

  'flag-tf': (country, data, rng) => {
    const isTrue = rng() < 0.5;
    const shown = isTrue ? country : flagChoices(country, data, rng)[0];
    return {
      kind: 'truefalse',
      prompt: { text: `This is the flag of ${country.inSentence}.`, flag: shown.flag },
      options: trueFalseOptions(isTrue),
      answerText: isTrue ? 'True' : `False: that's ${shown.name}`,
      fact: isTrue
        ? `This is the flag of ${country.inSentence}.`
        : `That's the flag of ${shown.inSentence}. The flag of ${country.inSentence} is ${country.flag}`,
      reviewFlag: shown.flag,
    };
  },

  'flag-type': (country, data) => ({
    kind: 'type',
    prompt: { text: 'Which country does this flag belong to?', flag: country.flag },
    placeholder: 'Type the country',
    accepted: [country.name, ...(country.aliases ?? [])],
    domain: data.domains.country,
    answerText: country.name,
    fact: `This is the flag of ${country.inSentence}.`,
    reviewFlag: country.flag,
  }),

  'language-choice': (country, data, rng) => ({
    kind: 'choice',
    prompt: { text: `What is the main language spoken in ${country.inSentence}?` },
    options: choiceOptions(
      { text: data.languages[country.language].name },
      languageChoices(country, data, rng).map((id) => ({ text: data.languages[id].name })),
      rng,
    ),
    answerText: data.languages[country.language].name,
    fact: languageFact(country, data),
  }),

  'language-tf': (country, data, rng) => {
    const isTrue = rng() < 0.5;
    const shownId = isTrue ? country.language : languageChoices(country, data, rng)[0];
    const correctName = data.languages[country.language].name;
    return {
      kind: 'truefalse',
      prompt: { text: `${data.languages[shownId].name} is the main language spoken in ${country.inSentence}.` },
      options: trueFalseOptions(isTrue),
      answerText: isTrue ? 'True' : `False: it's ${correctName}`,
      fact: languageFact(country, data),
    };
  },

  'language-type': (country, data) => ({
    kind: 'type',
    prompt: { text: `What is the main language spoken in ${country.inSentence}?` },
    placeholder: 'Type the language',
    accepted: [
      ...data.languageNames(country.language),
      ...(country.accept ?? []).flatMap(data.languageNames),
      ...(country.acceptText ?? []),
    ],
    domain: data.domains.language,
    answerText: data.languages[country.language].name,
    fact: languageFact(country, data),
  }),

  'writing-pick': (country, data, rng) => {
    const sample = sampleFor(country, data);
    return {
      kind: 'choice',
      optionStyle: 'samples',
      prompt: { text: `Which of these is written in the main language of ${country.inSentence}?` },
      options: choiceOptions(
        { sample, caption: data.languages[country.language].name },
        writingChoices(country, data, rng).map((id) => ({
          sample: data.samples[id],
          caption: data.languages[id].name,
        })),
        rng,
      ),
      answerText: data.languages[country.language].name,
      fact: languageFact(country, data),
      reviewSample: sample,
    };
  },

  'writing-name': (country, data, rng) => {
    const sample = sampleFor(country, data);
    const name = data.languages[country.language].name;
    const speakers = data.countries.filter((c) => c.language === country.language).map((c) => c.inSentence);
    const shownSpeakers = speakers.slice(0, 3).join(', ') + (speakers.length > 3 ? ', and more' : '');
    return {
      kind: 'choice',
      prompt: { text: 'What language is this?', sample },
      options: choiceOptions(
        { text: name },
        writingChoices(country, data, rng).map((id) => ({ text: data.languages[id].name })),
        rng,
      ),
      answerText: name,
      fact: `${name} is the main language of ${shownSpeakers}.`,
      reviewSample: sample,
    };
  },

  'writing-tf': (country, data, rng) => {
    const isTrue = rng() < 0.5;
    const decoyId = writingChoices(country, data, rng)[0];
    const sample = isTrue ? sampleFor(country, data) : data.samples[decoyId];
    const correctName = data.languages[country.language].name;
    return {
      kind: 'truefalse',
      prompt: { text: `This is written in the main language of ${country.inSentence}.`, sample },
      options: trueFalseOptions(isTrue),
      answerText: isTrue ? 'True' : `False: this is ${data.languages[decoyId].name}`,
      fact: isTrue
        ? languageFact(country, data)
        : `That's ${data.languages[decoyId].name}. ${languageFact(country, data)}`,
      reviewSample: sample,
    };
  },
};

// General-knowledge questions come from data/trivia.json: a question, its answer, other
// spellings that count when typed, and three wrong answers.
function triviaBuilders(category) {
  const [choiceId, tfId, typeId] = category.modes.map((mode) => mode.id);
  const fact = (item) => `The answer is ${item.a}.`;
  return {
    [choiceId]: (item, data, rng) => ({
      kind: 'choice',
      prompt: { text: item.q },
      options: choiceOptions({ text: item.a }, item.wrong.map((text) => ({ text })), rng),
      answerText: item.a,
      fact: fact(item),
    }),
    [tfId]: (item, data, rng) => {
      const isTrue = rng() < 0.5;
      const decoy = item.wrong[Math.floor(rng() * item.wrong.length)];
      return {
        kind: 'truefalse',
        prompt: { text: item.q, claim: isTrue ? item.a : decoy },
        options: trueFalseOptions(isTrue),
        answerText: isTrue ? 'True' : `False: it's ${item.a}`,
        fact: isTrue ? fact(item) : `The answer is ${item.a}, not ${decoy}.`,
      };
    },
    [typeId]: (item, data) => ({
      kind: 'type',
      prompt: { text: item.q },
      placeholder: 'Type your answer',
      accepted: [item.a, ...(item.accept ?? [])],
      domain: data.triviaDomains[category.id],
      answerText: item.a,
      fact: fact(item),
    }),
  };
}

for (const category of CATEGORIES.filter((candidate) => candidate.trivia)) {
  Object.assign(BUILDERS, triviaBuilders(category));
}

// What a mode asks about: countries for geography, questions from the bank for trivia.
export function subjectsFor(modeId, data) {
  const { category, mode } = findMode(modeId);
  if (category.trivia) {
    const items = data.trivia[category.id] ?? [];
    return mode.id.endsWith('-type') ? items.filter((item) => item.type !== false) : items;
  }
  if (modeId.startsWith('writing-')) {
    return data.countries.filter((country) => sampleFor(country, data));
  }
  return data.countries;
}

const subjectCode = (subject) => subject.code ?? subject.id;

// The country or trivia question behind a saved code, for retries and the progress screen.
export function findSubject(modeId, code, data) {
  return subjectsFor(modeId, data).find((subject) => subjectCode(subject) === code) ?? null;
}

function languageCap(modeId) {
  if (modeId === 'writing-name') return 1; // the question is about the language itself
  return modeId.startsWith('language-') || modeId.startsWith('writing-') ? MAX_PER_LANGUAGE : Infinity;
}

export function buildQuestion(modeId, subject, data, rng) {
  return { modeId, code: subjectCode(subject), ...BUILDERS[modeId](subject, data, rng) };
}

export function buildRound(modeId, data, rng, length = ROUND_LENGTH) {
  const cap = languageCap(modeId);
  const usedLanguages = new Map();
  const chosen = [];
  for (const subject of shuffled(subjectsFor(modeId, data), rng)) {
    const used = usedLanguages.get(subject.language) ?? 0;
    if (used >= cap) continue;
    usedLanguages.set(subject.language, used + 1);
    chosen.push(subject);
    if (chosen.length === length) break;
  }
  return chosen.map((subject) => buildQuestion(modeId, subject, data, rng));
}

export function findMode(modeId) {
  for (const category of CATEGORIES) {
    const mode = category.modes.find((candidate) => candidate.id === modeId);
    if (mode) return { category, mode };
  }
  return null;
}

export const allModeIds = () => CATEGORIES.flatMap((category) => category.modes.map((mode) => mode.id));
