import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { isPathMatched, matchChangedFiles } from './match-changed-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-match-changed-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await mkdir(repo);

  // Commits a base, makes the change on a topic branch, and merges it into main with a merge
  // commit, as the pull request's merge ref holds it.
  const createMerge = async (change: () => Promise<void>) => {
    await writeTreeFiles(repo, {
      'README.md': '# app\n',
      'docker/app/Dockerfile': 'FROM scratch\n',
    });

    await $`git init -q -b main`.cwd(repo).env({ ...env });
    await $`git add -A`.cwd(repo).env({ ...env });
    await $`git commit -q -m base`.cwd(repo).env({ ...env });
    await $`git switch -q -c topic`.cwd(repo).env({ ...env });

    await change();

    await $`git add -A`.cwd(repo).env({ ...env });
    await $`git commit -q -m change`.cwd(repo).env({ ...env });
    await $`git switch -q main`.cwd(repo).env({ ...env });
    await $`git merge -q --no-ff -m merge topic`.cwd(repo).env({ ...env });
  };

  return { repo, env, createMerge };
}

test('it answers true when the pull request changes a file that a pattern matches', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(() =>
    writeTreeFiles(ctx.repo, { 'docker/app/Dockerfile': 'FROM alpine\n' }),
  );

  const answer = await matchChangedFiles({
    cwd: ctx.repo,
    env: ctx.env,
    event: 'pull_request',
    patterns: 'docker/**\n',
  });

  expect(answer).toStrictEqual({
    changed: true,
    matches: ['docker/app/Dockerfile matches docker/**'],
  });
});

test('it answers false when the pull request changes no file that a pattern matches', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(() => writeTreeFiles(ctx.repo, { 'README.md': '# app, renamed\n' }));

  const answer = await matchChangedFiles({
    cwd: ctx.repo,
    env: ctx.env,
    event: 'pull_request',
    patterns: 'docker/**\nflake.nix\n',
  });

  expect(answer).toStrictEqual({ changed: false, matches: [] });
});

test('it matches the old path of a file the pull request moves', async () => {
  const ctx = await setupTest();

  await ctx.createMerge(async () => {
    await mkdir(join(ctx.repo, 'archive'));
    await rename(join(ctx.repo, 'docker/app/Dockerfile'), join(ctx.repo, 'archive/Dockerfile'));
  });

  const answer = await matchChangedFiles({
    cwd: ctx.repo,
    env: ctx.env,
    event: 'pull_request',
    patterns: 'docker/**\n',
  });

  expect(answer).toStrictEqual({
    changed: true,
    matches: ['docker/app/Dockerfile matches docker/**'],
  });
});

test('it answers true on any event other than a pull request without reading the history', async () => {
  const ctx = await setupTest();

  const answer = await matchChangedFiles({
    cwd: ctx.repo,
    env: ctx.env,
    event: 'push',
    patterns: 'docker/**\n',
  });

  expect(answer).toStrictEqual({ changed: true, matches: [] });
});

test('it fails when the checkout lacks the base commit', async () => {
  const ctx = await setupTest();

  await $`git init -q`.cwd(ctx.repo).env({ ...ctx.env });

  const matching = matchChangedFiles({
    cwd: ctx.repo,
    env: ctx.env,
    event: 'pull_request',
    patterns: 'docker/**\n',
  });

  await expect(matching).rejects.toMatchObject({ exitCode: 128 });
});

test.each([
  ['a single star across folders', 'docker/app/Dockerfile', 'docker/*', true],
  ['a double star across folders', 'docker/app/Dockerfile', 'docker/**', true],
  ['a star inside a name', 'services/api/main.ts', 'services/*/main.ts', true],
  ['a path outside the pattern', 'README.md', 'docker/**', false],
  ['a question mark as one character', 'v1.yml', 'v?.yml', true],
  ['a question mark against two characters', 'v10.yml', 'v?.yml', false],
  ['a set of characters', 'b.txt', '[abc].txt', true],
  ['a character outside a set', 'd.txt', '[abc].txt', false],
  ['a negated set', 'd.txt', '[!abc].txt', true],
  ['a range', 'k.txt', '[a-m].txt', true],
  ['a dot as a literal', 'flakeXnix', 'flake.nix', false],
  ['an escaped star as a literal', 'a*b', String.raw`a\*b`, true],
  ['an escaped star against other text', 'axb', String.raw`a\*b`, false],
  ['an unclosed bracket as a literal', '[draft', '[draft', true],
])('it matches %s as bash does', (_label, path, pattern, expected) => {
  expect(isPathMatched(path, pattern)).toBe(expected);
});
