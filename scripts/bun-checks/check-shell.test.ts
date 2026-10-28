import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { runShellCheck } from './check-shell.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-check-shell-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  const trackFiles = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, files);

    await $`git add -- ${Object.keys(files)}`.cwd(repo).env({ ...env });
  };

  return { repo, env, trackFiles };
}

test('it passes tracked scripts that shellcheck and shfmt accept, and skips an untracked one', async () => {
  const ctx = await setupTest();

  await ctx.trackFiles({ 'scripts/greet.sh': '#!/usr/bin/env bash\necho "hi"\n' });

  await writeTreeFiles(ctx.repo, { 'untracked.sh': 'if true;then echo $1;fi\n' });

  const result = await runShellCheck({ cwd: ctx.repo, env: ctx.env });

  expect(result).toStrictEqual({ exitCode: 0, output: '' });
});

test('it fails with the findings of both shellcheck and shfmt', async () => {
  const ctx = await setupTest();

  await ctx.trackFiles({
    'unquoted.sh': '#!/usr/bin/env bash\necho $1\n',
    'cramped.sh': '#!/usr/bin/env bash\nif true;then echo "a";fi\n',
  });

  const result = await runShellCheck({ cwd: ctx.repo, env: ctx.env });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('SC2086');
  expect(result.output).toInclude('+++ cramped.sh');
});

test('it fails when only shellcheck rejects a script', async () => {
  const ctx = await setupTest();

  // shfmt leaves this script as it is, and shellcheck rejects the unquoted $1.
  await ctx.trackFiles({ 'unquoted.sh': '#!/usr/bin/env bash\necho $1\n' });

  const result = await runShellCheck({ cwd: ctx.repo, env: ctx.env });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('SC2086');
  expect(result.output).not.toInclude('+++ unquoted.sh');
});

test('it fails when only shfmt rejects a script', async () => {
  const ctx = await setupTest();

  // shellcheck accepts this script, and shfmt would space it out.
  await ctx.trackFiles({ 'cramped.sh': '#!/usr/bin/env bash\nif true;then echo "a";fi\n' });

  const result = await runShellCheck({ cwd: ctx.repo, env: ctx.env });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('+++ cramped.sh');
  expect(result.output).not.toInclude('SC');
});

test('it passes with a note when the repo tracks no shell script', async () => {
  const ctx = await setupTest();
  const result = await runShellCheck({ cwd: ctx.repo, env: ctx.env });

  expect(result).toStrictEqual({ exitCode: 0, output: 'shell: the repo tracks no shell script\n' });
});
