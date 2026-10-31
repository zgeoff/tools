import { expect, test } from 'bun:test';
import { findTimeoutArg } from './find-timeout-arg.ts';

test.each([
  ['a timeout joined with =', ['--bail', '--timeout=90000'], '--timeout=90000'],
  ['a timeout with its value after it', ['--timeout', '90000'], '--timeout'],
  ['an empty joined timeout', ['--timeout='], '--timeout='],
  ['no timeout', ['--bail', '--seed=1', './src'], undefined],
  ['an option that only starts like a timeout', ['--timeouts=3'], undefined],
])('it finds %s among the arguments', (_, args, expected) => {
  expect(findTimeoutArg(args)).toBe(expected);
});
