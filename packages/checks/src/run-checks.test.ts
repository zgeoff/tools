import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { runChecks } from './run-checks.ts';
import type { Finding } from './types.ts';

// A git repo in a temp folder. Every git call gets a clean environment, so a GIT_DIR that a
// pre-push hook exports cannot point git at the repo this test runs in.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-checks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet`.cwd(directory).env(env);

  return { directory, env };
}

test('it gives a check the tracked files that match its glob', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.txt'), 'a\n');
  await writeFile(join(ctx.directory, 'b.md'), 'b\n');

  await $`git add a.txt b.md`.cwd(ctx.directory).env(ctx.env);

  await writeFile(join(ctx.directory, 'untracked.txt'), 'c\n');

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    cwd: ctx.directory,
    files: ['a.txt'],
    env: ctx.env,
  });
});

test('it gives a check only the listed files, as repo-relative paths, when a list is given', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.txt'), 'a\n');
  await writeFile(join(ctx.directory, 'b.txt'), 'b\n');

  await $`git add a.txt b.txt`.cwd(ctx.directory).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    files: ['./b.txt', 'gone.txt'],
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    cwd: ctx.directory,
    files: ['b.txt'],
    env: ctx.env,
  });
});

test('it skips a check that no file matches', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.md'), 'a\n');

  await $`git add a.md`.cwd(ctx.directory).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    env: ctx.env,
  });

  expect(check).not.toHaveBeenCalled();
});

test('it skips a check that the config turns off', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.txt'), 'a\n');

  await $`git add a.txt`.cwd(ctx.directory).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map([['text', 'the text files are generated']]) },
    env: ctx.env,
  });

  expect(check).not.toHaveBeenCalled();
});

test('it labels each finding with its check, sorted by path and line', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.txt'), 'a\n');
  await writeFile(join(ctx.directory, 'b.txt'), 'b\n');

  await $`git add a.txt b.txt`.cwd(ctx.directory).env(ctx.env);

  const findings = await runChecks({
    cwd: ctx.directory,
    checks: [
      {
        kind: 'files',
        name: 'text',
        glob: '**/*.txt',
        check: () => [
          { path: 'b.txt', line: 1, message: 'too short' },
          { path: 'a.txt', line: 9, message: 'too long' },
          { path: 'a.txt', line: 2, message: 'too short' },
        ],
      },
    ],
    config: { off: new Map() },
    env: ctx.env,
  });

  expect(findings).toStrictEqual([
    { check: 'text', path: 'a.txt', line: 2, message: 'too short' },
    { check: 'text', path: 'a.txt', line: 9, message: 'too long' },
    { check: 'text', path: 'b.txt', line: 1, message: 'too short' },
  ]);
});

test('it skips a listed file that no longer exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.txt'), 'a\n');

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    files: ['a.txt', 'gone.txt', 'a.txt/inner.txt'],
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    cwd: ctx.directory,
    files: ['a.txt'],
    env: ctx.env,
  });
});

test('it rejects the run when a tracked path cannot be read', async () => {
  const ctx = await setupTest();

  // A link to itself fails every read with ELOOP, which root's permissions cannot bypass the way
  // they bypass a folder without search permission.
  await symlink('loop.txt', join(ctx.directory, 'loop.txt'));

  await $`git add loop.txt`.cwd(ctx.directory).env(ctx.env);

  const check = mock((): Finding[] => []);

  expect(
    runChecks({
      cwd: ctx.directory,
      checks: [{ kind: 'files', name: 'text', glob: '**/*.txt', check }],
      config: { off: new Map() },
      env: ctx.env,
    }),
  ).rejects.toMatchObject({ code: 'ELOOP' });
});

test('it gives a branch check the merge base of HEAD and the default branch, whatever files the run lists', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const base = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'branch', name: 'history', check }],
    config: { off: new Map() },
    files: ['gone.txt'],
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({
    cwd: ctx.directory,
    base: base.trim(),
    env: ctx.env,
  });
});

test('it looks for no base when the config turns the branch check off', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const check = mock((): Finding[] => []);

  const findings = await runChecks({
    cwd: ctx.directory,
    checks: [{ kind: 'branch', name: 'history', check }],
    config: { off: new Map([['history', 'the repo has no remote']]) },
    env: ctx.env,
  });

  expect(findings).toStrictEqual([]);
  expect(check).not.toHaveBeenCalled();
});
