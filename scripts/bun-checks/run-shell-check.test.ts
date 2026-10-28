import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runShellCheck } from './run-shell-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-shell-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  const trackFiles = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, files);

    await $`git add -- ${Object.keys(files)}`.cwd(repo).env({ ...env });
  };

  // Captures each logged command's output, which the CLI's runner prints as it runs.
  const logged: string[] = [];

  const runLogged: RunCommand = async (argv, options) => {
    const result = await runCommand(argv, options);

    logged.push(`${result.stdout}${result.stderr}`);

    return result;
  };

  const output: string[] = [];

  const writeOutput = (text: string) => {
    output.push(text);
  };

  return { repo, env, trackFiles, logged, runLogged, output, writeOutput };
}

test('it passes tracked scripts that shellcheck and shfmt accept, and skips an untracked one', async () => {
  const ctx = await setupTest();

  await ctx.trackFiles({ 'scripts/greet.sh': '#!/usr/bin/env bash\necho "hi"\n' });

  await writeTreeFiles(ctx.repo, { 'untracked.sh': 'if true;then echo $1;fi\n' });

  const exitCode = await runShellCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(0);
  expect(ctx.logged).toStrictEqual(['', '']);
  expect(ctx.output).toStrictEqual([]);
});

test('it fails with the findings of both shellcheck and shfmt', async () => {
  const ctx = await setupTest();

  await ctx.trackFiles({
    'unquoted.sh': '#!/usr/bin/env bash\necho $1\n',
    'cramped.sh': '#!/usr/bin/env bash\nif true;then echo "a";fi\n',
  });

  const exitCode = await runShellCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.stringContaining('SC2086'),
    expect.stringContaining('+++ cramped.sh'),
  ]);

  expect(ctx.output).toStrictEqual([]);
});

test('it fails when only shellcheck rejects a script', async () => {
  const ctx = await setupTest();

  // shfmt leaves this script as it is, and shellcheck rejects the unquoted $1.
  await ctx.trackFiles({ 'unquoted.sh': '#!/usr/bin/env bash\necho $1\n' });

  const exitCode = await runShellCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);
  expect(ctx.logged).toStrictEqual([expect.stringContaining('SC2086'), '']);
});

test('it fails when only shfmt rejects a script', async () => {
  const ctx = await setupTest();

  // shellcheck accepts this script, and shfmt would space it out.
  await ctx.trackFiles({ 'cramped.sh': '#!/usr/bin/env bash\nif true;then echo "a";fi\n' });

  const exitCode = await runShellCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);
  expect(ctx.logged).toStrictEqual(['', expect.stringContaining('+++ cramped.sh')]);
});

test('it passes with a note when the repo tracks no shell script', async () => {
  const ctx = await setupTest();

  const exitCode = await runShellCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(0);
  expect(ctx.logged).toStrictEqual([]);
  expect(ctx.output).toStrictEqual(['shell: the repo tracks no shell script\n']);
});
