import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv } from '@zgeoff/std/test-utils/read-git-env';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';
import { $ } from 'bun';
import { buildInitGuardHooks } from '../src/test-utils/build-init-guard-hooks.ts';
import { commitAllFiles } from '../src/test-utils/commit-all-files.ts';
import { getChexE2EPack } from '../src/test-utils/get-chex-e2e-pack.ts';
import { runChexCLI } from '../src/test-utils/run-chex-cli.ts';

// The repo has an origin and a feature branch, as a pushed branch does.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `chex-cli-${process.pid}-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'repo');
  const origin = join(directory, 'upstream.git');

  await $`git init --quiet --bare --initial-branch=main ${origin}`.env({ ...env });
  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(repo).env({ ...env });
  await $`git remote add origin ${origin}`.cwd(repo).env({ ...env });
  await $`git push --quiet -u origin main`.cwd(repo).env({ ...env });
  await $`git switch --quiet -c feature`.cwd(repo).env({ ...env });

  return { repo, env, chexBin: getChexE2EPack(process.env).binPath };
}

test('it prints cleared and exits 0 when the check passes', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nThe kettle boils water.\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the readme');

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['prose']);

  expect({ exitCode: run.exitCode, lastLine: run.lastLine }).toStrictEqual({
    exitCode: 0,
    lastLine: 'cleared: prose',
  });
});

test('it prints each check of a list on its own line and exits 1 when one bounces', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the readme');

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['length', 'links']);

  expect({ exitCode: run.exitCode, stdout: run.stdout }).toStrictEqual({
    exitCode: 1,
    stdout: expect.stringMatching(/cleared: length\n[\s\S]*bounced: links\n$/u),
  });
});

test('it writes lefthook.yml and the check:docs script to disk for init', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({
      name: 'kettle',
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    }),
  });

  const run = await runChexCLI(ctx.chexBin, ctx.repo, ctx.env, ['init']);
  const lefthook = await Bun.file(join(ctx.repo, 'lefthook.yml')).text();
  const packageJSON: unknown = await Bun.file(join(ctx.repo, 'package.json')).json();

  expect(run.exitCode).toBe(0);

  expect(lefthook).toBe(
    `extends:
  - node_modules/@zgeoff/chex/lefthook.yml
${buildInitGuardHooks()}`,
  );

  expect(packageJSON).toStrictEqual({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    scripts: { 'check:docs': 'chex prose length links skill' },
  });
});
