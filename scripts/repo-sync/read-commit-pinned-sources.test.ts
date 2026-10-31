import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { readCommitPinnedSources } from './read-commit-pinned-sources.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-read-commit-pinned-sources-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const tools = join(directory, 'tools');

  await mkdir(tools);
  await runGit(tools, env, ['init', '--quiet', '--initial-branch=main']);

  const writeToolsCommit = (files: Readonly<Record<string, string>>) =>
    createGitCommit(tools, env, files);

  const read = (commit: string, run: RunCommand = runCommand) =>
    readCommitPinnedSources({ runCommand: run, cwd: directory, env, repository: 'tools', commit });

  return { writeToolsCommit, read };
}

test('it reads the reusable workflows and the step scripts the commit holds', async () => {
  const ctx = await setupTest();

  const commit = await ctx.writeToolsCommit({
    '.github/workflows/bake.yml': 'on:\n  workflow_call:\njobs: {}\n',
    '.github/workflows/nightly.yml': 'on:\n  schedule: []\njobs: {}\n',
    'scripts/repo-sync/sync-entries.ts': "import { knead } from './knead-dough.ts';\n\nknead();\n",
    'scripts/repo-sync/knead-dough.ts': 'export function knead() {}\n',
  });

  const sources = await ctx.read(commit);

  expect(sources).toIncludeAllMembers([
    '.github/workflows/bake.yml',
    'scripts/repo-sync/sync-entries.ts',
    'scripts/repo-sync/knead-dough.ts',
  ]);

  expect(sources).not.toContain('.github/workflows/nightly.yml');
});

test('it fails with git error when a file the tree lists cannot be read', async () => {
  const ctx = await setupTest();

  const commit = await ctx.writeToolsCommit({
    '.github/workflows/bake.yml': 'on:\n  workflow_call:\njobs: {}\n',
  });

  // A blobless checkout fails the read of a blob it cannot fetch.
  const commands = buildCommandStub({ program: 'git', runCommand });

  commands.answer(['git', '-C', 'tools', 'show', `${commit}:.github/workflows/bake.yml`], {
    exitCode: 128,
    stdout: '',
    stderr: 'fatal: could not fetch the blob\n',
  });

  const reading = ctx.read(commit, commands.runCommand);

  expect(reading).rejects.toThrow(
    `git -C tools show ${commit}:.github/workflows/bake.yml exited with 128: fatal: could not fetch the blob`,
  );
});

test('it fails with git error when the commit is missing from the checkout', async () => {
  const ctx = await setupTest();

  await ctx.writeToolsCommit({ '.github/workflows/bake.yml': 'on: workflow_call\n' });

  const missing = '0000000000000000000000000000000000000b01';
  const reading = ctx.read(missing);

  expect(reading).rejects.toThrow(`git -C tools ls-tree -z --name-only ${missing}`);
});
