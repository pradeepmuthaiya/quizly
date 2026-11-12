import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, createSession, currentItem, firstPass, isLastItem, recordResult, remaining } from '../js/session.js';

const questions = (...codes) => codes.map((code) => ({ code, version: 1 }));
const rebuild = (question) => ({ ...question, version: question.version + 1 });

// Answers each question with the next result; returns the codes in the order they were asked.
function play(session, results) {
  const asked = [];
  for (const correct of results) {
    asked.push(currentItem(session).question.code);
    recordResult(session, correct, rebuild);
    if (!advance(session)) return { asked, over: true };
  }
  return { asked, over: false };
}

test('standard asks each question once and scores right answers', () => {
  const session = createSession(questions('FR', 'DE', 'IT'), 'standard');
  const { asked, over } = play(session, [true, false, true]);
  assert.deepEqual(asked, ['FR', 'DE', 'IT']);
  assert.equal(over, true);
  assert.equal(session.firstTry, 2);
  assert.equal(session.finished, 3);
  assert.deepEqual([...session.misses], [['DE', 1]]);
});

test('repeat sends a miss to the back until it is answered right', () => {
  const session = createSession(questions('FR', 'DE', 'IT'), 'repeat');
  const { asked, over } = play(session, [false, true, true, false, true]);
  assert.deepEqual(asked, ['FR', 'DE', 'IT', 'FR', 'FR']);
  assert.equal(over, true);
  assert.equal(session.firstTry, 2, 'a retry never counts toward the score');
  assert.equal(session.answers, 5);
  assert.equal(session.finished, 3);
  assert.deepEqual([...session.misses], [['FR', 2]]);
});

test('a retried question is rebuilt, and keeps its miss count', () => {
  const session = createSession(questions('FR', 'DE'), 'repeat');
  play(session, [false, true]);
  const item = currentItem(session);
  assert.equal(item.question.code, 'FR');
  assert.equal(item.question.version, 2);
  assert.equal(item.misses, 1);
  assert.equal(remaining(session), 1);
});

test('the round only ends once the last question is cleared', () => {
  const session = createSession(questions('FR'), 'repeat');
  recordResult(session, false, rebuild);
  assert.equal(isLastItem(session), false);
  assert.equal(advance(session), true);
  recordResult(session, true, rebuild);
  assert.equal(isLastItem(session), true);
  assert.equal(advance(session), false);
  assert.deepEqual(firstPass(session).map((q) => q.code), ['FR']);
});

test('an unknown style falls back to standard', () => {
  assert.equal(createSession(questions('FR'), 'nonsense').style, 'standard');
});
