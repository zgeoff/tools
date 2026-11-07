import { expect, onTestFinished, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv, runGit, writeTreeFiles } from '@zgeoff/testing/helpers';
import { $ } from 'bun';
import { readRunFolderPrefix } from '../test-utils/read-run-folder-prefix.ts';

// The repo extends the delivered baseline as repo-sync writes it, and its memory-capped script runs
// the command it gets, so the baseline's typecheck job runs the repo's typecheck script.
async function setupTest() {
  const baselinePath = join(import.meta.dir, 'lefthook-pre-push.yml');
  const lefthookPath = join(import.meta.dir, '../../node_modules/.bin/lefthook');

  const repo = await mkdtemp(join(tmpdir(), readRunFolderPrefix('lefthook-pre-push-')));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  const gitEnv = readGitEnv(repo);

  await runGit(repo, gitEnv, ['init', '--quiet']);
  await mkdir(join(repo, '.lefthook'));
  await copyFile(baselinePath, join(repo, '.lefthook/pre-push-baseline.yml'));

  return {
    repo,
    runTypecheckJobs: async () => {
      const result =
        await $`${process.execPath} ${lefthookPath} run pre-push --job typecheck --job chex-typecheck --force`
          .cwd(repo)
          .env(gitEnv)
          .nothrow()
          .quiet();

      return { exitCode: result.exitCode, output: result.stdout.toString() };
    },
  };
}

test("it runs the repo's own pre-push typecheck job, and the baseline's chex-typecheck after it", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({
      scripts: { 'memory-capped': 'exec', typecheck: 'echo "baseline typecheck ran"' },
    }),
    'lefthook.yml':
      'extends:\n  - .lefthook/pre-push-baseline.yml\npre-push:\n  jobs:\n    - name: typecheck\n      run: echo "own typecheck ran"\n',
  });

  const result = await ctx.runTypecheckJobs();

  expect({
    exitCode: result.exitCode,
    typecheckLines: [...result.output.matchAll(/^(?:own|baseline) typecheck ran$/gmu)].map(
      (line) => line[0],
    ),
  }).toStrictEqual({
    exitCode: 0,
    typecheckLines: ['own typecheck ran', 'baseline typecheck ran'],
  });
});

test("it runs only the repo's own typecheck when the repo lists chex-typecheck under the hook's exclude_tags", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({
      scripts: { 'memory-capped': 'exec', typecheck: 'echo "baseline typecheck ran"' },
    }),
    'lefthook.yml':
      'extends:\n  - .lefthook/pre-push-baseline.yml\npre-push:\n  exclude_tags:\n    - chex-typecheck\n  jobs:\n    - name: typecheck\n      run: echo "own typecheck ran"\n',
  });

  const result = await ctx.runTypecheckJobs();

  expect({
    exitCode: result.exitCode,
    typecheckLines: [...result.output.matchAll(/^(?:own|baseline) typecheck ran$/gmu)].map(
      (line) => line[0],
    ),
  }).toStrictEqual({ exitCode: 0, typecheckLines: ['own typecheck ran'] });
});
