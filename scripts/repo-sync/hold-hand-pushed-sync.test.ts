import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubCommand } from '../../test-utils/create-stub-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { holdHandPushedSync } from './hold-hand-pushed-sync.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-hold-hand-pushed-sync-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const output: string[] = [];

  return {
    directory,
    log: join(directory, 'calls.log'),
    env: {
      PATH: `${directory}:${process.env['PATH']}`,
      REPO: 'example/app',
      BRANCH: 'repo-sync/zgeoff-tools',
      PUSHER: 'octo-dev',
    },
    output,
    writeOutput: (text: string) => {
      output.push(text);
    },
  };
}

test('it turns auto-merge off when someone other than the author pushes', async () => {
  const ctx = await setupTest();

  await createStubCommand(
    ctx.directory,
    'gh',
    ctx.log,
    JSON.stringify([
      { number: 7, user: { login: 'sync-app[bot]' }, auto_merge: { merge_method: 'squash' } },
    ]),
  );

  const exitCode = await holdHandPushedSync({
    cwd: ctx.directory,
    env: ctx.env,
    runCommand,
    writeOutput: ctx.writeOutput,
  });

  const calls = await readFile(ctx.log, 'utf8');

  expect(exitCode).toBe(0);

  expect(calls).toBe(
    'gh api -X GET repos/example/app/pulls -f state=open -f head=example:repo-sync/zgeoff-tools\n' +
      'gh pr merge 7 --disable-auto --repo example/app\n',
  );

  expect(ctx.output).toStrictEqual([
    '::warning::octo-dev pushed to repo-sync/zgeoff-tools, so auto-merge of pull request #7 is off and it waits for review.\n',
  ]);
});

test('it leaves auto-merge on when the author pushes', async () => {
  const ctx = await setupTest();

  await createStubCommand(
    ctx.directory,
    'gh',
    ctx.log,
    JSON.stringify([
      { number: 7, user: { login: 'octo-dev' }, auto_merge: { merge_method: 'squash' } },
    ]),
  );

  const exitCode = await holdHandPushedSync({
    cwd: ctx.directory,
    env: ctx.env,
    runCommand,
    writeOutput: ctx.writeOutput,
  });

  const calls = await readFile(ctx.log, 'utf8');

  expect(exitCode).toBe(0);

  expect(calls).toBe(
    'gh api -X GET repos/example/app/pulls -f state=open -f head=example:repo-sync/zgeoff-tools\n',
  );

  expect(ctx.output).toStrictEqual(['octo-dev opened pull request #7; nothing to hold.\n']);
});

test('it fails on a pull request with no author', async () => {
  const ctx = await setupTest();

  await createStubCommand(ctx.directory, 'gh', ctx.log, JSON.stringify([{ number: 7 }]));

  const holding = holdHandPushedSync({
    cwd: ctx.directory,
    env: ctx.env,
    runCommand,
    writeOutput: ctx.writeOutput,
  });

  expect(holding).rejects.toThrow('gh api returned a pull request with no number or author');
});

test('it builds a pull request lookup that gh runs outside a git checkout', async () => {
  const ctx = await setupTest();

  // gh fills a path placeholder from the git checkout it runs in, and the guard's job has none. The
  // ceiling hides this repo from git, and the closed port stops gh after it builds the request.
  const holding = holdHandPushedSync({
    cwd: ctx.directory,
    env: {
      PATH: process.env['PATH'],
      HOME: ctx.directory,
      GIT_CEILING_DIRECTORIES: import.meta.dir,
      GH_HOST: '127.0.0.1:9',
      GH_ENTERPRISE_TOKEN: 'test-token',
      REPO: 'example/app',
      BRANCH: 'repo-sync/zgeoff-tools',
      PUSHER: 'octo-dev',
    },
    runCommand,
    writeOutput: ctx.writeOutput,
  });

  expect(holding).rejects.toThrow(
    'Get "https://127.0.0.1:9/api/v3/repos/example/app/pulls?head=example%3Arepo-sync%2Fzgeoff-tools&state=open"',
  );
});
