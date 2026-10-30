import { expect, test } from 'bun:test';
import { pickStepAfterBuild } from './pick-step-after-build.ts';

test.each([
  ['no build', null, false, { kind: 'run-tests' }],
  ['a build that passes', 0, false, { kind: 'run-tests' }],
  ['a build that fails', 2, false, { kind: 'finish', exitCode: 2 }],
  ['an abort during a build that passes', 0, true, { kind: 'finish', exitCode: 1 }],
  ['an abort during a build that SIGTERM stops', 143, true, { kind: 'finish', exitCode: 1 }],
  [
    'an abort before the tests of a repo with no build',
    null,
    true,
    { kind: 'finish', exitCode: 1 },
  ],
] as const)('it picks the step after %s', (_, buildExitCode, isAborted, expected) => {
  expect(pickStepAfterBuild(buildExitCode, isAborted)).toStrictEqual(expected);
});
