import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { MissingProgramError } from '../missing-program-error.ts';
import { commitsCheck } from './commits-check.ts';

// A git repo in a temp folder whose first commit stands for the base branch. The tests run the real
// commitlint from the workspace's node_modules/.bin, which `bun run` puts on the PATH of a repo.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'commits-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(import.meta.dir, '../../../../node_modules/.bin');
  const path = `${bin}:${process.env['PATH']}`;

  invariant(Bun.which('commitlint', { PATH: path }) !== null, 'run bun install to get commitlint');

  const env = {
    PATH: path,
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet --initial-branch=main`.cwd(directory).env(env);
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(directory).env(env);

  const baseText = await $`git rev-parse HEAD`.cwd(directory).env(env).text();

  const base = baseText.trim();

  return { directory, env, base };
}

test('it passes a branch whose commits are all Conventional Commits', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'fix(greeting): spell the name right\n\nThe name lost a letter.'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const findings = await commitsCheck.check({ cwd: ctx.directory, base: ctx.base, env: ctx.env });

  expect(findings).toStrictEqual([]);
});

test('it reports each problem of a commit that is not a Conventional Commit at its hash', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const hash = hashText.trim();

  const findings = await commitsCheck.check({ cwd: ctx.directory, base: ctx.base, env: ctx.env });

  expect(findings).toStrictEqual([
    { path: hash, line: 1, message: 'commitlint: subject may not be empty [subject-empty]' },
    { path: hash, line: 1, message: 'commitlint: type may not be empty [type-empty]' },
  ]);
});

test('it reports a commit that is not a Conventional Commit when a later commit is', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const findings = await commitsCheck.check({ cwd: ctx.directory, base: ctx.base, env: ctx.env });

  expect(findings).toStrictEqual([
    {
      path: hashText.trim(),
      line: 1,
      message: 'commitlint: subject may not be empty [subject-empty]',
    },
    { path: hashText.trim(), line: 1, message: 'commitlint: type may not be empty [type-empty]' },
  ]);
});

test('it lints with @zgeoff/commitlint-config, not a commitlint config in the repo', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'commitlint.config.js'),
    "export default { rules: { 'header-max-length': [2, 'always', 200] } };\n",
  );

  await $`git add commitlint.config.js`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet -m ${'Add a lenient commitlint config'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const hash = hashText.trim();

  const findings = await commitsCheck.check({ cwd: ctx.directory, base: ctx.base, env: ctx.env });

  expect(findings).toStrictEqual([
    { path: hash, line: 1, message: 'commitlint: header must be lower-case [header-case]' },
    { path: hash, line: 1, message: 'commitlint: subject may not be empty [subject-empty]' },
    { path: hash, line: 1, message: 'commitlint: type may not be empty [type-empty]' },
  ]);
});

test('it reads only the commits after the base', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const base = baseText.trim();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const findings = await commitsCheck.check({ cwd: ctx.directory, base, env: ctx.env });

  expect(findings).toStrictEqual([]);
});

test('it leaves out a merge commit', async () => {
  const ctx = await setupTest();

  await $`git switch --quiet -c side`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the side greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git switch --quiet main`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the main greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git merge --quiet --no-ff -m ${'Merged the side work.'} side`
    .cwd(ctx.directory)
    .env(ctx.env);

  const findings = await commitsCheck.check({ cwd: ctx.directory, base: ctx.base, env: ctx.env });

  expect(findings).toStrictEqual([]);
});

test('it names commitlint when the branch has a commit and the PATH lacks commitlint', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const gitPath = Bun.which('git');

  invariant(gitPath !== null, 'git must be on the PATH to run this test');

  await $`ln -s ${gitPath} ${join(ctx.directory, 'git')}`.quiet();

  expect(() =>
    commitsCheck.check({
      cwd: ctx.directory,
      base: ctx.base,
      env: { ...ctx.env, PATH: ctx.directory },
    }),
  ).toThrowWithMessage(
    MissingProgramError,
    'commits: commitlint is not on the PATH, and the commits check needs it. Install commitlint, then run zgeoff-check again.',
  );
});
