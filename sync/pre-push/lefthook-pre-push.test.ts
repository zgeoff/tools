import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// A main checkout with a pushable upstream and a linked worktree on its own branch. Every git call
// gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot reach the repo
// it runs in.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'lefthook-pre-push-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');

  await mkdir(bin);

  // The workspace's node_modules/.bin holds the commitlint that zgeoff-check's commits check runs.
  const env = {
    PATH: `${bin}:${join(import.meta.dir, '../../node_modules/.bin')}:${process.env['PATH']}`,
    HOME: directory,
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
        check: 'true',
        typecheck: 'true',
        'files:branch': 'echo fixture.ts',
        'test:related': 'git init --quiet sandbox && true',
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

test('it passes the push with a notice when the repo has no check script', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'fixture.sh'), 'echo $1\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo fixture.sh',
        'test:related': 'true',
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

  expect(`${result.stdout.toString()}${result.stderr.toString()}`).toInclude(
    'check: skipped, because package.json has no check script; add "check": "zgeoff-check" to run it',
  );
});

test('it passes the push with a notice that names the check script when it is not zgeoff-check', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'fixture.sh'), 'echo $1\n');

  // An aggregate whose last command fails on the paths the job would append, so the push passes
  // only when the job skips the script.
  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        check: 'bun run typecheck && test $# -eq 0',
        typecheck: 'true',
        'files:branch': 'echo fixture.sh',
        'test:related': 'true',
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

  expect(`${result.stdout.toString()}${result.stderr.toString()}`).toInclude(
    'check: skipped, because the check script is "bun run typecheck && test $# -eq 0", not "zgeoff-check"',
  );
});

test('it fails the push when zgeoff-check finds a problem in a file the branch changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'bad.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        check: 'zgeoff-check',
        typecheck: 'true',
        'files:branch': 'echo bad.sh',
        'test:related': 'true',
      },
    }),
  );

  await writeFile(
    join(ctx.bin, 'zgeoff-check'),
    `#!/bin/sh\nexec ${process.execPath} ${join(import.meta.dir, '../../packages/checks/src/cli.ts')} "$@"\n`,
  );

  await chmod(join(ctx.bin, 'zgeoff-check'), 0o755);

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).not.toBe(0);
});

test("it fails the push when this repo's source check finds a problem in a file the branch changes", async () => {
  const ctx = await setupTest();

  // This repo's own lefthook.yml, with its extends pointed at the baseline from the fixture.
  const config = await readFile(join(import.meta.dir, '../../lefthook.yml'), 'utf8');

  await writeFile(
    join(ctx.worktree, 'lefthook.yml'),
    config.replace('sync/pre-push/lefthook-pre-push.yml', ctx.baseline),
  );

  await writeFile(join(ctx.worktree, 'bad.sh'), '#!/usr/bin/env bash\necho $1\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        check: `bun ${join(import.meta.dir, '../../packages/checks/src/cli.ts')}`,
        typecheck: 'true',
        'files:branch': 'echo bad.sh',
        'test:related': 'true',
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

  expect(result.exitCode).not.toBe(0);
});

test('it passes the push when only a file the branch leaves unchanged fails zgeoff-check', async () => {
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
        check: 'zgeoff-check',
        typecheck: 'true',
        'files:branch': 'echo clean.sh',
        'test:related': 'true',
      },
    }),
  );

  await writeFile(
    join(ctx.bin, 'zgeoff-check'),
    `#!/bin/sh\nexec ${process.execPath} ${join(import.meta.dir, '../../packages/checks/src/cli.ts')} "$@"\n`,
  );

  await chmod(join(ctx.bin, 'zgeoff-check'), 0o755);

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

  // Passed bare, -helpers.sh would read as an unknown option and stop the run with exit 2.
  await writeFile(join(ctx.worktree, '-helpers.sh'), '#!/usr/bin/env bash\necho "hello"\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        check: 'zgeoff-check',
        typecheck: 'true',
        'files:branch': String.raw`printf '%s\n' -helpers.sh`,
        'test:related': 'true',
      },
    }),
  );

  await writeFile(
    join(ctx.bin, 'zgeoff-check'),
    `#!/bin/sh\nexec ${process.execPath} ${join(import.meta.dir, '../../packages/checks/src/cli.ts')} "$@"\n`,
  );

  await chmod(join(ctx.bin, 'zgeoff-check'), 0o755);

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

test('it forwards every file the branch changes to zgeoff-check when the branch changes several', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await Promise.all(
    ['first.sh', 'second.sh', 'third.sh'].map((file) =>
      writeFile(join(ctx.worktree, file), '#!/usr/bin/env bash\necho "hello"\n'),
    ),
  );

  // The stand-in zgeoff-check writes each argument it gets on its own line.
  await writeFile(
    join(ctx.bin, 'zgeoff-check'),
    String.raw`#!/bin/sh
printf '%s\n' "$@" > forwarded.txt
`,
  );

  await chmod(join(ctx.bin, 'zgeoff-check'), 0o755);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        check: 'zgeoff-check',
        typecheck: 'true',
        'files:branch': String.raw`printf '%s\n' first.sh second.sh third.sh`,
        'test:related': 'true',
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

  await $`git push --quiet origin feature`.cwd(ctx.worktree).env(ctx.env).quiet();

  const forwarded = await readFile(join(ctx.worktree, 'forwarded.txt'), 'utf8');

  expect(forwarded).toBe('./first.sh\n./second.sh\n./third.sh\n');
});

// Each suite that spawns git must stay safe without the baseline's env -u, so it runs here with
// the GIT_DIR a pre-push hook in the worktree exports.
test.each([
  ['packages/checks/package.test.ts'],
  ['packages/checks/src/cli.test.ts'],
  ['packages/checks/src/run-checks.test.ts'],
  ['packages/checks/src/run-git-show-toplevel.test.ts'],
  ['packages/oxfmt-config/index.test.ts'],
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
  30_000,
);
