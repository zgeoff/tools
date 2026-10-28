import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { commitAuditFix } from './commit-audit-fix.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-commit-audit-fix-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gitEnv = readGitEnv(directory);
  const remote = join(directory, 'remote.git');
  const clone = join(directory, 'clone');
  const runnerTemp = join(directory, 'runner');
  const bin = join(directory, 'bin');
  const outputPath = join(runnerTemp, 'output');

  await mkdir(runnerTemp);
  await mkdir(bin);
  await writeFile(outputPath, '');

  const gh = await createStubGH(bin);

  await runGit(directory, gitEnv, ['init', '--quiet', '--bare', '--initial-branch=main', remote]);
  await runGit(directory, gitEnv, ['clone', '--quiet', remote, clone]);

  const output: string[] = [];

  const runCommit = () =>
    commitAuditFix({
      cwd: clone,
      env: { ...gitEnv, PATH: `${bin}:${process.env['PATH']}` },
      runnerTemp,
      base: 'main',
      defaultBranch: 'main',
      outputPath,
      fileSystem: nodeFileSystem,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const writeAuditResult = (files: Readonly<Record<string, string>>) =>
    writeTreeFiles(runnerTemp, files);

  const readRemoteBranches = async () => {
    const refs =
      await $`git -C ${remote} for-each-ref ${'--format=%(refname:short) %(subject)'} refs/heads`
        .env({ ...gitEnv })
        .text();

    return refs.split('\n').filter((line) => line !== '');
  };

  const readRemoteHead = (branch: string) =>
    $`git -C ${remote} rev-parse ${branch}`.env({ ...gitEnv }).text();

  const readOutput = () => readFile(outputPath, 'utf8');

  return {
    clone,
    gitEnv,
    gh,
    output,
    runCommit,
    writeAuditResult,
    readRemoteBranches,
    readRemoteHead,
    readOutput,
  };
}

test('it commits the fix under the title the audit wrote and force-pushes the fix branch', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);
  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'needs-review.txt': 'false\n',
  });

  const exitCode = await ctx.runCommit();
  const branches = await ctx.readRemoteBranches();
  const output = await ctx.readOutput();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['audit-fix fix(deps): update kettle to 1.0.1', 'main change']);
  expect(output).toBe('pushed=true\n');
});

test('it deletes the fix branch and pushes nothing when the audit changed nothing', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:audit-fix']);

  await ctx.writeAuditResult({ 'title.txt': '', 'needs-review.txt': 'false\n' });

  const exitCode = await ctx.runCommit();
  const branches = await ctx.readRemoteBranches();
  const output = await ctx.readOutput();

  expect(exitCode).toBe(0);
  expect(branches).toStrictEqual(['main change']);
  expect(output).toBe('pushed=false\n');
});

test('it fails without a push when the audit changed files but wrote no title', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);
  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  await ctx.writeAuditResult({ 'title.txt': '', 'needs-review.txt': 'false\n' });

  const exitCode = await ctx.runCommit();
  const branches = await ctx.readRemoteBranches();
  const output = await ctx.readOutput();

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::audit-fix changed files but wrote no pull-request title\n',
  ]);

  expect(branches).toStrictEqual(['main change']);
  expect(output).toBe('');
});

test('it leaves the fix branch alone when it already holds the same tree', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);
  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.runCommit();

  const before = await ctx.readRemoteHead('audit-fix');

  await runGit(ctx.clone, ctx.gitEnv, ['checkout', '--quiet', 'main']);
  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  const exitCode = await ctx.runCommit();
  const after = await ctx.readRemoteHead('audit-fix');
  const output = await ctx.readOutput();

  expect(exitCode).toBe(0);
  expect(after).toBe(before);
  expect(ctx.output).toStrictEqual(['The open fix already holds this change.\n']);
  expect(output).toBe('pushed=true\npushed=true\n');
});

test('it turns auto-merge off on the open pull request before it pushes an ignore', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);

  await writeTreeFiles(ctx.clone, { 'audit-ignores.json': '{"GHSA-1234":{}}\n' });

  await ctx.writeAuditResult({
    'title.txt': 'chore(deps): ignore GHSA-1234\n',
    'needs-review.txt': 'true\n',
  });

  await ctx.runCommit();

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'pr list --head audit-fix --state open --json number',
    'pr merge audit-fix --disable-auto',
  ]);
});

test('it leaves auto-merge alone for a fix that needs no review', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);

  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.runCommit();

  const calls = await ctx.gh.readCalls();

  expect(calls).toBeEmpty();
});

test('it fails and writes no output when the push of the fix branch fails', async () => {
  const ctx = await setupTest();

  await createGitCommit(ctx.clone, ctx.gitEnv, { 'bun.lock': 'kettle 1.0.0\n' });
  await runGit(ctx.clone, ctx.gitEnv, ['push', '--quiet', 'origin', 'HEAD:main']);
  await writeTreeFiles(ctx.clone, { 'bun.lock': 'kettle 1.0.1\n' });

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'needs-review.txt': 'false\n',
  });

  await runGit(ctx.clone, ctx.gitEnv, ['remote', 'set-url', 'origin', join(ctx.clone, 'gone.git')]);

  expect(ctx.runCommit()).rejects.toThrow('git push --force origin audit-fix exited with 128');

  const output = await ctx.readOutput();

  expect(output).toBe('');
});
