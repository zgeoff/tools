import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { runCommitsCheck } from './run-commits-check.ts';
import { runProgram } from './run-program.ts';

// A repo in a temp folder whose node_modules is the workspace's, so the check finds the real
// commitlint and @zgeoff/commitlint-config there, as it does in a repo that installs both.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-commits-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await symlink(join(import.meta.dir, '../../node_modules'), join(directory, 'node_modules'));

  const env = {
    PATH: process.env['PATH'],
    HOME: directory,

    // mise finds its config and tools under HOME, so under a fake HOME its node and actionlint shims
    // fail; the real config is also global, which mise trusts without a prompt.
    MISE_CONFIG_DIR:
      process.env['MISE_CONFIG_DIR'] ??
      join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'mise'),
    MISE_DATA_DIR:
      process.env['MISE_DATA_DIR'] ??
      join(process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local/share'), 'mise'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test Author',
    GIT_AUTHOR_EMAIL: 'author@example.com',
    GIT_COMMITTER_NAME: 'Test Author',
    GIT_COMMITTER_EMAIL: 'author@example.com',
  };

  await $`git init --quiet --initial-branch=main`.cwd(directory).env(env);

  return {
    directory,
    env,
    commitlint: join(directory, 'node_modules/.bin/commitlint'),
    config: Bun.resolveSync('@zgeoff/commitlint-config', directory),
  };
}

test('it passes a branch whose commits are all Conventional Commits', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'fix(greeting): spell the name right\n\nThe name lost a letter.'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([]);
});

test('it reports each problem of a commit that is not a Conventional Commit at its hash', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const hash = hashText.trim();

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([
    `commit ${hash}: subject may not be empty [subject-empty]`,
    `commit ${hash}: type may not be empty [type-empty]`,
  ]);
});

test('it reports a commit that is not a Conventional Commit when a later commit is', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.directory).env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([
    `commit ${hashText.trim()}: subject may not be empty [subject-empty]`,
    `commit ${hashText.trim()}: type may not be empty [type-empty]`,
  ]);
});

test('it lints with @zgeoff/commitlint-config, not a commitlint config in the repo', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

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

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([
    `commit ${hash}: header must be lower-case [header-case]`,
    `commit ${hash}: subject may not be empty [subject-empty]`,
    `commit ${hash}: type may not be empty [type-empty]`,
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

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base,
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([]);
});

test('it leaves out a merge commit', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const baseText = await $`git rev-parse HEAD`.cwd(ctx.directory).env(ctx.env).text();

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

  const problems = runCommitsCheck({
    cwd: ctx.directory,
    runProgram,
    base: baseText.trim(),
    env: ctx.env,
    commitlint: ctx.commitlint,
    config: ctx.config,
  });

  expect(problems).toStrictEqual([]);
});

test('it prints a skip notice and exits 0 when the repo installs no commitlint', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.directory, 'node_modules'));

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env({ ...ctx.env, PATH: dirname(Bun.which('git') ?? '') })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      'commits: skipped, because the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it\n',
  });
});

test('it prints a skip notice and exits 0 when the repo installs commitlint but not @zgeoff/commitlint-config', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.directory, 'node_modules'));
  await mkdir(join(ctx.directory, 'node_modules/.bin'), { recursive: true });

  await symlink(
    join(import.meta.dir, '../../node_modules/.bin/commitlint'),
    join(ctx.directory, 'node_modules/.bin/commitlint'),
  );

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      'commits: skipped, because the repo does not install @zgeoff/commitlint-config; add it as a devDependency to run it\n',
  });
});

test('it prints each problem and exits 1 when run as a script', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: Add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const hashText = await $`git rev-parse --short HEAD`.cwd(ctx.directory).env(ctx.env).text();

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout: `commit ${hashText.trim()}: header must be lower-case [header-case]\ncommit ${hashText.trim()}: subject must be lower-case [subject-case]\n`,
  });
});

test('it prints the skip as a GitHub notice and exits 0 when run as a script in Actions', async () => {
  const ctx = await setupTest();

  await rm(join(ctx.directory, 'node_modules'));

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env({ ...ctx.env, PATH: dirname(Bun.which('git') ?? ''), GITHUB_ACTIONS: 'true' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      '::notice::commits: skipped, because the repo does not install commitlint; add @commitlint/cli and @zgeoff/commitlint-config as devDependencies to run it\n',
  });
});

test('it exits 2 with the error of commitlint when commitlint refuses a config with no rules', async () => {
  const ctx = await setupTest();

  // The repo's own install: the real commitlint, and a @zgeoff/commitlint-config with no rules.
  await rm(join(ctx.directory, 'node_modules'));
  await mkdir(join(ctx.directory, 'node_modules/.bin'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules/@zgeoff/commitlint-config'), { recursive: true });

  const commitlint = await realpath(join(import.meta.dir, '../../node_modules/.bin/commitlint'));

  await symlink(commitlint, join(ctx.directory, 'node_modules/.bin/commitlint'));

  await writeFile(
    join(ctx.directory, 'node_modules/@zgeoff/commitlint-config/package.json'),
    JSON.stringify({ name: '@zgeoff/commitlint-config', type: 'module', exports: './index.js' }),
  );

  await writeFile(
    join(ctx.directory, 'node_modules/@zgeoff/commitlint-config/index.js'),
    'export default {};\n',
  );

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const stderr = result.stderr.toString();

  expect(result.exitCode).toBe(2);
  expect(stderr).toStartWith('commits: commitlint failed: ');
  expect(stderr).toInclude('Please add rules');
});

test('it exits 2 when commitlint crashes with exit 1 and reports no problem', async () => {
  const ctx = await setupTest();

  // The repo's own install: the real commitlint, and a @zgeoff/commitlint-config that throws.
  await rm(join(ctx.directory, 'node_modules'));
  await mkdir(join(ctx.directory, 'node_modules/.bin'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules/@zgeoff/commitlint-config'), { recursive: true });

  const commitlint = await realpath(join(import.meta.dir, '../../node_modules/.bin/commitlint'));

  await symlink(commitlint, join(ctx.directory, 'node_modules/.bin/commitlint'));

  await writeFile(
    join(ctx.directory, 'node_modules/@zgeoff/commitlint-config/package.json'),
    JSON.stringify({ name: '@zgeoff/commitlint-config', type: 'module', exports: './index.js' }),
  );

  await writeFile(
    join(ctx.directory, 'node_modules/@zgeoff/commitlint-config/index.js'),
    "throw new Error('the greeting config cannot load');\n",
  );

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  await $`git commit --quiet --allow-empty -m ${'feat: add the greeting'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const stderr = result.stderr.toString();

  expect(result.exitCode).toBe(2);
  expect(stderr).toStartWith('commits: commitlint failed: ');
  expect(stderr).toInclude('the greeting config cannot load');
});

test('it throws the git log error when the base is not a commit', async () => {
  const ctx = await setupTest();

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  expect(() =>
    runCommitsCheck({
      cwd: ctx.directory,
      runProgram,
      base: 'no-such-greeting',
      env: ctx.env,
      commitlint: ctx.commitlint,
      config: ctx.config,
    }),
  ).toThrow(/^git log failed: fatal: ambiguous argument 'no-such-greeting\.\.HEAD'/u);
});

test('it exits 2 when the repo installs a @zgeoff/commitlint-config that does not resolve', async () => {
  const ctx = await setupTest();

  // The repo's own install: the real commitlint, and a config whose export names no file.
  await rm(join(ctx.directory, 'node_modules'));
  await mkdir(join(ctx.directory, 'node_modules/.bin'), { recursive: true });
  await mkdir(join(ctx.directory, 'node_modules/@zgeoff/commitlint-config'), { recursive: true });

  await symlink(
    join(import.meta.dir, '../../node_modules/.bin/commitlint'),
    join(ctx.directory, 'node_modules/.bin/commitlint'),
  );

  await writeFile(
    join(ctx.directory, 'node_modules/@zgeoff/commitlint-config/package.json'),
    JSON.stringify({ name: '@zgeoff/commitlint-config', type: 'module', exports: './missing.js' }),
  );

  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`
    .cwd(ctx.directory)
    .env(ctx.env);

  await $`git update-ref refs/remotes/origin/main HEAD`.cwd(ctx.directory).env(ctx.env);

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-commits-check.ts')}`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 2,
    stdout: '',
  });

  expect(result.stderr.toString()).toStartWith(
    "commits: Cannot find package '@zgeoff/commitlint-config'",
  );
});
