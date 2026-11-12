// Decides whether a typed answer counts, forgiving typos but never a different real answer.

export function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/\bsaint\b/g, 'st');
}

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function tolerance(length) {
  if (length < 5) return 0;
  return length < 9 ? 1 : 2;
}

/**
 * @param {string} guess what the player typed
 * @param {string[]} accepted every spelling that counts as right
 * @param {string[]} domain every answer in this category, right or wrong
 * @returns {'exact'|'close'|'wrong'}
 */
export function matchAnswer(guess, accepted, domain) {
  const typed = normalize(guess);
  if (!typed) return 'wrong';
  const right = new Set(accepted.map(normalize));
  if (right.has(typed)) return 'exact';

  const others = domain.map(normalize).filter((answer) => !right.has(answer));
  if (others.includes(typed)) return 'wrong'; // "Zambia" is never a typo for "Gambia"

  for (const answer of right) {
    const gap = distance(typed, answer);
    if (gap <= tolerance(answer.length) && !others.some((other) => distance(typed, other) <= gap)) {
      return 'close';
    }
  }
  return 'wrong';
}
