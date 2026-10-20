import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// A git repo in a temp folder, and the entry module that zgeoff-check runs. Every process gets a
// clean environment, so a GIT_DIR that a pre-push hook exports cannot point git at this repo. An
// empty first commit stands for origin's default branch, so the branch has a base and no commits.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'zgeoff-check-'));

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
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(directory).env(env);
  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(directory).env(env);

  return { directory, env, cli: join(import.meta.dir, 'cli.ts') };
}

test('it exits 0 and prints nothing when no check finds a problem', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await $`git add clean.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
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

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add unquoted.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
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

  await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');
  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add clean.sh unquoted.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} clean.sh`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 0 over a failing file when the config turns its check off with a reason', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.directory, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell', reason: 'the scripts are vendored' }] }),
  );

  await $`git add unquoted.sh zgeoff-check.json`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 2 and runs no check when a config entry turns a check off with no reason', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.directory, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell' }] }),
  );

  await $`git add unquoted.sh zgeoff-check.json`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
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

  await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await $`git add clean.sh`.cwd(ctx.directory).env(ctx.env);

  // The file list skips git, so a PATH with no program on it reaches the check.
  const result = await $`${process.execPath} ${ctx.cli} clean.sh`
    .cwd(ctx.directory)
    .env({ ...ctx.env, PATH: ctx.directory })
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
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toInclude('--fix');
});

test('it exits 2 rather than print help when --help comes with files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add unquoted.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} -- --help unquoted.sh`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: --help takes no files\n');
});

test('it checks a file whose name starts with a dash when the path says so', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, '-unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add -- -unquoted.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} ./-unquoted.sh`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toStartWith('-unquoted.sh:2: shell: ');
});

test('it exits 2 with the reason when the config file cannot be read', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'zgeoff-check.json'));

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: ');
  expect(result.stderr.toString()).not.toInclude('    at ');
});

test('it exits 2 with the reason when git cannot list the files', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.directory, '.git'), { recursive: true });

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
    .env({ ...ctx.env, GIT_CEILING_DIRECTORIES: ctx.directory })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toStartWith('zgeoff-check: git ls-files failed: ');
});

test.each([['shellcheck'], ['shfmt']])(
  'it exits 2 with the reason when %s fails without a finding',
  async (program) => {
    const ctx = await setupTest();

    await writeFile(join(ctx.directory, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');
    await mkdir(join(ctx.directory, 'bin'));

    await writeFile(
      join(ctx.directory, 'bin', program),
      '#!/bin/sh\necho "out of memory" >&2\nexit 2\n',
    );

    await chmod(join(ctx.directory, 'bin', program), 0o755);

    const result = await $`${process.execPath} ${ctx.cli} clean.sh`
      .cwd(ctx.directory)
      .env({ ...ctx.env, PATH: `${join(ctx.directory, 'bin')}:${ctx.env.PATH}` })
      .nothrow()
      .quiet();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    }).toStrictEqual({
      exitCode: 2,
      stdout: '',
      stderr: `zgeoff-check: shell: ${program} failed: out of memory\n`,
    });
  },
);

// Each stand-in fails after a finding is already in: the shellcheck one prints a finding of its own
// first, and the shfmt one runs after the real shellcheck has reported unquoted.sh.
test.each([
  [
    'shellcheck',
    String.raw`printf 'unquoted.sh:2:6: note: Double quote to prevent globbing and word splitting. [SC2086]\n'`,
  ],
  ['shfmt', 'true'],
])('it exits 2 and prints no finding when %s fails after a finding', async (program, firstLine) => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'unquoted.sh'), '#!/usr/bin/env bash\necho $1\n');
  await mkdir(join(ctx.directory, 'bin'));

  await writeFile(
    join(ctx.directory, 'bin', program),
    `#!/bin/sh\n${firstLine}\necho "out of memory" >&2\nexit 2\n`,
  );

  await chmod(join(ctx.directory, 'bin', program), 0o755);

  const result = await $`${process.execPath} ${ctx.cli} unquoted.sh`
    .cwd(ctx.directory)
    .env({ ...ctx.env, PATH: `${join(ctx.directory, 'bin')}:${ctx.env.PATH}` })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: `zgeoff-check: shell: ${program} failed: out of memory\n`,
  });
});

test('it lists the whole repo and prints root paths when it runs from a subfolder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'top.sh'), '#!/usr/bin/env bash\necho $1\n');
  await writeFile(join(ctx.directory, 'scripts/deep.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add top.sh scripts/deep.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(join(ctx.directory, 'scripts'))
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: [
      'scripts/deep.sh:2: shell: shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]',
      'top.sh:2: shell: shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]',
      '',
    ].join('\n'),
  });
});

test('it reads a file argument from the subfolder it runs in', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'scripts/deep.sh'), '#!/usr/bin/env bash\necho $1\n');

  await $`git add scripts/deep.sh`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli} deep.sh`
    .cwd(join(ctx.directory, 'scripts'))
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.stdout.toString()).toStartWith('scripts/deep.sh:2: shell: ');
});

test('it reads the root config when it runs from a subfolder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, 'scripts/deep.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.directory, 'zgeoff-check.json'),
    JSON.stringify({ off: [{ check: 'shell', reason: 'the scripts are vendored' }] }),
  );

  await $`git add scripts/deep.sh zgeoff-check.json`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(join(ctx.directory, 'scripts'))
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

test('it exits 1 and prints each problem of a commit that is not a Conventional Commit at its hash', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const hash = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  // `bun run check` puts the repo's node_modules/.bin, which holds commitlint, on the PATH.
  const bin = join(import.meta.dir, '../../../node_modules/.bin');

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
    .env({ ...ctx.env, PATH: `${bin}:${ctx.env.PATH}` })
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: [
      `${hash.trim()}:1: commits: commitlint: subject may not be empty [subject-empty]`,
      `${hash.trim()}:1: commits: commitlint: type may not be empty [type-empty]`,
      '',
    ].join('\n'),
    stderr: '',
  });
});

test('it exits 2 with the reason when the branch has no base', async () => {
  const ctx = await setupTest();

  await $`git update-ref -d refs/remotes/origin/main`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${ctx.cli}`
    .cwd(ctx.directory)
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
      'zgeoff-check: cannot find the base of this branch: no merge base between HEAD and origin/main (is the remote fetched?)\n',
  });
});
