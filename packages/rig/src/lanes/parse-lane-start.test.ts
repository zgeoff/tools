import { expect, test } from 'bun:test';
import { parseLaneStart } from './parse-lane-start.ts';

test.each([
  ['nothing', undefined],
  ['an object with no environment', {}],
])('it reads %s as no extra environment', (_title, value) => {
  expect(parseLaneStart(value, 'start.ts')).toStrictEqual({});
});

test('it reads the environment that a start hook returns', () => {
  expect(
    parseLaneStart({ environment: { KILN_URL: 'http://localhost:7001' } }, 'start.ts'),
  ).toStrictEqual({
    environment: { KILN_URL: 'http://localhost:7001' },
  });
});

test.each([
  ['null', null],
  ['a string', 'ready'],
  ['an environment that holds a number', { environment: { KILN_PORT: 7001 } }],
  ['an environment that is null', { environment: null }],
])('it refuses %s', (_title, value) => {
  expect(() => parseLaneStart(value, 'start.ts')).toThrow('the start hook start.ts must return');
});
