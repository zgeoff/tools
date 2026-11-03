import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTreeFiles } from '@zgeoff/std/test-utils/write-tree-files';
import { $ } from 'bun';
import { commitAllFiles } from '../src/test-utils/commit-all-files.ts';
import { createChexBaselineRepo } from '../src/test-utils/create-chex-baseline-repo.ts';
import { getChexE2EPack } from '../src/test-utils/get-chex-e2e-pack.ts';
import { readCallLog } from '../src/test-utils/read-call-log.ts';
import { runChexCLI } from '../src/test-utils/run-chex-cli.ts';
import { runHookedPush } from '../src/test-utils/run-hooked-push.ts';
import { writeStubPrograms } from '../src/test-utils/write-stub-programs.ts';

// Every git call gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot
// reach the repo it runs in.
async function setupTest() {
  const repoRoot = join(import.meta.dir, '../../..');

  const directory = await mkdtemp(join(tmpdir(), `chex-lefthook-pid${process.pid}-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // `bun run` puts the repo's node_modules/.bin on the PATH, where bun x would find this repo's own
  // chex, rig and diet in place of the ones the fixture installs.
  const searchPath = (process.env['PATH'] ?? '')
    .split(':')
    .filter((entry) => !entry.endsWith('node_modules/.bin'))
    .join(':');

  const env = {
    PATH: searchPath,
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
  const rigCalls = join(directory, 'rig-calls');

  await $`git init --quiet --bare --initial-branch=main ${join(directory, 'upstream.git')}`
    .cwd(directory)
    .env(env);

  await $`git init --quiet --initial-branch=main ${main}`.cwd(directory).env(env);
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(main).env(env);
  await $`git remote add origin ${join(directory, 'upstream.git')}`.cwd(main).env(env);
  await $`git push --quiet -u origin main`.cwd(main).env(env);
  await $`git worktree add --quiet -b feature ${worktree}`.cwd(main).env(env);

  const lefthook = join(repoRoot, 'node_modules/.bin/lefthook');

  await writeStubPrograms(join(main, '.git/hooks'), {
    'pre-push': `exec ${process.execPath} ${lefthook} run pre-push "$@"`,
    'pre-commit': `exec ${process.execPath} ${lefthook} run pre-commit "$@"`,
  });

  const install = { toolsRoot: repoRoot, chex: getChexE2EPack(process.env), rigLog: rigCalls };
  const readRigCalls = () => readCallLog(rigCalls);

  return {
    env,
    main,
    worktree,
    install,
    readRigCalls,
  };
}

test('it passes a push that clears every job, runs each repo check through chex and the related tests through rig under diet, and leaves the main checkout non-bare', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: ['uncommitted', 'commits', 'local-paths', 'test-timeouts', 'dependency-gates'],
    scripts: { 'format:check': 'true', typecheck: 'true', 'check:docs': 'true' },
    files: { 'fixture.ts': 'export {};\n' },
    rig: 'git init --quiet sandbox',
    oxlint: 'exit 0',
    withCommitlint: false,
  });

  await commitAllFiles(ctx.worktree, ctx.env, 'test: add the fixture');

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);
  const bare = await $`git config --get core.bare`.cwd(ctx.main).env(ctx.env).text();
  const rigCalls = await ctx.readRigCalls();

  expect(result.exitCode).toBe(0);

  expect(
    [...result.output.matchAll(/^(?:cleared|bounced): \S+$/gmu)].map((line) => line[0]),
  ).toStrictEqual([
    'cleared: uncommitted',
    'cleared: commits',
    'cleared: local-paths',
    'cleared: test-timeouts',
    'cleared: dependency-gates',
  ]);

  expect(rigCalls).toStrictEqual(['under diet: related fixture.ts']);
  expect(bare).toBe('false\n');
  expect(existsSync(join(ctx.worktree, 'sandbox/.git'))).toBeTrue();
});

test('it fails a push in a checkout with no node_modules, and names the missing baseline', async () => {
  const ctx = await setupTest();

  // A fresh worktree before its first install: chex init has written lefthook.yml, and
  // node_modules does not exist, so lefthook finds no baseline to extend.
  await writeTreeFiles(ctx.worktree, {
    'package.json': JSON.stringify({
      name: 'kettle',
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    }),
    'fixture.ts': 'export {};\n',
  });

  const init = await runChexCLI(ctx.install.chex.binPath, ctx.worktree, ctx.env, ['init']);

  expect(init.exitCode).toBe(0);
  expect(existsSync(join(ctx.worktree, 'node_modules'))).toBeFalse();

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);

  // Plumbing commits without the commit hook, which would refuse this checkout.
  const tree = await $`git write-tree`.cwd(ctx.worktree).env(ctx.env).text();

  const commit = await $`git commit-tree ${tree.trim()} -p HEAD -m ${'test: add the fixture'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .text();

  await $`git update-ref HEAD ${commit.trim()}`.cwd(ctx.worktree).env(ctx.env);

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);

  expect(result.exitCode).toBe(1);
  expect(result.failedJobs).toStrictEqual(['chex-baseline']);

  expect(result.output).toInclude(
    "chex-baseline: node_modules/@zgeoff/chex/lefthook.yml is missing, so lefthook runs none of the chex baseline's jobs; run bun install, then try again",
  );
});

test("it fails the commit when typecheck fails, after the repo's own pre-commit job runs", async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: [],
    scripts: {
      'format:check': 'true',
      typecheck: 'echo typecheck >> ran.txt && exit 1',
      'check:docs': 'true',
    },
    files: {
      'lefthook.yml':
        'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\npre-commit:\n  jobs:\n    - name: fixer\n      run: echo fixer >> ran.txt\n',
      'fixture.ts': 'export {};\n',
    },
    rig: 'exit 0',
    oxlint: 'exit 0',
    withCommitlint: false,
  });

  await $`git add lefthook.yml fixture.ts package.json .gitignore`.cwd(ctx.worktree).env(ctx.env);

  const result = await $`git commit -m ${'test: add the fixture'}`
    .cwd(ctx.worktree)
    .env(ctx.env)
    .nothrow()
    .quiet();

  const ran = await readFile(join(ctx.worktree, 'ran.txt'), 'utf8');

  expect(result.exitCode).toBe(1);
  expect(ran).toBe('fixer\ntypecheck\n');
});

test('it fails the push on the uncommitted job and names the file when a file the branch changes holds an uncommitted change', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: ['uncommitted'],
    scripts: { 'format:check': 'true', typecheck: 'true', 'check:docs': 'true' },
    files: { 'guide.md': '# Guide\n\nA draft that runs too long.\n' },
    rig: 'exit 0',
    oxlint: 'exit 0',
    withCommitlint: false,
  });

  await commitAllFiles(ctx.worktree, ctx.env, 'test: add the fixture');

  // The fixed copy stays on disk, uncommitted, as the push sends the draft.
  await writeFile(join(ctx.worktree, 'guide.md'), '# Guide\n\nA short copy.\n');

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['uncommitted']);
  expect(result.output).toMatch(/^guide\.md$/mu);
  expect(result.output).toMatch(/^bounced: uncommitted$/mu);
});

test("it fails the push on the format:check job when the repo's format:check script fails", async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: [],
    scripts: {
      'format:check': 'echo "kettle.ts needs formatting" && exit 1',
      typecheck: 'true',
      'check:docs': 'true',
    },
    files: { 'kettle.ts': 'export {};\n' },
    rig: 'exit 0',
    oxlint: 'exit 0',
    withCommitlint: false,
  });

  await commitAllFiles(ctx.worktree, ctx.env, 'test: add the fixture');

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['format:check']);
  expect(result.output).toInclude('kettle.ts needs formatting');
});

test('it fails the push on the lint job when oxlint fails a file the branch changes', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: [],
    scripts: { 'format:check': 'true', typecheck: 'true', 'check:docs': 'true' },
    files: { 'src/kettle.ts': 'export {};\n' },
    rig: 'exit 0',
    oxlint: 'echo "lint failed: $*" && exit 1',
    withCommitlint: false,
  });

  await commitAllFiles(ctx.worktree, ctx.env, 'test: add the fixture');

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['lint']);
  expect(result.output).toInclude('lint failed: --no-error-on-unmatched-pattern src/kettle.ts');
});

test('it fails the push on the local-paths job when a commit of the branch adds the home directory', async () => {
  const ctx = await setupTest();

  await createChexBaselineRepo(ctx.worktree, ctx.install, {
    realChecks: ['local-paths'],
    scripts: { 'format:check': 'true', typecheck: 'true', 'check:docs': 'true' },
    files: { 'cache.txt': `cache: ${ctx.env.HOME}/.cache\n` },
    rig: 'exit 0',
    oxlint: 'exit 0',
    withCommitlint: false,
  });

  await commitAllFiles(ctx.worktree, ctx.env, 'docs: note the cache folder');

  const result = await runHookedPush(ctx.worktree, 'feature', ctx.env);

  expect(result.exitCode).not.toBe(0);
  expect(result.failedJobs).toStrictEqual(['local-paths']);
  expect(result.output).toInclude('cache.txt:1: commit ');
});
