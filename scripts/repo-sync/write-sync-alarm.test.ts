import { expect, test } from 'bun:test';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { writeSyncAlarm } from './write-sync-alarm.ts';

function setupTest() {
  const commands = buildCommandStub();
  const output: string[] = [];

  const alarm = (now: Date) =>
    writeSyncAlarm({
      cwd: '.',
      env: {},
      branch: 'repo-sync/zgeoff-tools',
      now,
      runCommand: commands.runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { commands, output, alarm };
}

test('it opens one triage issue for a sync pull request that is red for more than a day', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--head',
      'repo-sync/zgeoff-tools',
      '--state',
      'open',
      '--json',
      'number,url,createdAt,statusCheckRollup',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify([
        {
          number: 41,
          url: 'https://github.com/example/app/pull/41',
          createdAt: '2026-03-10T09:00:00Z',
          statusCheckRollup: [
            { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
          ],
        },
      ]),
      stderr: '',
    },
  );

  ctx.commands.answer(
    [
      'gh',
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      '1000',
      '--json',
      'title',
      '--jq',
      '.[].title',
    ],
    { exitCode: 0, stdout: 'Unrelated bug\n', stderr: '' },
  );

  ctx.commands.answer(
    [
      'gh',
      'issue',
      'create',
      '--title',
      'repo-sync: pull request #41 is red for more than a day',
      '--body',
      [
        'The repo-sync pull request https://github.com/example/app/pull/41, opened at 2026-03-10T09:00:00Z, has a failing check, so it does not merge and this repo stops taking the shared files from zgeoff/tools.',
        '',
        'Read the failing check and fix its cause: in this repo when the synced files break a check here, or in zgeoff/tools when the shared files are wrong. A fix in zgeoff/tools reaches this pull request in the next sync run. Close this issue once the pull request merges.',
      ].join('\n'),
    ],
    { exitCode: 0, stdout: 'https://github.com/example/app/issues/9\n', stderr: '' },
  );

  const exitCode = await ctx.alarm(new Date('2026-03-12T12:00:00Z'));

  expect(exitCode).toBe(0);

  expect(ctx.output).toStrictEqual([
    '::warning::Opened https://github.com/example/app/issues/9: repo-sync: pull request #41 is red for more than a day\n',
  ]);
});

test('it opens no issue when one is already open for the pull request', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--head',
      'repo-sync/zgeoff-tools',
      '--state',
      'open',
      '--json',
      'number,url,createdAt,statusCheckRollup',
    ],
    {
      exitCode: 0,
      stdout: JSON.stringify([
        {
          number: 41,
          url: 'https://github.com/example/app/pull/41',
          createdAt: '2026-03-10T09:00:00Z',
          statusCheckRollup: [
            { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' },
          ],
        },
      ]),
      stderr: '',
    },
  );

  ctx.commands.answer(
    [
      'gh',
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      '1000',
      '--json',
      'title',
      '--jq',
      '.[].title',
    ],
    {
      exitCode: 0,
      stdout: 'repo-sync: pull request #41 is red for more than a day\n',
      stderr: '',
    },
  );

  const exitCode = await ctx.alarm(new Date('2026-03-12T12:00:00Z'));

  expect(exitCode).toBe(0);

  expect(ctx.commands.calls.map((argv) => argv.slice(1, 3))).toStrictEqual([
    ['pr', 'list'],
    ['issue', 'list'],
  ]);
});

test('it fails when gh prints something other than a list of pull requests', async () => {
  const ctx = setupTest();

  ctx.commands.answer(
    [
      'gh',
      'pr',
      'list',
      '--head',
      'repo-sync/zgeoff-tools',
      '--state',
      'open',
      '--json',
      'number,url,createdAt,statusCheckRollup',
    ],
    { exitCode: 0, stdout: JSON.stringify({ message: 'Not Found' }), stderr: '' },
  );

  const exitCode = await ctx.alarm(new Date('2026-03-12T12:00:00Z'));

  expect(exitCode).toBe(1);
  expect(ctx.output).toStrictEqual(['::error::gh pr list printed no list of pull requests\n']);
});
