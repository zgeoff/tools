import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { runChangedFilesStep } from './run-changed-files-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-changed-files-step-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const outputPath = join(directory, 'output');
  const env = readGitEnv(directory);
  const output: string[] = [];

  await mkdir(repo);
  await writeFile(outputPath, 'planned=true\n');

  // Commits a base, makes the change on a topic branch, and merges it into main with a merge
  // commit, as the pull request's merge ref holds it.
  const createMerge = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, {
      'README.md': '# app\n',
      'docker/app/Dockerfile': 'FROM scratch\n',
    });

    await $`git init -q -b main`.cwd(repo).env({ ...env });
    await $`git add -A`.cwd(repo).env({ ...env });
    await $`git commit -q -m base`.cwd(repo).env({ ...env });
    await $`git switch -q -c topic`.cwd(repo).env({ ...env });

    await writeTreeFiles(repo, files);

    await $`git add -A`.cwd(repo).env({ ...env });
    await $`git commit -q -m change`.cwd(repo).env({ ...env });
    await $`git switch -q main`.cwd(repo).env({ ...env });
    await $`git merge -q --no-ff -m merge topic`.cwd(repo).env({ ...env });
  };

  const runStep = (stepEnv: Readonly<Record<string, string>>) =>
    runChangedFilesStep({
      env: { ...env, ...stepEnv },
      fileSystem: nodeFileSystem,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readOutput = () => readFile(outputPath, 'utf8');

  return { repo, outputPath, output, createMerge, runStep, readOutput };
}

test('it appends changed=true to the step outputs when a changed file matches a pattern', async () => {
  const ctx = await setupTest();

  await ctx.createMerge({ 'docker/app/Dockerfile': 'FROM alpine\n' });

  const exitCode = await ctx.runStep({
    EVENT: 'pull_request',
    PATTERNS: 'docker/**\n',
    GITHUB_WORKSPACE: ctx.repo,
    GITHUB_OUTPUT: ctx.outputPath,
  });

  const outputs = await ctx.readOutput();

  expect(exitCode).toBe(0);
  expect(outputs).toBe('planned=true\nchanged=true\n');
  expect(ctx.output).toStrictEqual(['docker/app/Dockerfile matches docker/**\n', 'changed=true\n']);
});

test('it appends changed=false to the step outputs when no changed file matches', async () => {
  const ctx = await setupTest();

  await ctx.createMerge({ 'README.md': '# app, renamed\n' });

  const exitCode = await ctx.runStep({
    EVENT: 'pull_request',
    PATTERNS: 'docker/**\n',
    GITHUB_WORKSPACE: ctx.repo,
    GITHUB_OUTPUT: ctx.outputPath,
  });

  const outputs = await ctx.readOutput();

  expect(exitCode).toBe(0);
  expect(outputs).toBe('planned=true\nchanged=false\n');
  expect(ctx.output).toStrictEqual(['changed=false\n']);
});

test('it fails the step and writes no output when the runner gives no GITHUB_OUTPUT', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.runStep({
    EVENT: 'push',
    PATTERNS: 'docker/**\n',
    GITHUB_WORKSPACE: ctx.repo,
  });

  const outputs = await ctx.readOutput();

  expect(exitCode).toBe(1);
  expect(outputs).toBe('planned=true\n');

  expect(ctx.output).toStrictEqual([
    '::error::the match step needs GITHUB_OUTPUT and GITHUB_WORKSPACE\n',
  ]);
});
