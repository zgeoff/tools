import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { copyNamedFiles } from '../../test-utils/copy-named-files.ts';

// Bun's skipIf takes a boolean at collection time. A host without actionlint skips the test that
// needs it, as the hook skips the check there; CI installs actionlint, so a CI run without it fails.
const canRunActionlint = Bun.which('actionlint') !== null || process.env['CI'] === 'true';

// Every git call gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot
// reach the repo it runs in.
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

  // The scripts that the skill-docs-writing entry delivers.
  const copyDocsScripts = (scripts: readonly string[]) =>
    copyNamedFiles(
      join(import.meta.dir, '../../packages/chex/src/docs'),
      join(worktree, '.claude/skills/docs-writing/scripts'),
      scripts,
    );

  return {
    env,
    bin,
    main,
    worktree,
    copyDocsScripts,
    baseline: join(import.meta.dir, 'lefthook-pre-push.yml'),
    lefthook: join(import.meta.dir, '../../node_modules/.bin/lefthook'),
  };
}

test('it leaves the main checkout non-bare when the test job runs in a pre-push from a worktree', async () => {
  const ctx = await setupTest();

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

        // The trailing true swallows the file name the hook appends.
        'test:related': 'git init --quiet sandbox && true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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

test('it fails the push on the uncommitted job and names the file when a file the branch changes holds an uncommitted change', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA draft that runs too long.\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': `bun ${join(import.meta.dir, '../../packages/chex/src/run-uncommitted-check.ts')}`,
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  // The fixed copy stays on disk, uncommitted, as the push sends the draft.
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA short copy.\n');

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

  expect(result.exitCode).not.toBe(0);
  expect(failedJobs).toStrictEqual(['uncommitted']);
  expect(output).toMatch(/^guide\.md$/mu);
});

test('it fails the push on the uncommitted job and names the file when a file the branch changes holds a staged change', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA draft that runs too long.\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': `bun ${join(import.meta.dir, '../../packages/chex/src/run-uncommitted-check.ts')}`,
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  // The fixed copy sits in the index, uncommitted, so the disk and the index agree.
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA short copy.\n');

  await $`git add guide.md`.cwd(ctx.worktree).env(ctx.env);

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

  expect(result.exitCode).not.toBe(0);
  expect(failedJobs).toStrictEqual(['uncommitted']);
  expect(output).toMatch(/^guide\.md$/mu);
});

test('it fails the push on the uncommitted job and names the file when a file the branch deletes is restored on disk', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.main, 'helper.ts'), 'export const greeting = "hello";\n');

  await $`git add helper.ts`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'feat: add the helper'}`.cwd(ctx.main).env(ctx.env);
  await $`git push --quiet origin main`.cwd(ctx.main).env(ctx.env);
  await $`git merge --quiet --ff-only main`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': `bun ${join(import.meta.dir, '../../packages/chex/src/run-uncommitted-check.ts')}`,
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git rm --quiet helper.ts`.cwd(ctx.worktree).env(ctx.env);
  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'refactor: remove the helper'}`.cwd(ctx.worktree).env(ctx.env);

  // The push sends a tree without helper.ts, while the disk and the index hold it again.
  await $`git checkout HEAD~1 -- helper.ts`.cwd(ctx.worktree).env(ctx.env);

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

  expect(result.exitCode).not.toBe(0);
  expect(failedJobs).toStrictEqual(['uncommitted']);
  expect(output).toMatch(/^helper\.ts$/mu);
});

test('it passes the push when only a file the branch leaves unchanged holds an uncommitted change', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.main, 'notes.md'), '# Notes\n');

  await $`git add notes.md`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'docs: add the notes'}`.cwd(ctx.main).env(ctx.env);
  await $`git push --quiet origin main`.cwd(ctx.main).env(ctx.env);
  await $`git merge --quiet --ff-only main`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'fixture.ts'), 'export {};\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': `bun ${join(import.meta.dir, '../../packages/chex/src/run-uncommitted-check.ts')}`,
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the fixture'}`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'notes.md'), '# Notes\n\nA line in progress.\n');

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin feature`.cwd(ctx.worktree).env(ctx.env).nothrow().quiet();

  expect(result.exitCode).toBe(0);
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
    'workflows: actionlint skipped, because it is not on the PATH; CI runs it',
  );
});

test('it warns and passes the push when the workflow lint faults a workflow caller the branch changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'sync/workflow-callers'), { recursive: true });

  await writeFile(
    join(ctx.worktree, 'sync/workflow-callers/greet.yml'),
    'on: workflow_dispatch\njobs:\n  greet:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n',
  );

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo sync/workflow-callers/greet.yml',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': `bun ${join(import.meta.dir, '../../packages/chex/src/run-workflows-check.ts')}`,
        'check:uncommitted': 'true',
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
  expect(output).toInclude('sync/workflow-callers/greet.yml:3: job greet sets no timeout-minutes');
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
          'check:dependency-gates': 'true',
          'check:workflows': 'true',
          'check:uncommitted': 'true',
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

test.skipIf(!canRunActionlint)(
  'it passes the push on the concurrency queue key of a workflow before the ignore expires',
  async () => {
    const ctx = await setupTest();

    invariant(Bun.which('actionlint', { PATH: ctx.env.PATH }) !== null, 'install actionlint');

    // The job reads the day from date, so a stub on PATH sets it.
    await writeFile(join(ctx.bin, 'date'), '#!/bin/sh\necho 20270121\n');
    await chmod(join(ctx.bin, 'date'), 0o755);
    await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
    await mkdir(join(ctx.worktree, '.github/workflows'), { recursive: true });

    await writeFile(
      join(ctx.worktree, '.github/workflows/publish.yml'),
      'on: push\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    concurrency:\n      group: publish\n      cancel-in-progress: false\n      queue: max\n    steps:\n      - run: echo hi\n',
    );

    await writeFile(
      join(ctx.worktree, 'package.json'),
      JSON.stringify({
        scripts: {
          'format:check': 'true',
          'lint:files': 'true',
          typecheck: 'true',
          'files:branch': 'echo .github/workflows/publish.yml',
          'test:related': 'true',
          'check:commits': 'true',
          'check:local-paths': 'true',
          'check:test-timeouts': 'true',
          'check:dependency-gates': 'true',
          'check:workflows': 'true',
          'check:uncommitted': 'true',
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

    expect(result.exitCode).toBe(0);
  },
);

test.skipIf(!canRunActionlint)(
  'it fails the push on the concurrency queue key of a workflow once the ignore expires',
  async () => {
    const ctx = await setupTest();

    invariant(Bun.which('actionlint', { PATH: ctx.env.PATH }) !== null, 'install actionlint');

    // The job reads the day from date, so a stub on PATH sets it.
    await writeFile(join(ctx.bin, 'date'), '#!/bin/sh\necho 20270122\n');
    await chmod(join(ctx.bin, 'date'), 0o755);
    await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
    await mkdir(join(ctx.worktree, '.github/workflows'), { recursive: true });

    // This repo's own actionlint config sits beside the workflow, so the expiry holds in tools too.
    await cp(
      join(import.meta.dir, '../../.github/actionlint.yaml'),
      join(ctx.worktree, '.github/actionlint.yaml'),
    );

    await writeFile(
      join(ctx.worktree, '.github/workflows/publish.yml'),
      'on: push\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    concurrency:\n      group: publish\n      cancel-in-progress: false\n      queue: max\n    steps:\n      - run: echo hi\n',
    );

    await writeFile(
      join(ctx.worktree, 'package.json'),
      JSON.stringify({
        scripts: {
          'format:check': 'true',
          'lint:files': 'true',
          typecheck: 'true',
          'files:branch': 'echo .github/workflows/publish.yml',
          'test:related': 'true',
          'check:commits': 'true',
          'check:local-paths': 'true',
          'check:test-timeouts': 'true',
          'check:dependency-gates': 'true',
          'check:workflows': 'true',
          'check:uncommitted': 'true',
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
    expect(output).toInclude('unexpected key "queue" for "concurrency" section');
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);

  // The root README holds 100 lines at most; this one has 101, in short paragraphs with no link.
  const paragraphs = Array.from(
    { length: 50 },
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
  expect(output).toInclude('README.md: 101 lines, over the front page README limit of 100');
  expect(output).toInclude('docs: check-length.sh failed');
});

test('it fails the push on the docs job when the installed link script finds a broken link', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);

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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
  expect(output).toInclude('docs: check-links.sh failed');
});

test('it fails the push when a commit of the branch fails commitlint', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, '.gitignore'), 'node_modules\n');
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
        'check:commits': `bun ${join(import.meta.dir, '../../packages/chex/src/run-commits-check.ts')}`,
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:local-paths': `bun ${join(import.meta.dir, '../../packages/chex/src/run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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

test('it fails a push of another branch when that branch adds the home directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': `bun ${join(import.meta.dir, '../../packages/chex/src/run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the hook config'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet -c cache-notes main`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await $`git add cache.txt`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'docs: note the cache folder'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet feature`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin cache-notes`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('cache.txt:1: commit ');
});

test('it passes the commits check and fails the local-paths check on a push of another branch from a checkout with nothing to push', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.main, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.main, '.gitignore'), 'node_modules\n');
  await symlink(join(import.meta.dir, '../../node_modules'), join(ctx.main, 'node_modules'));

  await writeFile(
    join(ctx.main, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': `bun ${join(import.meta.dir, '../../packages/chex/src/run-commits-check.ts')}`,
        'check:local-paths': `bun ${join(import.meta.dir, '../../packages/chex/src/run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the hook config'}`.cwd(ctx.main).env(ctx.env);
  await $`git push --quiet origin main`.cwd(ctx.main).env(ctx.env);
  await $`git switch --quiet -c cache-notes`.cwd(ctx.main).env(ctx.env);

  await writeFile(join(ctx.main, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await $`git add cache.txt`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'docs: note the cache folder'}`.cwd(ctx.main).env(ctx.env);
  await $`git switch --quiet main`.cwd(ctx.main).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin cache-notes`.cwd(ctx.main).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toMatch(/✔️ commits \(/u);
  expect(output).toInclude('cache.txt:1: commit ');
});

test('it fails the commits check on a push of another branch from a checkout with nothing to push', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.main, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.main, '.gitignore'), 'node_modules\n');
  await symlink(join(import.meta.dir, '../../node_modules'), join(ctx.main, 'node_modules'));

  await writeFile(
    join(ctx.main, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': `bun ${join(import.meta.dir, '../../packages/chex/src/run-commits-check.ts')}`,
        'check:local-paths': `bun ${join(import.meta.dir, '../../packages/chex/src/run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the hook config'}`.cwd(ctx.main).env(ctx.env);
  await $`git push --quiet origin main`.cwd(ctx.main).env(ctx.env);
  await $`git switch --quiet -c cache-notes`.cwd(ctx.main).env(ctx.env);

  await writeFile(join(ctx.main, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await $`git add cache.txt`.cwd(ctx.main).env(ctx.env);
  await $`git commit --quiet -m ${'note the cache folder'}`.cwd(ctx.main).env(ctx.env);
  await $`git switch --quiet main`.cwd(ctx.main).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin cache-notes`.cwd(ctx.main).env(ctx.env).nothrow().quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('subject may not be empty [subject-empty]');
});

test('it checks each branch of a push that sends two', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'true',
        'test:related': 'true',
        'check:commits': 'true',
        'check:local-paths': `bun ${join(import.meta.dir, '../../packages/chex/src/run-local-paths-check.ts')}`,
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the hook config'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet -c cache-notes main`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'cache.txt'), `cache: ${ctx.env.HOME}/.cache\n`);

  await $`git add cache.txt`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'docs: note the cache folder'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet -c log-notes main`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(join(ctx.worktree, 'log.txt'), `logs: ${ctx.env.HOME}/.logs\n`);

  await $`git add log.txt`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'docs: note the log folder'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet feature`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin cache-notes log-notes`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('cache.txt:1: commit ');
  expect(output).toInclude('log.txt:1: commit ');
});

test('it fails a push of another branch when a commit of that branch fails commitlint', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, '.gitignore'), 'node_modules\n');
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
        'check:commits': `bun ${join(import.meta.dir, '../../packages/chex/src/run-commits-check.ts')}`,
        'check:local-paths': 'true',
        'check:test-timeouts': 'true',
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
        'memory-capped': 'exec',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m ${'test: add the hook config'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet -c tidy-notes main`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet --allow-empty -m ${'tidy up'}`.cwd(ctx.worktree).env(ctx.env);
  await $`git switch --quiet feature`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  const result = await $`git push origin tidy-notes`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const output = `${result.stdout.toString()}${result.stderr.toString()}`;

  expect(result.exitCode).not.toBe(0);
  expect(output).toInclude('subject may not be empty [subject-empty]');
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
        'check:test-timeouts': `bun ${join(import.meta.dir, '../../packages/chex/src/run-test-timeouts-check.ts')}`,
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
    'bunfig.toml: [test] timeout = 30000 applies to every test, above the 5000 ms limit of the unit lane',
  );
});

test('it fails the push when bunfig.toml holds an age-gate exclude past its removal date', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);

  await writeFile(
    join(ctx.worktree, 'bunfig.toml'),
    [
      '[install]',
      '# left-pad 1.3.1 (published 2020-03-01, patches GHSA-aaaa-bbbb-cccc) ages past the gate ~2020-03-08 — remove then (audit-fix)',
      'minimumReleaseAgeExcludes = ["left-pad"]',
    ].join('\n'),
  );

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
        'check:test-timeouts': 'true',
        'check:dependency-gates': `bun ${join(import.meta.dir, '../../packages/chex/src/dependency-gates/run-dependency-gates-check.ts')}`,
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
    'bunfig.toml: left-pad: the age-gate exclude was due for removal on 2020-03-08',
  );
});

test("it fails the commit when typecheck fails, after the repo's own pre-commit job runs", async () => {
  const ctx = await setupTest();

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

test('it skips the test job with the CI notice when the branch has more than 50 related test files', async () => {
  const ctx = await setupTest();

  const tests = Array.from({ length: 51 }, (_, index) => `src/t${index}.test.ts`);

  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await mkdir(join(ctx.worktree, 'src'));

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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',

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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
        'check:dependency-gates': 'true',
        'check:workflows': 'true',
        'check:uncommitted': 'true',
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
