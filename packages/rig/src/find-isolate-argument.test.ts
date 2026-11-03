import { expect, test } from 'bun:test';
import { findIsolateArgument } from './find-isolate-argument.ts';

test.each([
  ['a bare isolate', ['--bail', '--isolate'], '--isolate'],
  ['an isolate joined with =', ['--isolate=true'], '--isolate=true'],
  ['no isolate', ['--bail', '--seed=1', './src'], undefined],
  ['the no-isolate that rig passes itself', ['--no-isolate'], undefined],
  ['an option that only starts like isolate', ['--isolated'], undefined],
])('it finds %s among the arguments', (_, args, expected) => {
  expect(findIsolateArgument(args)).toBe(expected);
});
