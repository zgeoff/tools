import { expect, test } from 'bun:test';
import { parseTestArgs } from './parse-test-args.ts';

test('it splits the flags from the paths, each in its order', () => {
  expect(parseTestArgs(['--bail', './a.test.ts', '--seed=1', 'oven'])).toStrictEqual({
    flags: ['--bail', '--seed=1'],
    paths: ['./a.test.ts', 'oven'],
  });
});

test('it reads the argument after an option that takes a value as that value, not as a path', () => {
  expect(parseTestArgs(['-t', 'heats up', '--seed', '7', './a.test.ts'])).toStrictEqual({
    flags: ['-t', 'heats up', '--seed', '7'],
    paths: ['./a.test.ts'],
  });
});

test('it reads the word after --bail as a path, because --bail takes its value only after =', () => {
  expect(parseTestArgs(['--bail', './a.test.ts'])).toStrictEqual({
    flags: ['--bail'],
    paths: ['./a.test.ts'],
  });
});
