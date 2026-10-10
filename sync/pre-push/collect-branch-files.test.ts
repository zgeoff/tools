import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectBranchFiles } from './collect-branch-files.ts';

// A bare upstream and a clone of it whose main holds one pushed commit, so
// every test starts from a repository whose history predates the branch.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'collect-branch-files-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const env = buildGitEnv(dir);

  const repo = await createClone(dir, env);

  await createCommit(repo, env, { 'README.md': '# repo\n' });
  await runGit(repo, env, ['push', '--quiet', '-u', 'origin', 'main']);
  await runGit(repo, env, ['remote', 'set-head', 'origin', 'main']);

  return {
    repo,
    env,
    runGit: (...args: readonly string[]) => runGit(repo, env, args),
    createCommit: (files: Readonly<Record<string, string>>) => createCommit(repo, env, files),
  };
}

// Isolated from the user's git config, with a fixed identity for commits.
function buildGitEnv(home: string) {
  return {
    PATH: process.env['PATH'],
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
}

async function createClone(
  dir: string,
  env: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const upstream = join(dir, 'upstream.git');
  const repo = join(dir, 'work');

  await runGit(dir, env, ['init', '--quiet', '--bare', '--initial-branch=main', upstream]);
  await runGit(dir, env, ['clone', '--quiet', upstream, repo]);
  await runGit(repo, env, ['switch', '--quiet', '--create', 'main']);

  return repo;
}

async function runGit(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
  args: readonly string[],
): Promise<void> {
  const proc = Bun.spawn(['git', ...args], { cwd, env, stdout: 'ignore', stderr: 'pipe' });

  if ((await proc.exited) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
  }
}

async function createCommit(
  repo: string,
  env: Readonly<Record<string, string | undefined>>,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await Promise.all(
    Object.entries(files).map(([path, content]: readonly [string, string]) =>
      writeFile(join(repo, path), content),
    ),
  );

  await runGit(repo, env, ['add', '-A']);
  await runGit(repo, env, ['commit', '--quiet', '-m', 'change']);
}

async function runScript(cwd: string, env: Readonly<Record<string, string | undefined>>) {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, 'collect-branch-files.ts')], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

test('it lists the files a new branch with no upstream changes', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a', 'b.ts': 'b' });

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toIncludeSameMembers(['a.ts', 'b.ts']);
});

test('it lists only the branch files once the branch is pushed with an upstream', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });
  await ctx.runGit('push', '--quiet', '-u', 'origin', 'feature');

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it leaves out the files main gained after the branch started', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });
  await ctx.runGit('switch', '--quiet', 'main');
  await ctx.createCommit({ 'main.ts': 'main' });
  await ctx.runGit('push', '--quiet', 'origin', 'main');
  await ctx.runGit('switch', '--quiet', 'feature');

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it lists nothing when the branch has no commits of its own', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toBeEmpty();
});

test('it leaves out a file the branch deleted', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.runGit('rm', '--quiet', 'README.md');
  await ctx.createCommit({ 'a.ts': 'a' });

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it lists the new path of a file the branch renamed', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.runGit('mv', 'README.md', 'GUIDE.md');
  await ctx.runGit('commit', '--quiet', '-m', 'rename');

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['GUIDE.md']);
});

test('it falls back to origin/main when origin/HEAD is unset', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'set-head', 'origin', '--delete');
  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a' });

  const files = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env });

  expect(files).toStrictEqual(['a.ts']);
});

test('it rejects a repository with no origin', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'remove', 'origin');

  const rejection: unknown = await collectBranchFiles({ cwd: ctx.repo, env: ctx.env }).catch(
    (error: unknown) => error,
  );

  expect(rejection).toBeInstanceOf(Error);

  expect(rejection).toHaveProperty(
    'message',
    expect.toStartWith('cannot find the base of this branch'),
  );
});

test('it exits 1 with a message when run in a repository with no origin', async () => {
  const ctx = await setupTest();

  await ctx.runGit('remote', 'remove', 'origin');

  const run = await runScript(ctx.repo, ctx.env);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toBeEmpty();
  expect(run.stderr).toStartWith('collect-branch-files: cannot find the base of this branch');
});

test('it prints one file per line when run on a branch', async () => {
  const ctx = await setupTest();

  await ctx.runGit('switch', '--quiet', '--create', 'feature');
  await ctx.createCommit({ 'a.ts': 'a', 'b.ts': 'b' });

  const run = await runScript(ctx.repo, ctx.env);

  expect(run.exitCode).toBe(0);
  expect(run.stdout).toBe('a.ts\nb.ts\n');
});
