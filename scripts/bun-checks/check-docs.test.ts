import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runDocsCheck } from './check-docs.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-check-docs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  const copyDocsScripts = () =>
    cp(
      join(import.meta.dir, '../../sync/skills/docs-writing/scripts'),
      join(repo, '.claude/skills/docs-writing/scripts'),
      { recursive: true },
    );

  const trackFiles = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, files);

    await $`git add -A`.cwd(repo).env({ ...env });
  };

  // Captures each logged command's output, which the CLI's runner prints as it runs.
  const logged: string[] = [];

  const runLogged: RunCommand = async (argv, options) => {
    const result = await runCommand(argv, options);

    logged.push(`${result.stdout}${result.stderr}`);

    return result;
  };

  const output: string[] = [];

  const writeOutput = (text: string) => {
    output.push(text);
  };

  return { repo, env, copyDocsScripts, trackFiles, logged, runLogged, output, writeOutput };
}

test('it skips with a notice when the repo has no docs-writing scripts', async () => {
  const ctx = await setupTest();

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(0);
  expect(ctx.logged).toStrictEqual([]);

  expect(ctx.output).toStrictEqual([
    '::notice::docs: skipped, because the repo has no .claude/skills/docs-writing/scripts/check-length.sh; take the skill-docs-writing entry of repo-sync to run it\n',
  ]);
});

test('it fails on a broken link even when every doc is within its length limit', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts();
  await ctx.trackFiles({ 'README.md': '# Greeter\n\nRead the [guide](./guide.md).\n' });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);
  expect(ctx.logged).toStrictEqual([expect.any(String), expect.stringContaining('guide.md')]);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-links.sh failed; its output above holds each failing file and its fault\n',
  ]);
});

test('it fails on a README over its line limit even when every link resolves', async () => {
  const ctx = await setupTest();

  // The root README holds 100 lines at most, and this one has 101 and no link.
  const lines = Array.from({ length: 100 }, (_, index) => `Step ${index + 1} greets the visitor.`);

  await ctx.copyDocsScripts();
  await ctx.trackFiles({ 'README.md': `# Greeter\n${lines.join('\n')}\n` });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.stringContaining('README.md: 101 lines, over the front page README limit of 100'),
    expect.any(String),
  ]);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-length.sh failed; its output above holds each failing file and its fault\n',
  ]);
});
