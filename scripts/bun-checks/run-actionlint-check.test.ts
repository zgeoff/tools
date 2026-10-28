import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runActionlintCheck } from './run-actionlint-check.ts';

async function setupTest() {
  invariant(Bun.which('actionlint') !== null, 'install actionlint');

  const directory = await mkdtemp(join(import.meta.dir, '.test-run-actionlint-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

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

  return { repo, env, logged, runLogged, output, writeOutput };
}

test('it fails with the actionlint error of a workflow', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    '.github/workflows/greet.yml':
      'on: push\njobs:\n  greet:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  });

  const exitCode = await runActionlintCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
    today: '20261028',
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.stringContaining('job "greet" needs job "build" which does not exist'),
  ]);

  expect(ctx.output).toStrictEqual([]);
});

test('it passes a concurrency queue key before the ignore expires', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    '.github/workflows/publish.yml': [
      'on: push',
      'jobs:',
      '  publish:',
      '    runs-on: ubuntu-latest',
      '    concurrency:',
      '      group: publish',
      '      cancel-in-progress: false',
      '      queue: max',
      '    steps:',
      '      - run: echo hi',
      '',
    ].join('\n'),
  });

  const exitCode = await runActionlintCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
    today: '20270121',
  });

  expect(exitCode).toBe(0);
  expect(ctx.logged).toStrictEqual(['']);
  expect(ctx.output).toStrictEqual([]);
});

test('it fails on a concurrency queue key once the ignore expires', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    '.github/workflows/publish.yml': [
      'on: push',
      'jobs:',
      '  publish:',
      '    runs-on: ubuntu-latest',
      '    concurrency:',
      '      group: publish',
      '      cancel-in-progress: false',
      '      queue: max',
      '    steps:',
      '      - run: echo hi',
      '',
    ].join('\n'),
  });

  // This repo's own actionlint config sits beside the workflow, so the expiry holds in tools too.
  await cp(
    join(import.meta.dir, '../../.github/actionlint.yaml'),
    join(ctx.repo, '.github/actionlint.yaml'),
  );

  const exitCode = await runActionlintCheck({
    cwd: ctx.repo,
    env: ctx.env,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
    today: '20270122',
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.stringContaining('unexpected key "queue" for "concurrency" section'),
  ]);

  expect(ctx.output).toStrictEqual([
    '::warning::workflows: the ignore of the concurrency queue key expired on 20270122; move the actionlint pin to a release with rhysd/actionlint#654\n',
  ]);
});
