import { expect, test } from 'bun:test';
import type { CommandResult } from '../ci/run-command.ts';
import { writeSyncAlarm } from './write-sync-alarm.ts';

function setupTest(pullRequests: unknown, issueTitles: string) {
  const calls: string[][] = [];
  const output: string[] = [];

  const run = (argv: readonly string[]): Promise<CommandResult> => {
    calls.push([...argv]);

    const [, group, command] = argv;

    if (group === 'pr' && command === 'list') {
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify(pullRequests), stderr: '' });
    }

    if (group === 'issue' && command === 'list') {
      return Promise.resolve({ exitCode: 0, stdout: issueTitles, stderr: '' });
    }

    return Promise.resolve({
      exitCode: 0,
      stdout: 'https://github.com/example/app/issues/9\n',
      stderr: '',
    });
  };

  const alarm = () =>
    writeSyncAlarm({
      cwd: '.',
      env: {},
      branch: 'repo-sync/zgeoff-tools',
      now: new Date('2026-03-12T12:00:00Z'),
      runCommand: run,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { calls, output, alarm };
}

test('it opens one triage issue for a sync pull request that is red for more than a day', async () => {
  const ctx = setupTest(
    [
      {
        number: 41,
        url: 'https://github.com/example/app/pull/41',
        createdAt: '2026-03-10T09:00:00Z',
        statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
      },
    ],
    'Unrelated bug\n',
  );

  const exitCode = await ctx.alarm();

  expect(exitCode).toBe(0);

  expect(ctx.calls.at(-1)?.slice(0, 5)).toStrictEqual([
    'gh',
    'issue',
    'create',
    '--title',
    'repo-sync: pull request #41 is red for more than a day',
  ]);

  expect(ctx.output).toStrictEqual([
    '::warning::Opened https://github.com/example/app/issues/9: repo-sync: pull request #41 is red for more than a day\n',
  ]);
});

test('it opens no issue when one is already open for the pull request', async () => {
  const ctx = setupTest(
    [
      {
        number: 41,
        url: 'https://github.com/example/app/pull/41',
        createdAt: '2026-03-10T09:00:00Z',
        statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }],
      },
    ],
    'repo-sync: pull request #41 is red for more than a day\n',
  );

  const exitCode = await ctx.alarm();

  expect(exitCode).toBe(0);

  expect(ctx.calls.map((argv) => argv.slice(1, 3))).toStrictEqual([
    ['pr', 'list'],
    ['issue', 'list'],
  ]);
});

test('it fails when gh prints something other than a list of pull requests', async () => {
  const ctx = setupTest({ message: 'Not Found' }, '');

  const exitCode = await ctx.alarm();

  expect(exitCode).toBe(1);
  expect(ctx.output).toStrictEqual(['::error::gh pr list printed no list of pull requests\n']);
});
