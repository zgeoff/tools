import { expect, test } from 'bun:test';
import { parseDuration } from './parse-duration.ts';

test.each([
  ['15s', 15_000],
  ['1500ms', 1500],
  ['1s', 1000],
  ['120s', 120_000],
])('it reads the duration %s as %d ms', (text, expectedMs) => {
  expect(parseDuration(text)).toBe(expectedMs);
});

test.each(['', '15', '0s', '-5s', '1.5s', '15m', ' 15s', '15 s', 'fifteen s', '15S'])(
  'it refuses the text %p as a duration',
  (text) => {
    expect(parseDuration(text)).toBeNull();
  },
);
