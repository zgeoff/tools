import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProgram } from '@zgeoff/rig/e2e';
import { readGitEnv, readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { run } from '@zgeoff/testing/process';
import { $ } from 'bun';
import { buildInitGuardHooks } from '../src/test-utils/build-init-guard-hooks.ts';
import { commitAllFiles } from '../src/test-utils/commit-all-files.ts';

// The repo has an origin and a feature branch, as a pushed branch does.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('chex-cli-')));

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

  const chex = await resolveProgram('chex');

  return {
    repo,
    env,
    runChex: async (args: readonly string[], stepEnv: Readonly<Record<string, string>> = {}) => {
      const result = await run(chex.command, { args, cwd: repo, env: { ...env, ...stepEnv } });

      return { ...result, lastLine: result.stdout.trimEnd().split('\n').at(-1) };
    },
  };
}

test('it prints cleared and exits 0 when the check passes', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nThe kettle boils water.\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the readme');

  const result = await ctx.runChex(['prose']);

  expect({ exitCode: result.exitCode, lastLine: result.lastLine }).toStrictEqual({
    exitCode: 0,
    lastLine: 'cleared: prose',
  });
});

test('it prints each check of a list on its own line and exits 1 when one bounces', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, { 'README.md': '# Kettle\n\nRead the [guide](./guide.md).\n' });
  await commitAllFiles(ctx.repo, ctx.env, 'docs: add the readme');

  const result = await ctx.runChex(['length', 'links']);

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
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

  const result = await ctx.runChex(['init']);
  const lefthook = await Bun.file(join(ctx.repo, 'lefthook.yml')).text();
  const packageJSON: unknown = await Bun.file(join(ctx.repo, 'package.json')).json();

  expect(result.exitCode).toBe(0);

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

test('it writes the check plan of the repo to the step outputs for ci-plan', async () => {
  const ctx = await setupTest();

  const outputPath = join(ctx.repo, '..', 'output');

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({
      scripts: { lint: 'true', test: 'true', 'check:docs': 'chex prose links' },
    }),
  });

  const result = await ctx.runChex(['ci-plan'], {
    GITHUB_OUTPUT: outputPath,
    PART: 'static',
    SCRIPTS: 'lint test',
    LANE: '',
  });

  const output = await readFile(outputPath, 'utf8');

  expect({ exitCode: result.exitCode, output }).toStrictEqual({
    exitCode: 0,
    output: [
      'scripts= lint ',
      'static= lint ',
      'test= test ',
      'lanes=[]',
      'docs= prose links ',
      '',
    ].join('\n'),
  });
});

test('it exits 1 with an error annotation and writes no outputs when ci-plan lists a missing script', async () => {
  const ctx = await setupTest();

  const outputPath = join(ctx.repo, '..', 'output');

  await writeTreeFiles(ctx.repo, {
    'package.json': JSON.stringify({ scripts: { lint: 'true' } }),
  });

  const result = await ctx.runChex(['ci-plan'], {
    GITHUB_OUTPUT: outputPath,
    PART: 'static',
    SCRIPTS: 'missing',
    LANE: '',
  });

  const wroteOutputs = await Bun.file(outputPath).exists();

  expect({ exitCode: result.exitCode, stdout: result.stdout, wroteOutputs }).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::package.json defines no script named: missing. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.\n',
    wroteOutputs: false,
  });
});
