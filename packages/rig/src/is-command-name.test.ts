import { expect, test } from 'bun:test';
import { isCommandName } from './is-command-name.ts';

test.each([
  ['init', true],
  ['related', true],
  ['unit', false],
  ['kiln', false],
])('it answers whether %s names a built-in command', (name, expected) => {
  expect(isCommandName(name)).toBe(expected);
});
