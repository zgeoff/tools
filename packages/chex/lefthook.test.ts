import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';
import { readGitEnv } from './test-utils/read-git-env.ts';
import type { BaselineJobDeps } from './test-utils/run-baseline-job.ts';
import { runBaselineJob } from './test-utils/run-baseline-job.ts';
import { writeStubPrograms } from './test-utils/write-stub-programs.ts';

// The PATH holds only bun, env and the stubs a test writes, so a program the host has, such as
// shfmt or actionlint, is missing unless the test stubs it.
async function setupTest() {
  const repo = await mkdtemp(join(tmpdir(), 'chex-lefthook-job-'));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  const bin = join(repo, '.bin');

  await writeStubPrograms(join(repo, 'node_modules/.bin'), {
    diet: '[ "$1" = -- ] && shift\nexec "$@"',
  });

  await writeStubPrograms(bin, {});
  await symlink(process.execPath, join(bin, 'bun'));

  const envPath = Bun.which('env');

  invariant(envPath !== null, 'install env');

  await symlink(envPath, join(bin, 'env'));

  const deps: BaselineJobDeps = {
    readConfigText: () => readFile(join(import.meta.dir, 'lefthook.yml'), 'utf8'),
    runScript: async (script, cwd, env) => {
      const result = await $`/bin/sh -c ${script}`
        .cwd(cwd)
        .env({ ...env })
        .nothrow()
        .quiet();

      return {
        exitCode: result.exitCode,
        output: `${result.stdout.toString()}${result.stderr.toString()}`,
      };
    },
  };

  return { repo, bin, deps, env: { PATH: bin, HOME: repo } };
}

test('it passes the shell job with a notice when the machine lacks shfmt', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(ctx.bin, { shellcheck: 'exit 1' });

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'shell', files: ['brew.sh'] },
    ctx.env,
  );

  expect(run).toStrictEqual({
    exitCode: 0,
    output: 'shell: skipped, because shfmt is not on the PATH; CI runs the check\n',
  });
});

test('it fails the shell job when shellcheck fails a file that shfmt passes', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(ctx.bin, {
    shellcheck: 'echo "brew.sh:2: SC2086 double quote to prevent globbing"\nexit 1',
    shfmt: 'exit 0',
  });

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'shell', files: ['brew.sh'] },
    ctx.env,
  );

  expect(run).toStrictEqual({
    exitCode: 1,
    output: 'brew.sh:2: SC2086 double quote to prevent globbing\n',
  });
});

test('it runs the workflow lint with a notice when the machine lacks actionlint, and fails the job when the lint fails', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, 'node_modules/.bin'), {
    chex: 'echo "$1: $2 runs no job"\necho "bounced: $1"\nexit 1',
  });

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'workflows', files: ['.github/workflows/brew.yml'] },
    ctx.env,
  );

  expect(run).toStrictEqual({
    exitCode: 1,
    output: [
      'workflows: actionlint skipped, because it is not on the PATH; CI runs it',
      'workflows: .github/workflows/brew.yml runs no job',
      'bounced: workflows',
      '',
    ].join('\n'),
  });
});

test('it fails the docs job of a repo with no check:docs script, since the repo names its docs checks', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.repo, 'package.json'), JSON.stringify({ scripts: {} }));

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'docs', files: ['README.md'] },
    ctx.env,
  );

  expect(run.exitCode).not.toBe(0);
  expect(run.output).toInclude('check:docs');
});

test('it fails the uncommitted job and downloads nothing when the repo does not install chex', async () => {
  const ctx = await setupTest();

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'uncommitted', files: [] },
    ctx.env,
  );

  expect(run.exitCode).not.toBe(0);

  expect(run.output).toInclude(
    "Could not find an existing 'chex' binary to run. Stopping because --no-install was passed.",
  );
});

test("it runs the related tests through rig without git's repository variables that a pre-push in a worktree exports", async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, 'node_modules/.bin'), {
    rig: 'env > rig-env\necho "$*" > rig-call',
  });

  const run = await runBaselineJob(
    ctx.deps,
    ctx.repo,
    { hook: 'pre-push', name: 'test', files: ['kettle.ts'] },
    { ...ctx.env, GIT_DIR: '/srv/kettle/.git/worktrees/lid', GIT_WORK_TREE: '/srv/lid' },
  );

  const rigEnv = await readFile(join(ctx.repo, 'rig-env'), 'utf8');
  const rigCall = await readFile(join(ctx.repo, 'rig-call'), 'utf8');

  expect(run.exitCode).toBe(0);
  expect(rigEnv.split('\n').filter((line) => line.startsWith('GIT_'))).toStrictEqual([]);
  expect(rigCall).toBe('related kettle.ts\n');
});

test('it skips typecheck on a commit that stages no code or config file', async () => {
  const ctx = await setupTest();

  const gitEnv = { ...readGitEnv(ctx.repo), PATH: `${ctx.bin}:${process.env['PATH'] ?? ''}` };

  await $`git init --quiet --initial-branch=main ${ctx.repo}`.env(gitEnv);

  await mkdir(join(ctx.repo, 'node_modules/@zgeoff'), { recursive: true });
  await symlink(import.meta.dir, join(ctx.repo, 'node_modules/@zgeoff/chex'));

  await writeFile(
    join(ctx.repo, 'lefthook.yml'),
    'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
  );

  await writeFile(
    join(ctx.repo, 'package.json'),
    JSON.stringify({ scripts: { typecheck: 'exit 1' } }),
  );

  await writeFile(join(ctx.repo, 'notes.md'), '# Notes\n');

  await $`git add notes.md`.cwd(ctx.repo).env(gitEnv);

  const lefthook = join(import.meta.dir, '../../node_modules/.bin/lefthook');

  const result = await $`${process.execPath} ${lefthook} run pre-commit`
    .cwd(ctx.repo)
    .env(gitEnv)
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toInclude('typecheck (skip) no matching staged files');
});
