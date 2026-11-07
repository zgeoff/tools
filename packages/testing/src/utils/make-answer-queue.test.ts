import { expect, test } from 'bun:test';
import { makeAnswerQueue } from './make-answer-queue.ts';

test('it answers each call with the next answer, in order', () => {
  const answer = makeAnswerQueue(['busy', 'slow', 'boiled']);
  const answers = [answer(), answer(), answer()];

  expect(answers).toStrictEqual(['busy', 'slow', 'boiled']);
});

test('it throws on the call past the last answer', () => {
  const answer = makeAnswerQueue(['busy', 'slow']);

  answer();
  answer();

  expect(() => answer()).toThrow('the answer queue ran out after 2 answer(s)');
});

test('it throws on the first call of an empty queue', () => {
  const answer = makeAnswerQueue<string>([]);

  expect(() => answer()).toThrow('the answer queue ran out after 0 answer(s)');
});

test('it answers null and undefined in their turn', () => {
  const answer = makeAnswerQueue<string | null | undefined>(['ready', null, undefined]);
  const answers = [answer(), answer(), answer()];

  expect(answers).toStrictEqual(['ready', null, undefined]);
});
