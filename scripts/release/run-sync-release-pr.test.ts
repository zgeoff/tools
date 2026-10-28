import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { runCommand } from '../ci/run-command.ts';
import { runSyncReleasePR } from './run-sync-release-pr.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-sync-release-pr-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const remote = join(directory, 'remote.git');
  const clone = join(directory, 'clone');

  await runGit(directory, env, ['init', '--quiet', '--bare', remote]);
  await runGit(directory, env, ['clone', '--quiet', remote, clone]);

  const readRemote = (format: string) =>
    $`git -C ${remote} log -1 ${`--format=${format}`}`.env({ ...env }).text();

  const readRemoteFile = (path: string) =>
    $`git -C ${remote} show ${`HEAD:${path}`}`.env({ ...env }).text();

  // A runner sets no git identity in the environment, so the step's own config names the author.
  const runnerEnv = Object.fromEntries(
    Object.entries(env).filter(([name]) => !/^GIT_(?:AUTHOR|COMMITTER)_/u.test(name)),
  );

  const output: string[] = [];
  const loggedCalls: string[][] = [];

  const runSync = (syncEnv: Readonly<Record<string, string | undefined>>, syncCommand: string) =>
    runSyncReleasePR({
      cwd: clone,
      env: syncEnv,
      syncCommand,
      runCommand,
      runLoggedCommand: (argv, options) => {
        loggedCalls.push([...argv]);

        return runCommand(argv, options);
      },
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { env, runnerEnv, clone, output, loggedCalls, runSync, readRemote, readRemoteFile };
}

test('it commits and pushes what the sync command changed on the release branch', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.env, { 'README.md': 'kettle\n' });
  await runGit(ctx.clone, ctx.env, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  await ctx.runSync(ctx.runnerEnv, String.raw`printf 'fixed\n' >> README.md`);

  const pushed = await ctx.readRemoteFile('README.md');
  const commit = await ctx.readRemote('%s|%an|%ae');

  expect(pushed).toBe('kettle\nfixed\n');

  expect(commit).toBe(
    'chore: sync lockfile and format release files|github-actions[bot]|41898282+github-actions[bot]@users.noreply.github.com\n',
  );
});

test('it runs the sync command, the commit and the push through the runner that streams their output', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.env, { 'README.md': 'kettle\n' });
  await runGit(ctx.clone, ctx.env, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  await ctx.runSync(ctx.runnerEnv, String.raw`printf 'fixed\n' >> README.md`);

  expect(ctx.loggedCalls).toStrictEqual([
    ['bash', '-c', String.raw`printf 'fixed\n' >> README.md`],
    ['git', 'config', 'user.name', 'github-actions[bot]'],
    ['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'],
    ['git', 'commit', '-am', 'chore: sync lockfile and format release files'],
    ['git', 'push'],
  ]);

  expect(ctx.output).toStrictEqual([]);
});

test('it pushes nothing to the release branch when the sync command changed nothing', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.env, { 'README.md': 'kettle\n' });
  await runGit(ctx.clone, ctx.env, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  const before = await ctx.readRemote('%H');

  await ctx.runSync(ctx.env, 'true');

  const after = await ctx.readRemote('%H');

  expect(after).toBe(before);

  expect(ctx.output).toStrictEqual([
    'The sync command changed nothing; the release PR stays as it is.\n',
  ]);
});

test('it fails and pushes nothing when the sync command fails', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.env, { 'README.md': 'kettle\n' });
  await runGit(ctx.clone, ctx.env, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  const before = await ctx.readRemote('%H');

  const syncing = ctx.runSync(ctx.env, String.raw`printf 'half\n' >> README.md; exit 3`);

  expect(syncing).rejects.toThrow('exited with 3');

  const after = await ctx.readRemote('%H');

  expect(after).toBe(before);
});

test('it fails when git cannot read the working tree', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.env, { 'README.md': 'kettle\n' });
  await writeFile(join(ctx.clone, '.git/index'), 'not an index');

  expect(ctx.runSync(ctx.env, 'true')).rejects.toThrow('git diff failed: ');
});
