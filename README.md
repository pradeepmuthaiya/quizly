# Worldly

A world trivia game for iPhone, built as an installable web app (PWA). It has no build step and
no runtime dependencies, and it works offline after the first visit.

## Games

Rounds are 10, 25 or 50 questions, drawn from 197 countries (193 UN members plus Vatican City,
Palestine, Kosovo and Taiwan).

| Category | Modes |
| --- | --- |
| Capitals | Multiple choice, true or false, type it |
| Flags | Name the flag, find the flag, true or false, type it |
| Languages | Multiple choice, true or false, type it |
| Writing | Find the writing, name the language, true or false |

### Round settings

Set on the home screen and remembered between visits.

- **Questions:** 10, 25 or 50 per round.
- **Style:** *Standard* asks each question once. *Repeat misses* sends a missed question to the
  end of the queue, freshly built so the right answer isn't in the same spot, until it's answered
  right. Either way the score is the number right first time, so the two styles compare fairly.

### Progress

Every finished round is saved on the device (`localStorage`, up to 2,000 rounds). Rounds you
quit aren't saved. The Progress screen shows totals, a trend line for each game, the countries
you missed the last time you saw them, and recent rounds. Best scores are kept per game and round
length.

Removing the app from the home screen deletes its data, so Progress has **Export** (the share
sheet on iPhone, so it can go to Files or AirDrop) and **Import**, which merges a backup without
duplicating rounds.

## Run and test

```sh
npm start            # http://localhost:4317
npm test             # data, answer matching and question logic
npm install          # needed once for the browser tests
npx playwright install chromium webkit
npm run e2e          # plays every mode in iPhone-sized WebKit; offline test in Chromium
                     # (uses its own server on port 4327, so it can run alongside npm start)
```

## Install on an iPhone

1. Host the site over HTTPS. GitHub Pages works: publish this folder from the `main` branch root.
2. Open the URL in Safari and tap Share → Add to Home Screen.
3. Open `check.html` once in Safari to confirm every flag and script renders on the phone.

Updates reach the phone automatically the next time the app opens online.

## Data

- `data/countries.json`: names, capitals, regions and languages. Edit by hand.
- `data/languages.json`: language names and accepted spellings. Edit by hand.
- `data/samples.json`: generated, don't edit. Article 1 of the Universal Declaration of Human
  Rights in each language. Rebuild it with `scripts/build_samples.py`, whose header says where to
  get the corpus.

Rules used for the data:

- **Primary language** means the language most people actually use, not necessarily the official
  one. Senegal is Wolof, with French listed under `also`. Where no local language has a clear lead,
  the official language is used (Nigeria, Cameroon).
- `also` lists languages that are never offered as wrong answers, because they would be defensible.
- `accept` lists other languages that count as right when typed, for countries with co-primary
  languages.
- **Capitals** with more than one candidate show the constitutional or official one, and the rest
  are accepted when typed through `capitalAliases`.
- Eight languages have no sample in the corpus (Comorian, Dari, Gilbertese, Mandinka, Mauritian
  Creole, Nauruan, Sinhala, Tuvaluan), so their countries are left out of Writing games only.
