import { expect, test } from 'bun:test';
import { makeRepeatingAnswerQueue } from './make-repeating-answer-queue.ts';

test('it answers each call with the next answer, in order', () => {
  const answer = makeRepeatingAnswerQueue(['busy', 'slow', 'boiled']);
  const answers = [answer(), answer(), answer()];

  expect(answers).toStrictEqual(['busy', 'slow', 'boiled']);
});

test('it answers the last answer again once the answers run out', () => {
  const answer = makeRepeatingAnswerQueue(['busy', 'slow']);
  const answers = [answer(), answer(), answer(), answer()];

  expect(answers).toStrictEqual(['busy', 'slow', 'slow', 'slow']);
});

test('it answers null and undefined in their turn', () => {
  const answer = makeRepeatingAnswerQueue<string | null | undefined>(['ready', null, undefined]);
  const answers = [answer(), answer(), answer(), answer()];

  expect(answers).toStrictEqual(['ready', null, undefined, undefined]);
});
