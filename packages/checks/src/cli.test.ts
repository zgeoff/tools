import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// A git repo in a temp folder, and the entry module that zgeoff-check runs. Every process gets a
// clean environment, so a GIT_DIR that a pre-push hook exports cannot point git at this repo.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'zgeoff-check-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init --quiet`.cwd(dir).env(env);

  return { dir, env, cli: join(import.meta.dir, 'cli.ts') };
}

test('it exits 0 and prints nothing when no check finds a problem', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await $`git add clean.sh`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it exits 1 and prints each finding as path:line: check: message', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add unquoted.sh`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'unquoted.sh:2: shell: shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]\n',
    stderr: '',
  });
});

test('it checks only the files given on the command line', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');
  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add clean.sh unquoted.sh`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} clean.sh`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 0 over a failing file when the config turns its check off with a reason', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.dir, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell', reason: 'the scripts are vendored' }] }),
  );

  await $`git add unquoted.sh zgeoff-check.json`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 2 and runs no check when a config entry turns a check off with no reason', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.dir, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell' }] }),
  );

  await $`git add unquoted.sh zgeoff-check.json`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'zgeoff-check: zgeoff-check.json: off[0] turns off shell with no reason; give one in reason\n',
  });
});

test('it exits 2 with the install message when the PATH lacks shellcheck', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await $`git add clean.sh`.cwd(ctx.dir).env(ctx.env);

  // The file list skips git, so a PATH with no program on it reaches the check.
  const result = await $`${process.execPath} ${ctx.cli} clean.sh`
    .cwd(ctx.dir)
    .env({ ...ctx.env, PATH: ctx.dir })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'zgeoff-check: shell: shellcheck is not on the PATH, and the shell check needs it. Install shellcheck, then run zgeoff-check again.\n',
  });
});

test('it exits 2 on an unknown option', async () => {
  const ctx = await setupTest();

  const result = await $`${process.execPath} ${ctx.cli} --fix`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: unknown option --fix\n');
});

test('it exits 2 rather than print help when --help comes with files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add unquoted.sh`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} -- --help unquoted.sh`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: unknown option --help\n');
});

test('it checks a file whose name starts with a dash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, '-unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add -- -unquoted.sh`.cwd(ctx.dir).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} -unquoted.sh`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toStartWith('-unquoted.sh:2: shell: ');
});

test('it exits 2 with the reason when the config file cannot be read', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'zgeoff-check.json'));

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: ');
  expect(result.stderr.toString()).not.toInclude('    at ');
});

test('it exits 2 with the reason when git cannot list the files', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.dir, '.git'), { recursive: true });

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.dir)
    .env({ ...ctx.env, GIT_CEILING_DIRECTORIES: ctx.dir })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: git ls-files failed: ');
});
