import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { copyNamedFiles } from '../../test-utils/copy-named-files.ts';
import { makeOutputRecordingRunner } from '../../test-utils/make-output-recording-runner.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { runDocsCheck } from './run-docs-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-docs-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repo = join(directory, 'repo');
  const env = readGitEnv(directory);

  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });

  const copyDocsScripts = (scripts: readonly string[]) =>
    copyNamedFiles(
      join(import.meta.dir, '../../packages/chex/src/docs'),
      join(repo, '.claude/skills/docs-writing/scripts'),
      scripts,
    );

  const trackFiles = async (files: Readonly<Record<string, string>>) => {
    await writeTreeFiles(repo, files);

    await $`git add -A`.cwd(repo).env({ ...env });
  };

  const recording = makeOutputRecordingRunner(runCommand);
  const output: string[] = [];

  const writeOutput = (text: string) => {
    output.push(text);
  };

  return {
    repo,
    env,
    copyDocsScripts,
    trackFiles,
    logged: recording.outputs,
    runLogged: recording.runCommand,
    output,
    writeOutput,
  };
}

test('it skips with a notice when the repo has no docs-writing scripts', async () => {
  const ctx = await setupTest();

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
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

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);
  await ctx.trackFiles({ 'README.md': '# Greeter\n\nRead the [guide](./guide.md).\n' });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.any(String),
    expect.any(String),
    expect.stringContaining('guide.md'),
  ]);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-links.sh failed; its output above holds each failing file and its fault\n',
  ]);
});

test('it fails on a README over its line limit even when every link resolves', async () => {
  const ctx = await setupTest();

  // The root README holds 100 lines at most, and this one has 101 and no link. Each line is a list
  // item, which the prose check's paragraph limit skips.
  const lines = Array.from(
    { length: 100 },
    (_, index) => `- Step ${index + 1} greets the visitor.`,
  );

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);
  await ctx.trackFiles({ 'README.md': `# Greeter\n${lines.join('\n')}\n` });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.logged).toStrictEqual([
    expect.any(String),
    expect.stringContaining('README.md: 101 lines, over the front page README limit of 100'),
    expect.any(String),
  ]);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-length.sh failed; its output above holds each failing file and its fault\n',
  ]);
});

test('it fails on a banned word in a doc', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);
  await ctx.trackFiles({ 'README.md': '# Greeter\n\nThe greeting is load-bearing.\n' });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-prose.sh failed; its output above holds each failing file and its fault\n',
  ]);
});

test('it runs the vision check that sits beside the docs scripts and the installed skill check', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts([
    'check-prose.sh',
    'check-length.sh',
    'check-links.sh',
    'check-vision.sh',
  ]);

  await copyNamedFiles(
    join(import.meta.dir, '../../packages/chex/src/docs'),
    join(ctx.repo, '.claude/skills/skill-writing/scripts'),
    ['check-skill.sh'],
  );

  await ctx.trackFiles({
    'README.md': '# Greeter\n',
    '.claude/skills/greeter/SKILL.md': '---\nname: greeter\n---\n',
  });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::docs: check-vision.sh failed; its output above holds each failing file and its fault\n',
    '::error::docs: check-skill.sh failed; its output above holds each failing file and its fault\n',
  ]);
});

test('it names the docs to a check-prose.sh that repo-sync delivered before chex, which needs a path', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts(['check-length.sh', 'check-links.sh']);

  await ctx.trackFiles({
    '.claude/skills/docs-writing/scripts/check-prose.sh':
      '[ "$#" -eq 0 ] && { echo "usage: check-prose.sh <path>..." >&2; exit 2; }\nprintf "%s\\n" "$@"\n',
    'README.md': '# Greeter\n',
    'guides/README.md': '# Guides\n',
    '.claude/notes/README.md': '# Notes\n',
  });

  const exitCode = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  expect(exitCode).toBe(0);

  expect(ctx.logged[0]).toBe(
    [
      'README.md',
      'guides/README.md',
      ':(glob)docs/**/*.md',
      ':(glob)**/results.md',
      ':(glob).agents/skills/**/*.md',
      ':(glob).claude/skills/**/*.md',
      ':(glob)skills/**/*.md',
      ':(glob)sync/skills/**/*.md',
      '',
    ].join('\n'),
  );
});

test('it reads the same docs as check-prose.sh reads with no path', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);

  await ctx.trackFiles({
    'README.md': '# Greeter\n\nThe greeting is load-bearing.\n',
    'guides/README.md': '# Guides\n\nThe guide is load-bearing.\n',
    '.claude/notes/README.md': '# Notes\n\nThe note is load-bearing.\n',
    '.claude/skills/greeter/README.md': '# Greeter skill\n\nThe skill is load-bearing.\n',
    'docs/tone.md': '# Tone\n\nThe tone is load-bearing.\n',
  });

  await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  });

  const bare = await runCommand(['bash', '.claude/skills/docs-writing/scripts/check-prose.sh'], {
    cwd: ctx.repo,
    env: ctx.env,
  });

  expect(ctx.logged[0]).toBe(`${bare.stdout}${bare.stderr}`);
});

test('it rejects, and starts no check, when git cannot list the READMEs', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts(['check-prose.sh', 'check-length.sh', 'check-links.sh']);
  await ctx.trackFiles({ 'README.md': '# Greeter\n' });

  await writeTreeFiles(ctx.repo, { '.git/index': 'not an index' });

  const outcome = await runDocsCheck({
    cwd: ctx.repo,
    env: ctx.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: ctx.runLogged,
    writeOutput: ctx.writeOutput,
  }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(outcome).toMatchObject({
    message: expect.stringMatching(/^git ls-files failed: fatal: .*index/u),
  });

  expect(ctx.logged).toStrictEqual([]);
  expect(ctx.output).toStrictEqual([]);
});
