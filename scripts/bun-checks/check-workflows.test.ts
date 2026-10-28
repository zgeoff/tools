import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { runWorkflowsCheck } from './check-workflows.ts';

async function setupTest() {
  invariant(Bun.which('actionlint') !== null, 'install actionlint');

  const directory = await mkdtemp(join(import.meta.dir, '.test-check-workflows-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  return { repo, env };
}

test('it fails with the actionlint error of a workflow', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repo, {
    '.github/workflows/greet.yml':
      'on: push\njobs:\n  greet:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  });

  const result = await runWorkflowsCheck({ cwd: ctx.repo, env: ctx.env, today: '20261028' });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('job "greet" needs job "build" which does not exist');
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

  const result = await runWorkflowsCheck({ cwd: ctx.repo, env: ctx.env, today: '20270121' });

  expect(result).toStrictEqual({ exitCode: 0, output: '' });
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

  const result = await runWorkflowsCheck({ cwd: ctx.repo, env: ctx.env, today: '20270122' });

  expect(result.exitCode).toBe(1);

  expect(result.output).toInclude(
    '::warning::workflows: the ignore of the concurrency queue key expired on 20270122',
  );

  expect(result.output).toInclude('unexpected key "queue" for "concurrency" section');
});
