import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { runCommand } from '../ci/run-command.ts';
import { fixAdvisories } from './fix-advisories.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-fix-advisories-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const remote = join(directory, 'remote.git');
  const clone = join(directory, 'clone');
  const runnerTemp = join(directory, 'runner');

  await mkdir(runnerTemp);
  await runGit(directory, env, ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
  await runGit(directory, env, ['clone', '--quiet', remote, clone]);
  await createGitCommit(clone, env, { 'package.json': '{}\n' });
  await runGit(clone, env, ['push', '--quiet', 'origin', 'HEAD:main']);

  const pushBranch = async (branch: string, files: Readonly<Record<string, string>>) => {
    await runGit(clone, env, ['checkout', '--quiet', '-b', branch]);
    await createGitCommit(clone, env, files);
    await runGit(clone, env, ['push', '--quiet', 'origin', branch]);
    await runGit(clone, env, ['checkout', '--quiet', 'main']);
  };

  const calls: (readonly string[])[] = [];

  const runFix = (base: string) =>
    fixAdvisories({
      cwd: clone,
      env,
      runnerTemp,
      base,
      defaultBranch: 'main',
      expiryDays: '14',
      runCommand,
      runAuditFix: (argv) => {
        calls.push(argv);

        return Promise.resolve();
      },
    });

  return { runnerTemp, calls, pushBranch, runFix };
}

test('it hands the audit the ignores of the open fix branch, so a rerun keeps their expiry', async () => {
  const ctx = await setupTest();

  await ctx.pushBranch('audit-fix', { 'audit-ignores.json': '{"GHSA-1234":{}}\n' });
  await ctx.runFix('main');

  const pending = await readFile(join(ctx.runnerTemp, 'pending-ignores.json'), 'utf8');

  expect(pending).toBe('{"GHSA-1234":{}}\n');

  expect(ctx.calls).toStrictEqual([
    [
      '--title-file',
      join(ctx.runnerTemp, 'title.txt'),
      '--body-file',
      join(ctx.runnerTemp, 'body.md'),
      '--review-file',
      join(ctx.runnerTemp, 'needs-review.txt'),
      '--expiry-days',
      '14',
      '--pending-ignores',
      join(ctx.runnerTemp, 'pending-ignores.json'),
    ],
  ]);
});

test('it runs the audit with no pending ignores when no fix branch exists', async () => {
  const ctx = await setupTest();

  await ctx.runFix('main');

  const hasPending = await Bun.file(join(ctx.runnerTemp, 'pending-ignores.json')).exists();

  expect(hasPending).toBeFalse();

  expect(ctx.calls).toStrictEqual([
    [
      '--title-file',
      join(ctx.runnerTemp, 'title.txt'),
      '--body-file',
      join(ctx.runnerTemp, 'body.md'),
      '--review-file',
      join(ctx.runnerTemp, 'needs-review.txt'),
      '--expiry-days',
      '14',
    ],
  ]);
});

test('it runs the audit with no pending ignores when the fix branch records none', async () => {
  const ctx = await setupTest();

  await ctx.pushBranch('audit-fix', { 'bun.lock': 'kettle\n' });
  await ctx.runFix('main');

  const hasPending = await Bun.file(join(ctx.runnerTemp, 'pending-ignores.json')).exists();

  expect(hasPending).toBeFalse();
  expect(ctx.calls).toHaveLength(1);
  expect(ctx.calls.flat()).not.toContain('--pending-ignores');
});

test('it reads the pending ignores from the fix branch of another base', async () => {
  const ctx = await setupTest();

  await ctx.pushBranch('audit-fix', { 'audit-ignores.json': '{"GHSA-main":{}}\n' });
  await ctx.pushBranch('audit-fix-release-v2', { 'audit-ignores.json': '{"GHSA-v2":{}}\n' });
  await ctx.runFix('release/v2');

  const pending = await readFile(join(ctx.runnerTemp, 'pending-ignores.json'), 'utf8');

  expect(pending).toBe('{"GHSA-v2":{}}\n');
});
