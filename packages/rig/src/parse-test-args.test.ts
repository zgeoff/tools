import { expect, test } from 'bun:test';
import { parseTestArgs } from './parse-test-args.ts';

test('it splits the flags from the paths, each in its order', () => {
  expect(parseTestArgs(['--bail', './a.test.ts', '--seed=1', 'oven'])).toStrictEqual({
    flags: ['--bail', '--seed=1'],
    paths: ['./a.test.ts', 'oven'],
  });
});

test('it keeps a value joined to its option with = in the flag', () => {
  expect(parseTestArgs(['--test-name-pattern=heats up', '--timeout=9000'])).toStrictEqual({
    flags: ['--test-name-pattern=heats up', '--timeout=9000'],
    paths: [],
  });
});

test('it reads a word after an option as a path, whatever the option', () => {
  expect(parseTestArgs(['--seed', '7', '--bail', './a.test.ts'])).toStrictEqual({
    flags: ['--seed', '--bail'],
    paths: ['7', './a.test.ts'],
  });
});
