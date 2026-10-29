import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubCommand } from '../../test-utils/create-stub-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { holdHandPushedSync } from './hold-hand-pushed-sync.ts';

async function setupTest(pulls: unknown) {
  const directory = await mkdtemp(join(import.meta.dir, '.test-hold-hand-pushed-sync-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const log = join(directory, 'calls.log');

  await createStubCommand(directory, 'gh', log, JSON.stringify(pulls));

  const output: string[] = [];

  const exitCode = await holdHandPushedSync({
    cwd: directory,
    env: {
      PATH: `${directory}:${process.env['PATH']}`,
      REPO: 'example/app',
      BRANCH: 'repo-sync/zgeoff-tools',
      PUSHER: 'octo-dev',
    },
    runCommand,
    writeOutput: (text) => {
      output.push(text);
    },
  });

  const calls = await readFile(log, 'utf8');

  return { exitCode, output, calls };
}

test('it turns auto-merge off when someone other than the author pushes', async () => {
  const ctx = await setupTest([
    { number: 7, user: { login: 'sync-app[bot]' }, auto_merge: { merge_method: 'squash' } },
  ]);

  expect(ctx.exitCode).toBe(0);

  expect(ctx.calls).toBe(
    'gh api repos/example/app/pulls?state=open&head=example:repo-sync/zgeoff-tools\n' +
      'gh pr merge 7 --disable-auto --repo example/app\n',
  );

  expect(ctx.output).toStrictEqual([
    '::warning::octo-dev pushed to repo-sync/zgeoff-tools, so auto-merge of pull request #7 is off and it waits for review.\n',
  ]);
});

test('it keeps auto-merge on when the author pushes', async () => {
  const ctx = await setupTest([
    { number: 7, user: { login: 'octo-dev' }, auto_merge: { merge_method: 'squash' } },
  ]);

  expect(ctx.exitCode).toBe(0);

  expect(ctx.calls).toBe(
    'gh api repos/example/app/pulls?state=open&head=example:repo-sync/zgeoff-tools\n',
  );

  expect(ctx.output).toStrictEqual(['octo-dev opened pull request #7; nothing to hold.\n']);
});

test('it leaves a pull request with auto-merge off alone', async () => {
  const ctx = await setupTest([{ number: 7, user: { login: 'sync-app[bot]' }, auto_merge: null }]);

  expect(ctx.exitCode).toBe(0);

  expect(ctx.calls).toBe(
    'gh api repos/example/app/pulls?state=open&head=example:repo-sync/zgeoff-tools\n',
  );

  expect(ctx.output).toStrictEqual([
    'octo-dev pushed to repo-sync/zgeoff-tools, and pull request #7 has auto-merge off.\n',
  ]);
});

test('it holds nothing when the branch has no open pull request', async () => {
  const ctx = await setupTest([]);

  expect(ctx.exitCode).toBe(0);

  expect(ctx.output).toStrictEqual([
    'repo-sync/zgeoff-tools has no open pull request; nothing to hold.\n',
  ]);
});

test('it fails on a pull request with no author', () => {
  const promise = setupTest([{ number: 7, auto_merge: null }]);

  expect(promise).rejects.toThrow('gh api returned a pull request with no number or author');
});
