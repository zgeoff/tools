import { expect, test } from 'bun:test';
import { makeAnswerQueue } from './make-answer-queue.ts';

test('it answers each call with the next answer, then repeats the last one', () => {
  const answer = makeAnswerQueue(['busy', 'slow', 'boiled']);
  const answers = [answer(), answer(), answer(), answer()];

  expect(answers).toStrictEqual(['busy', 'slow', 'boiled', 'boiled']);
});

test('it answers every call with a lone answer', () => {
  const answer = makeAnswerQueue(['boiled']);
  const answers = [answer(), answer()];

  expect(answers).toStrictEqual(['boiled', 'boiled']);
});

test('it answers null and undefined in their turn', () => {
  const answer = makeAnswerQueue<string | null | undefined>(['ready', null, undefined]);
  const answers = [answer(), answer(), answer(), answer()];

  expect(answers).toStrictEqual(['ready', null, undefined, undefined]);
});
