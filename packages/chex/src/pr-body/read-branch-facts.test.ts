import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { createGitCommit, readGitEnv, runGit } from '@zgeoff/testing/git';
import { runProgram } from '../program/run-program.ts';
import { readBranchFacts } from './read-branch-facts.ts';
import { readDocPathspecs } from './read-doc-pathspecs.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('read-branch-facts-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'work');

  await runGit(directory, env, ['init', '--quiet', '--initial-branch=main', repo]);

  const base = await createGitCommit(repo, env, { 'src/app.ts': 'export const a = 1;\n' });

  return {
    base,
    createCommit: (files: Record<string, string>) => createGitCommit(repo, env, files),
    readFacts: (head: string, shas: readonly string[] = []) =>
      readBranchFacts({
        cwd: repo,
        env,
        runProgram,
        pathspecs: readDocPathspecs(),
        base,
        head,
        shas,
      }),
  };
}

test('it lists no doc file and no newest change for a branch that changes only code', async () => {
  const ctx = await setupTest();
  const head = await ctx.createCommit({ 'src/app.ts': 'export const a = 2;\n' });

  const facts = ctx.readFacts(head);

  expect({ files: facts.docFiles, newest: facts.newestDocChange }).toStrictEqual({
    files: [],
    newest: undefined,
  });
});

test('it lists the READMEs, docs and skill files that the branch changes', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'README.md': '# App\n', 'docs/guide.md': '# Guide\n' });

  const head = await ctx.createCommit({
    '.agents/skills/demo/SKILL.md': '# Demo\n',
    'src/app.ts': 'export const a = 3;\n',
  });

  const facts = ctx.readFacts(head);

  expect(facts.docFiles.toSorted()).toStrictEqual([
    '.agents/skills/demo/SKILL.md',
    'README.md',
    'docs/guide.md',
  ]);
});

test('it names the newest commit that changes a doc file and the files it changes', async () => {
  const ctx = await setupTest();

  await ctx.createCommit({ 'README.md': '# App\n' });

  const skillCommit = await ctx.createCommit({ 'skills/demo/SKILL.md': '# Demo\n' });
  const head = await ctx.createCommit({ 'src/app.ts': 'export const a = 4;\n' });

  const facts = ctx.readFacts(head);

  expect(facts.newestDocChange).toStrictEqual({
    commit: skillCommit,
    files: ['skills/demo/SKILL.md'],
  });
});

test('it probes a sha as old, current, outside or unknown', async () => {
  const ctx = await setupTest();
  const early = await ctx.createCommit({ 'README.md': '# App\n' });
  const edit = await ctx.createCommit({ 'docs/guide.md': '# Guide\n' });
  const head = await ctx.createCommit({ 'src/app.ts': 'export const a = 5;\n' });

  const facts = ctx.readFacts(head, [early, edit, head, ctx.base, 'deadbee']);

  expect(facts.shaStates).toStrictEqual({
    [early]: 'old',
    [edit]: 'current',
    [head]: 'current',
    [ctx.base]: 'old',
    deadbee: 'unknown',
  });
});

test('it probes a commit that is not in head as outside', async () => {
  const ctx = await setupTest();
  const head = await ctx.createCommit({ 'README.md': '# App\n' });

  const facts = ctx.readFacts(ctx.base, [head]);

  expect(facts.shaStates).toStrictEqual({ [head]: 'outside' });
});
