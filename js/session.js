// A round in play: the queue of questions and what each answer does to it.
// Standard: every question is asked once. Repeat: a missed question goes to the
// back of the queue, freshly built, until it's answered right.

export const STYLES = ['standard', 'repeat'];

export function createSession(questions, style) {
  return {
    style: STYLES.includes(style) ? style : 'standard',
    total: questions.length,
    queue: questions.map((question) => ({ question, misses: 0 })),
    position: 0,
    firstTry: 0, // right on the first attempt: the round's score
    finished: 0, // questions that are done with (answered, or answered right in repeat)
    answers: 0,
    misses: new Map(), // country code -> times missed
  };
}

export const currentItem = (session) => session.queue[session.position];

// rebuild(question) returns a new question about the same country, so a retry
// doesn't just test where the right button was last time.
export function recordResult(session, correct, rebuild) {
  const item = currentItem(session);
  session.answers += 1;
  if (correct) {
    if (item.misses === 0) session.firstTry += 1;
    session.finished += 1;
    return;
  }
  item.misses += 1;
  const { code } = item.question;
  session.misses.set(code, (session.misses.get(code) ?? 0) + 1);
  if (session.style === 'repeat') {
    session.queue.push({ question: rebuild(item.question), misses: item.misses });
  } else {
    session.finished += 1;
  }
}

export const isLastItem = (session) => session.position === session.queue.length - 1;

// Moves to the next question; false when the round is over.
export function advance(session) {
  if (isLastItem(session)) return false;
  session.position += 1;
  return true;
}

// Questions still to clear, counting the current one.
export const remaining = (session) => session.queue.length - session.position;

// The first-time questions, in the order they were asked.
export const firstPass = (session) => session.queue.slice(0, session.total).map((item) => item.question);
