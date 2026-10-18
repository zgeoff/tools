import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { runChecks } from './run-checks.ts';
import type { Finding } from './types.ts';

// A git repo in a temp folder. Every git call gets a clean environment, so a GIT_DIR that a
// pre-push hook exports cannot point git at the repo this test runs in.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'run-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init --quiet`.cwd(dir).env(env);

  return { dir, env };
}

test('it gives a check the tracked files that match its glob', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.txt'), 'a\n');
  await writeFile(join(ctx.dir, 'b.md'), 'b\n');

  await $`git add a.txt b.md`.cwd(ctx.dir).env(ctx.env);

  await writeFile(join(ctx.dir, 'untracked.txt'), 'c\n');

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.dir,
    checks: [{ name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({ cwd: ctx.dir, files: ['a.txt'], env: ctx.env });
});

test('it gives a check only the listed files, as repo-relative paths, when a list is given', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.txt'), 'a\n');
  await writeFile(join(ctx.dir, 'b.txt'), 'b\n');

  await $`git add a.txt b.txt`.cwd(ctx.dir).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.dir,
    checks: [{ name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    files: ['./b.txt', 'gone.txt'],
    env: ctx.env,
  });

  expect(check).toHaveBeenCalledExactlyOnceWith({ cwd: ctx.dir, files: ['b.txt'], env: ctx.env });
});

test('it skips a check that no file matches', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.md'), 'a\n');

  await $`git add a.md`.cwd(ctx.dir).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.dir,
    checks: [{ name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map() },
    env: ctx.env,
  });

  expect(check).not.toHaveBeenCalled();
});

test('it skips a check that the config turns off', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.txt'), 'a\n');

  await $`git add a.txt`.cwd(ctx.dir).env(ctx.env);

  const check = mock((): Finding[] => []);

  await runChecks({
    cwd: ctx.dir,
    checks: [{ name: 'text', glob: '**/*.txt', check }],
    config: { off: new Map([['text', 'the text files are generated']]) },
    env: ctx.env,
  });

  expect(check).not.toHaveBeenCalled();
});

test('it labels each finding with its check, sorted by path and line', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'a.txt'), 'a\n');
  await writeFile(join(ctx.dir, 'b.txt'), 'b\n');

  await $`git add a.txt b.txt`.cwd(ctx.dir).env(ctx.env);

  const findings = await runChecks({
    cwd: ctx.dir,
    checks: [
      {
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
