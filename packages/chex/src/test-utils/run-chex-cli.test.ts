import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv } from '@zgeoff/std/test-utils/read-git-env';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';
import { $ } from 'bun';
import { runChexCLI } from './run-chex-cli.ts';

async function setupTest() {
  const repo = await mkdtemp(join(tmpdir(), `run-chex-cli-pid${process.pid}-`));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  const env = readGitEnv(repo);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  return { repo, env, chexBin: join(import.meta.dir, '../../src/cli.ts') };
}

test('it runs the chex bin with the arguments and returns its last line', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nThe kettle boils water.\n' });

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['prose', 'README.md']);

  expect({ exitCode: run.exitCode, lastLine: run.lastLine }).toStrictEqual({
    exitCode: 0,
    lastLine: 'cleared: prose',
  });
});

test('it returns the exit code and stderr of a run chex refuses', async () => {
  const ctx = await setupTest();
  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['spelling']);

  expect({ exitCode: run.exitCode, stdout: run.stdout }).toStrictEqual({ exitCode: 2, stdout: '' });
  expect(run.stderr).toStartWith('chex: unknown check "spelling"\n');
});
