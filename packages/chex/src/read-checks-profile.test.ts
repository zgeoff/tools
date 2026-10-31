import { expect, mock, test } from 'bun:test';
import { buildStubProgramRunner } from '../../../test-utils/build-stub-program-runner.ts';
import { readChecksProfile } from './read-checks-profile.ts';

test.each([['public' as const], ['private' as const]])(
  'it takes CHECKS_PROFILE=%s and never asks GitHub',
  (profile) => {
    const writeError = mock<(text: string) => void>();

    const result = readChecksProfile({
      cwd: '/work/kettle',
      env: { CHECKS_PROFILE: profile },
      runProgram: buildStubProgramRunner({}),
      writeError,
    });

    expect(result).toBe(profile);
    expect(writeError.mock.calls).toStrictEqual([]);
  },
);

test.each([
  [undefined, 'true\n', 'private' as const],
  [undefined, 'false\n', 'public' as const],
  ['nightly', 'false\n', 'public' as const],
])(
  'it asks GitHub when CHECKS_PROFILE is %p, and reads gh printing %j as the %s profile',
  (given, stdout, profile) => {
    const writeError = mock<(text: string) => void>();

    const result = readChecksProfile({
      cwd: '/work/kettle',
      env: { CHECKS_PROFILE: given },
      runProgram: buildStubProgramRunner({
        'gh repo view --json isPrivate --jq .isPrivate': { exitCode: 0, stdout, stderr: '' },
      }),
      writeError,
    });

    expect(result).toBe(profile);
    expect(writeError.mock.calls).toStrictEqual([]);
  },
);

test.each([
  [
    'gh exits 1',
    { exitCode: 1, stdout: '', stderr: 'none of the git remotes point to a known GitHub host\n' },
    `workflows: the repo's visibility is unknown, so every rule applies: gh repo view --json isPrivate --jq .isPrivate exited 1: none of the git remotes point to a known GitHub host\n`,
  ],
  [
    'gh prints no boolean',
    { exitCode: 0, stdout: 'maybe\n', stderr: '' },
    `workflows: the repo's visibility is unknown, so every rule applies: gh repo view --json isPrivate --jq .isPrivate exited 0: maybe\n`,
  ],
])('it returns no profile and says why when %s', (_, answer, error) => {
  const writeError = mock<(text: string) => void>();

  const result = readChecksProfile({
    cwd: '/work/kettle',
    env: {},
    runProgram: buildStubProgramRunner({ 'gh repo view --json isPrivate --jq .isPrivate': answer }),
    writeError,
  });

  expect(result).toBeUndefined();
  expect(writeError.mock.calls).toStrictEqual([[error]]);
});
