import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// Bun's skipIf takes a boolean at collection time. A host without actionlint skips the test that
// needs it, as the hook skips the check there; CI installs actionlint, so a CI run without it fails.
const canRunActionlint = Bun.which('actionlint') !== null || process.env['CI'] === 'true';

// A main checkout with a pushable upstream and a linked worktree on its own branch. Every git call
// gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot reach the repo
// it runs in.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'lefthook-pre-push-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');

  await mkdir(bin);

  const env = {
    PATH: `${bin}:${process.env['PATH']}`,
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
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const main = join(directory, 'main');
  const worktree = join(directory, 'worktree');

  await $`git init --quiet --bare --initial-branch=main ${join(directory, 'upstream.git')}`
    .cwd(directory)
    .env(env);

  await $`git init --quiet --initial-branch=main ${main}`.cwd(directory).env(env);
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(main).env(env);
  await $`git remote add origin ${join(directory, 'upstream.git')}`.cwd(main).env(env);
  await $`git push --quiet -u origin main`.cwd(main).env(env);
  await $`git worktree add --quiet -b feature ${worktree}`.cwd(main).env(env);

  return {
    env,
    bin,
    main,
    worktree,
    baseline: join(import.meta.dir, 'lefthook-pre-push.yml'),
    lefthook: join(import.meta.dir, '../../node_modules/.bin/lefthook'),
  };
}

test('it leaves the main checkout non-bare when the test job runs in a pre-push from a worktree', async () => {
  const ctx = await setupTest();

  // lefthook runs the real baseline over a branch that changes one file. The other jobs pass, and
  // the related tests stand in as a test that runs a plain git init in a fresh folder with the
  // environment the hook gives it; the trailing true swallows the file name.
  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'fixture.ts'), 'export {};\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo fixture.ts',
        'test:related': 'git init --quiet sandbox && true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  await $`git push --quiet origin feature`.cwd(ctx.worktree).env(ctx.env);

  const bare = await $`git config --get core.bare`.cwd(ctx.main).env(ctx.env).text();

  expect(bare).toBe('false\n');
  expect(existsSync(join(ctx.worktree, 'sandbox/.git'))).toBeTrue();
});

test('it fails the push on the shell job alone when a shell file the branch changes fails shellcheck', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'bad.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo bad.sh',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);

  const failedJobs = [...output.matchAll(/^🥊\s+(?<job>\S+)/gmu)].map(
    (failure) => failure.groups?.['job'],
  );

  expect(failedJobs).toStrictEqual(['shell']);
});

test('it fails the push on the shell job alone when a shell file the branch changes passes shellcheck and fails shfmt', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  // shellcheck accepts this script, and shfmt would space it out.
  await writeFile(
    join(ctx.worktree, 'cramped.sh'),
    '#!/usr/bin/env bash\nif true;then echo "a";fi\n',
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo cramped.sh',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  const failedJobs = [...output.matchAll(/^🥊\s+(?<job>\S+)/gmu)].map(
    (failure) => failure.groups?.['job'],
  );

  expect(failedJobs).toStrictEqual(['shell']);
  expect(output).toInclude('+++ cramped.sh');
  expect(output).not.toInclude('SC');
});

test('it passes the push when only a file the branch leaves unchanged fails the shell check', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  // bad.sh fails the shell check, and the branch's file list names only clean.sh, so the job
  // passes only when it checks the listed files rather than every tracked one.
  await writeFile(join(ctx.worktree, 'bad.sh'), '#!/usr/bin/env bash\necho $1\n');
  await writeFile(join(ctx.worktree, 'clean.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo clean.sh',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).toBe(0);
});

test('it passes the push when the branch changes a clean file whose name starts with a dash', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  // Passed bare, -helpers.sh would read as an option to shellcheck and shfmt.
  await writeFile(join(ctx.worktree, '-helpers.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': String.raw`printf '%s\n' -helpers.sh`,
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).toBe(0);
});

test('it hands every shell file the branch changes to the shell check when the branch changes several', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await Promise.all(
    ['first.sh', 'second.sh', 'third.sh'].map((file) =>
      writeFile(join(ctx.worktree, file), '#!/usr/bin/env bash\necho $1\n'),
    ),
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': String.raw`printf '%s\n' first.sh second.sh third.sh`,
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(output).toIncludeMultiple([
    'In first.sh line 2',
    'In second.sh line 2',
    'In third.sh line 2',
  ]);
});

test('it passes the push with a notice when the machine lacks shfmt', async () => {
  const ctx = await setupTest();

  // A PATH of the programs the push runs, with shellcheck and without shfmt.
  for (const program of ['git', 'sh', 'shellcheck']) {
    const found = Bun.which(program);

    invariant(found !== null, `install ${program}`);

    await symlink(found, join(ctx.bin, program));
  }

  await symlink(process.execPath, join(ctx.bin, 'bun'));
  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'bad.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo bad.sh',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, PATH: ctx.bin })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);
  expect(output).toInclude('shell: skipped, because shfmt is not on the PATH; CI runs the check');
});

test('it passes the push with a notice when the machine lacks actionlint', async () => {
  const ctx = await setupTest();

  // A PATH of the programs the push runs, without actionlint.
  for (const program of ['git', 'sh']) {
    const found = Bun.which(program);

    invariant(found !== null, `install ${program}`);

    await symlink(found, join(ctx.bin, program));
  }

  await symlink(process.execPath, join(ctx.bin, 'bun'));
  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, '.github/workflows'), { recursive: true });
  await writeFile(join(ctx.worktree, '.github/workflows/greet.yml'), 'on: push\njobs: {}\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo .github/workflows/greet.yml',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, PATH: ctx.bin })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);

  expect(output).toInclude(
    'workflows: skipped, because actionlint is not on the PATH; CI runs the check',
  );
});

test.skipIf(!canRunActionlint)(
  'it fails the push when actionlint rejects a workflow the branch changes',
  async () => {
    const ctx = await setupTest();

    invariant(Bun.which('actionlint', { PATH: ctx.env.PATH }) !== null, 'install actionlint');

    await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
    await mkdir(join(ctx.worktree, '.github/workflows'), { recursive: true });

    await writeFile(
      join(ctx.worktree, '.github/workflows/greet.yml'),
      'on: push\njobs:\n  greet:\n    needs: build\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
    );

    await writeFile(
      join(ctx.worktree, 'package.json'),
      JSON.stringify({
        scripts: {
          'format:check': 'true',
          'lint:files': 'true',
          typecheck: 'true',
          'files:branch': 'echo .github/workflows/greet.yml',
          'test:related': 'true',
          'check:commits': 'true',
          'check:local-paths': 'true',
          'check:test-timeouts': 'true',
          'memory-capped': 'exec',
        },
      }),
    );

    await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
    await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

    await writeFile(
      join(ctx.main, '.git/hooks/pre-push'),
      `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
    );

    await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

    const result = await $`git push origin feature`
      .cwd(ctx.worktree)
      .env(ctx.env)
      .nothrow()
      .quiet();

    const output = `${result.stdout.toString()}${result.stderr.toString()}`;

    expect(result.exitCode).not.toBe(0);
    expect(output).toInclude('job "greet" needs job "build" which does not exist');
  },
);

test('it passes the docs job with a notice when the repo has no docs-writing scripts', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'README.md'), '# Greeter\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo README.md',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);

  expect(output).toInclude(
    'docs: skipped, because the repo has no .claude/skills/docs-writing/scripts/check-length.sh; take the skill-docs-writing entry of repo-sync to run it',
  );
});

test('it fails the push on the docs job when the installed length script rejects a README', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await cp(
    join(import.meta.dir, '../skills/docs-writing/scripts'),
    join(ctx.worktree, '.claude/skills/docs-writing/scripts'),
    { recursive: true },
  );

  // The repo has a package.json, so its README holds 130 lines at most; this one has 131, in short
  // paragraphs with no link.
  const paragraphs = Array.from(
    { length: 65 },
    (_, index) => `Step ${index + 1} greets the visitor.`,
  );

  await writeFile(
    join(ctx.worktree, 'README.md'),
    `${['# Greeter', ...paragraphs].join('\n\n')}\n`,
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo README.md',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  const failedJobs = [...output.matchAll(/^🥊\s+(?<job>\S+)/gmu)].map(
    (failure) => failure.groups?.['job'],
  );

  expect(failedJobs).toStrictEqual(['docs']);
  expect(output).toInclude('README.md: 131 lines, over the package README limit of 130');
});

test('it fails the push on the docs job when the installed link script finds a broken link', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await cp(
    join(import.meta.dir, '../skills/docs-writing/scripts'),
    join(ctx.worktree, '.claude/skills/docs-writing/scripts'),
    { recursive: true },
  );

  await writeFile(join(ctx.worktree, 'README.md'), '# Greeter\n\nRead the [guide](./guide.md).\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo README.md',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  const failedJobs = [...output.matchAll(/^🥊\s+(?<job>\S+)/gmu)].map(
    (failure) => failure.groups?.['job'],
  );

  expect(failedJobs).toStrictEqual(['docs']);
  expect(output).toInclude('guide.md');
});

test('it fails the push when a commit of the branch fails commitlint', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, '.gitignore'), 'node_modules\n');

  // The workspace's install holds the commitlint and @zgeoff/commitlint-config that the check reads.
  await symlink(join(import.meta.dir, '../../node_modules'), join(ctx.worktree, 'node_modules'));

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': `bun ${join(import.meta.dir, 'run-commits-check.ts')}`,
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'tidy up'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('subject may not be empty [subject-empty]');
});

test('it fails the push when a commit of the branch adds the home directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo cache.txt',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': `bun ${join(import.meta.dir, 'run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude(`cache.txt:1: commit `);
});

test('it fails the push when a bunfig.toml raises the test timeout above 5 s', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'bunfig.toml'), '[test]\ntimeout = 30000\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo bunfig.toml',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': `bun ${join(import.meta.dir, 'run-test-timeouts-check.ts')}`,
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);

  expect(output).toInclude(
    'bunfig.toml: [test] timeout = 30000 raises every test above the 5 s limit',
  );
});

test("it fails the commit when typecheck fails, after the repo's own pre-commit job runs", async () => {
  const ctx = await setupTest();

  // The repo's own job and typecheck each record that they ran, so the file shows their order.
  await writeFile(
    join(ctx.worktree, 'lefthook.yml'),
    `extends:\n  - ${ctx.baseline}\npre-commit:\n  jobs:\n    - name: fixer\n      run: echo fixer >> ran.txt\n`,
  );

  await writeFile(join(ctx.worktree, 'fixture.ts'), 'export {};\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: { 'memory-capped': 'exec', typecheck: 'echo typecheck >> ran.txt && exit 1' },
    }),
  );

  await writeFile(
    join(ctx.main, '.git/hooks/pre-commit'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-commit "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-commit'), 0o755);

  await $`git add lefthook.yml fixture.ts package.json`.cwd(ctx.worktree).env(ctx.env);

  const result = await $`git commit -m ${'test: add the fixture'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const ran = await readFile(join(ctx.worktree, 'ran.txt'), 'utf8');

  expect(result.exitCode).not.toBe(0);
  expect(ran).toBe('fixer\ntypecheck\n');
});

test('it skips typecheck on a commit that stages no code or config file', async () => {
  const ctx = await setupTest();

  // The repo's lefthook.yml and package.json are committed first, so the commit under test stages
  // only the page.
  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({ scripts: { 'memory-capped': 'exec', typecheck: 'exit 1' } }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the config'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-commit'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-commit "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-commit'), 0o755);
  await writeFile(join(ctx.worktree, 'notes.md'), '# Notes\n');

  await $`git add notes.md`.cwd(ctx.worktree).env(ctx.env);

  const result = await $`git commit -m ${'docs: add the notes'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
});

// Each suite that spawns git must stay safe without the baseline's env -u, so it runs here with
// the GIT_DIR a pre-push hook in the worktree exports.
test.each([
  ['packages/oxfmt-config/index.test.ts'],
  ['sync/pre-push/read-branch-base.test.ts'],
  ['sync/pre-push/run-commits-check.test.ts'],
  ['sync/pre-push/run-local-paths-check.test.ts'],
  ['sync/pre-push/run-test-timeouts-check.test.ts'],
  ['sync/skills/docs-writing/scripts/check-length.test.ts'],
  ['sync/skills/docs-writing/scripts/check-links.test.ts'],
  ['sync/skills/skill-writing/scripts/check-skill.test.ts'],
])(
  'it passes %s and leaves the main checkout config and branch unchanged under a worktree GIT_DIR',
  async (suite) => {
    const ctx = await setupTest();

    // A local exclude for every page, so a script whose git reads this repo instead of its own
    // temp repo lists none of the pages its test writes, and the test fails.
    await writeFile(join(ctx.main, '.git/info/exclude'), '*.md\n');

    const config = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const head = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    // The real HOME, so a tool on PATH that reads it, such as a version manager's node shim, runs.
    const result = await $`bun test ./${suite}`
      .cwd(join(import.meta.dir, '../..'))
      .env({
        ...ctx.env,
        HOME: process.env['HOME'],
        GIT_DIR: join(ctx.main, '.git/worktrees/worktree'),
      })
      .quiet()
      .nothrow();

    const configAfter = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const headAfter = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    expect(configAfter).toBe(config);
    expect(headAfter).toBe(head);
    expect(result.stderr.toString()).toMatch(/^ [1-9]\d* pass\n 0 fail$/mu);
    expect(result.exitCode).toBe(0);
  },
  // oxlint-disable-next-line zgeoff/max-test-timeout -- each row runs a whole suite in a nested bun test
  30_000,
);

test('it skips the test job with the CI notice when the branch has more than 50 related test files', async () => {
  const ctx = await setupTest();

  const tests = Array.from({ length: 51 }, (_, index) => `src/t${index}.test.ts`);

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'src'));

  // Each test fails, so a run of any of them fails the push.
  await Promise.all(
    tests.map((path) =>
      writeFile(
        join(ctx.worktree, path),
        "import { expect, test } from 'bun:test';\n\ntest('it fails on purpose', () => {\n  expect(1).toBe(2);\n});\n",
      ),
    ),
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'git diff --name-only main...HEAD',
        test: 'bun test',
        'test:related': `bun ${join(import.meta.dir, 'run-related-tests.ts')}`,
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': `bash ${join(import.meta.dir, 'run-memory-capped.sh')} 1024`,
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, TEST_WORKERS: '2' })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);

  expect(output).toInclude(
    'run-related-tests: skipped, because the branch has 51 related unit test files, over the cap of 50; CI runs the full suite',
  );
});

test('it runs the related tests under the memory cap when the branch has 50 or fewer', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'src'));
  await writeFile(join(ctx.worktree, 'src/cart.ts'), 'export {};\n');

  await writeFile(
    join(ctx.worktree, 'src/cart.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it fails on purpose', () => {\n  expect(1).toBe(2);\n});\n",
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'git diff --name-only main...HEAD',
        test: 'bun test',
        'test:related': `bun ${join(import.meta.dir, 'run-related-tests.ts')}`,
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',

        // The cap script runs each job, after a line in capped.txt that names the job's command.
        'memory-capped': `bash -c 'echo "$*" >> capped.txt; exec bash ${join(import.meta.dir, 'run-memory-capped.sh')} 1024 "$@"' memory-capped`,
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, TEST_WORKERS: '2' })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('(fail) it fails on purpose');

  const capped = await readFile(join(ctx.worktree, 'capped.txt'), 'utf8');

  expect(capped.split('\n')).toContainEqual(expect.stringMatching(/^bun run test:related /u));
});

test('it runs no tests in the hook when the branch changes only lane files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'src'));
  await mkdir(join(ctx.worktree, 'e2e'));

  // Each lane test fails, so a run of any of them fails the push.
  await writeFile(
    join(ctx.worktree, 'e2e/checkout.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it fails on purpose', () => {\n  expect(1).toBe(2);\n});\n",
  );

  await writeFile(
    join(ctx.worktree, 'src/view.browser.test.ts'),
    "import { expect, test } from 'bun:test';\n\ntest('it fails on purpose', () => {\n  expect(1).toBe(2);\n});\n",
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'git diff --name-only main...HEAD',
        test: 'bun test',
        'test:related': `bun ${join(import.meta.dir, 'run-related-tests.ts')}`,
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': `bash ${join(import.meta.dir, 'run-memory-capped.sh')} 1024`,
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, TEST_WORKERS: '2' })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);
  expect(output).toInclude('run-related-tests: no related tests');
});

test('it passes the slow-host timeout to the tests when the host gets 1 worker', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'src'));
  await writeFile(join(ctx.worktree, 'src/cart.test.ts'), '');

  // The test script prints the arguments the hook gives it.
  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'git diff --name-only main...HEAD',
        test: 'echo test-args',
        'test:related': `bun ${join(import.meta.dir, 'run-related-tests.ts')}`,
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'memory-capped': `bash ${join(import.meta.dir, 'run-memory-capped.sh')} 1024`,
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`
    .cwd(ctx.worktree)
    .env({ ...ctx.env, TEST_WORKERS: '1' })
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).toBe(0);
  expect(output).toInclude('test-args --parallel=1 --timeout=15000 ./src/cart.test.ts');
});
