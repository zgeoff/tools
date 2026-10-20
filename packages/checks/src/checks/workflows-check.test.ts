import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MissingProgramError } from '../missing-program-error.ts';
import { workflowsCheck } from './workflows-check.ts';

// The tests run the real actionlint from the PATH. The runner image lacks it, so main.yml and
// bun-checks.yml install it before the suite runs.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'workflows-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, '.github/workflows'), { recursive: true });

  return { directory };
}

test('it passes a clean workflow', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/greet.yml'),
    [
      'on: push',
      'jobs:',
      '  greet:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo "hello"',
      '',
    ].join('\n'),
  );

  const findings = await workflowsCheck.check({
    cwd: ctx.directory,
    files: ['.github/workflows/greet.yml'],
    env: process.env,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports an actionlint error at its line', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/greet.yml'),
    [
      'on: push',
      'jobs:',
      '  greet:',
      '    runs-on: ubuntu-latest',
      '    needs: build',
      '    steps:',
      '      - run: echo "hello"',
      '',
    ].join('\n'),
  );

  const findings = await workflowsCheck.check({
    cwd: ctx.directory,
    files: ['.github/workflows/greet.yml'],
    env: process.env,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/greet.yml',
      line: 3,
      message:
        'actionlint: job "greet" needs job "build" which does not exist in this workflow [job-needs]',
    },
  ]);
});

test('it names actionlint when the PATH lacks it', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, '.github/workflows/greet.yml'),
    'on: push\njobs:\n  greet:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "hello"\n',
  );

  expect(() =>
    workflowsCheck.check({
      cwd: ctx.directory,
      files: ['.github/workflows/greet.yml'],
      env: { PATH: ctx.directory },
    }),
  ).toThrowWithMessage(
    MissingProgramError,
    'workflows: actionlint is not on the PATH, and the workflows check needs it. Install actionlint, then run zgeoff-check again.',
  );
});
