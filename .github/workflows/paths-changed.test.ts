import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { loadWorkflowStep } from './load-workflow-step.ts';
import { writeRepoFiles } from './write-repo-files.ts';

// A repo whose HEAD merges a branch into the base, as the checkout of a pull request's merge commit
// holds it, and the match step read from the workflow, so each test runs the step for real.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'paths-changed-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const output = join(directory, 'output');

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const match = await loadWorkflowStep(
    join(import.meta.dir, 'paths-changed.yml'),
    'changes',
    'Match changed files',
  );

  const createMerge = async (change: () => Promise<void>) => {
    await mkdir(repo);

    await writeRepoFiles(repo, {
      'README.md': '# app\n',
      'docker/app/Dockerfile': 'FROM scratch\n',
    });

    await $`git -C ${repo} init -q -b main && git -C ${repo} add -A && git -C ${repo} commit -q -m base`
      .env(env)
      .quiet();

    await $`git -C ${repo} switch -q -c topic`.env(env).quiet();

    await change();

    await $`git -C ${repo} add -A && git -C ${repo} commit -q -m change`.env(env).quiet();

    await $`git -C ${repo} switch -q main && git -C ${repo} merge -q --no-ff -m merge topic`
      .env(env)
      .quiet();
  };

  // The caller's event and inputs, resolved through the step's own env bindings.
  const runMatch = async (event: string, patterns: string) => {
    await writeFile(output, '');

    const contexts: Record<string, string> = {
      [`\${{ github.event_name }}`]: event,
      [`\${{ inputs.paths }}`]: patterns,
    };

    const result = await $`bash -c ${match.run}`
      .cwd(repo)
      .env({
        ...env,
        EVENT: contexts[match.env['EVENT'] ?? ''],
        PATTERNS: contexts[match.env['PATTERNS'] ?? ''],
        GITHUB_OUTPUT: output,
        RUNNER_TEMP: directory,
      })
      .quiet()
      .nothrow();

    return { exitCode: result.exitCode, output: await readFile(output, 'utf8') };
  };

  return { repo, matchID: match.id, createMerge, runMatch };
}

test('it answers true when the pull request changes a file that a pattern matches', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(() =>
    writeRepoFiles(ctx.repo, { 'docker/app/Dockerfile': 'FROM alpine\n' }),
  );

  const result = await ctx.runMatch('pull_request', 'docker/**\n');

  expect(result).toStrictEqual({ exitCode: 0, output: 'changed=true\n' });
});

test('it answers false when the pull request changes no file that a pattern matches', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(() => writeRepoFiles(ctx.repo, { 'README.md': '# app, renamed\n' }));

  const result = await ctx.runMatch('pull_request', 'docker/**\nflake.nix\n');

  expect(result).toStrictEqual({ exitCode: 0, output: 'changed=false\n' });
});

test('it matches a single star across folders', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(() =>
    writeRepoFiles(ctx.repo, { 'docker/app/Dockerfile': 'FROM alpine\n' }),
  );

  const result = await ctx.runMatch('pull_request', 'docker/*\n');

  expect(result).toStrictEqual({ exitCode: 0, output: 'changed=true\n' });
});

test('it matches the old path of a file the pull request moves', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(async () => {
    await mkdir(join(ctx.repo, 'archive'));
    await rename(join(ctx.repo, 'docker/app/Dockerfile'), join(ctx.repo, 'archive/Dockerfile'));
  });

  const result = await ctx.runMatch('pull_request', 'docker/**\n');

  expect(result).toStrictEqual({ exitCode: 0, output: 'changed=true\n' });
});

test('it answers true on any event other than a pull request without reading the history', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.repo);

  const result = await ctx.runMatch('push', 'docker/**\n');

  expect(result).toStrictEqual({ exitCode: 0, output: 'changed=true\n' });
});

test('it fails the step when the checkout lacks the base commit', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.repo);

  await $`git -C ${ctx.repo} init -q`.quiet();

  const result = await ctx.runMatch('pull_request', 'docker/**\n');

  expect(result).toStrictEqual({ exitCode: 128, output: '' });
});

test.each([
  ['true', 'a file that a pattern matches', 'docker/app/Dockerfile'],
  ['false', 'only a file that no pattern matches', 'README.md'],
])(
  'it exposes changed=%s to the caller when the pull request changes %s',
  async (expected, _label, path) => {
    const ctx = await setupTest();
    const text = await readFile(join(import.meta.dir, 'paths-changed.yml'), 'utf8');

    const workflow: unknown = Bun.YAML.parse(text);

    await ctx.createMerge(() => writeRepoFiles(ctx.repo, { [path]: 'changed\n' }));

    const result = await ctx.runMatch('pull_request', 'docker/**\n');

    expect(workflow).toMatchObject({
      on: {
        workflow_call: { outputs: { changed: { value: `\${{ jobs.changes.outputs.changed }}` } } },
      },
      jobs: { changes: { outputs: { changed: `\${{ steps.${ctx.matchID}.outputs.changed }}` } } },
    });

    expect(result).toStrictEqual({ exitCode: 0, output: `changed=${expected}\n` });
  },
);
