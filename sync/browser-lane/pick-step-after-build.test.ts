import { expect, test } from 'bun:test';
import { pickStepAfterBuild } from './pick-step-after-build.ts';

test.each([
  ['no build', null, { kind: 'run-tests' }],
  ['a build that passes', 0, { kind: 'run-tests' }],
  ['a build that fails', 2, { kind: 'finish', exitCode: 2 }],
] as const)('it picks the step after %s', (_, buildExitCode, expected) => {
  expect(pickStepAfterBuild(buildExitCode)).toStrictEqual(expected);
});
