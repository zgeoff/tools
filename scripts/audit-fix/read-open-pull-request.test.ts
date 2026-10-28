import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { runCommand } from '../ci/run-command.ts';
import { readOpenPullRequest } from './read-open-pull-request.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-read-open-pull-request-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const readNumber = () =>
    readOpenPullRequest({
      cwd: directory,
      env: { PATH: `${directory}:${process.env['PATH']}` },
      branch: 'audit-fix',
      runCommand,
    });

  return { gh, readNumber };
}

test('it returns the number of the open pull request of the branch', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);

  const number = await ctx.readNumber();
  const calls = await ctx.gh.readCalls();

  expect(number).toBe(41);
  expect(calls).toStrictEqual(['pr list --head audit-fix --state open --json number']);
});

test('it returns null when the branch has no open pull request', async () => {
  const ctx = await setupTest();
  const number = await ctx.readNumber();

  expect(number).toBeNull();
});

test('it fails when gh cannot list the pull requests', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('prs', ['error']);

  expect(ctx.readNumber()).rejects.toThrow(
    'gh pr list --head audit-fix --state open --json number exited with 1: HTTP 502',
  );
});
