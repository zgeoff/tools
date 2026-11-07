import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { readGitEnv, readRunFolderPrefix, writeTreeFiles } from '@zgeoff/testing/helpers';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { runTrackedLinksCheck } from './run-tracked-links-check.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-run-tracked-links-check-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  const runGit = (argv: readonly string[]) =>
    runCheckedCommand(runCommand, ['git', ...argv], { cwd: directory, env });

  await runGit(['init', '--quiet']);

  const output: string[] = [];

  const runCheck = () =>
    runTrackedLinksCheck({
      cwd: directory,
      env,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  return { directory, env, output, runGit, runCheck };
}

test('it exits 0 when a tracked link points at a folder that holds a tracked file', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    '.claude/settings.json': '{}',
    '.agents/skills/.gitkeep': '',
  });

  await symlink('../.agents/skills', join(ctx.directory, '.claude', 'skills'));

  await ctx.runGit(['add', '.claude', '.agents/skills/.gitkeep']);

  const exitCode = await ctx.runCheck();

  expect({ exitCode, output: ctx.output }).toStrictEqual({ exitCode: 0, output: [] });
});

test('it exits 1 and names the link when its target folder holds only untracked files', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    '.claude/settings.json': '{}',
    '.agents/skills/code-style/SKILL.md': '# Code style\n',
  });

  await symlink('../.agents/skills', join(ctx.directory, '.claude', 'skills'));

  await ctx.runGit(['add', '.claude']);

  const exitCode = await ctx.runCheck();

  expect({ exitCode, output: ctx.output }).toStrictEqual({
    exitCode: 1,
    output: [
      'tracked-links: .claude/skills links to .agents/skills, which a fresh clone lacks; track it, or a file in it such as .agents/skills/.gitkeep\n',
    ],
  });
});

test('it exits 0 when the staged link points at a tracked folder and the unstaged link points at a missing one', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    '.claude/settings.json': '{}',
    '.agents/skills/.gitkeep': '',
  });

  const linkPath = join(ctx.directory, '.claude', 'skills');

  await symlink('../.agents/skills', linkPath);

  await ctx.runGit(['add', '.claude', '.agents/skills/.gitkeep']);

  await rm(linkPath);
  await symlink('../.agents/missing', linkPath);

  const exitCode = await ctx.runCheck();

  expect({ exitCode, output: ctx.output }).toStrictEqual({ exitCode: 0, output: [] });
});

test.each([
  {
    condition: 'its target leaves the repo',
    file: 'vendor/readme.md',
    link: { path: 'vendor/lib', target: '../../shared/lib' },
    message: 'vendor/lib links to ../../shared/lib, which leads outside the repo',
  },
  {
    condition: 'its target needs a tracked file to be a folder',
    file: 'docs/notes.md',
    link: { path: 'docs/notes', target: 'notes.md/' },
    message:
      'docs/notes links through docs/notes.md, a tracked file where its target needs a folder',
  },
  {
    condition: 'it links to itself',
    file: 'readme.md',
    link: { path: 'loop', target: 'loop' },
    message: 'loop reaches its target through more than 40 links, which Linux refuses',
  },
])('it exits 1 and names the cause when $condition', async (row) => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { [row.file]: '' });
  await symlink(row.link.target, join(ctx.directory, row.link.path));

  await ctx.runGit(['add', row.file, row.link.path]);

  const exitCode = await ctx.runCheck();

  expect({ exitCode, output: ctx.output }).toStrictEqual({
    exitCode: 1,
    output: [`tracked-links: ${row.message}\n`],
  });
});

test('it skips a link that a merge leaves in conflict', async () => {
  const ctx = await setupTest();

  const linkPath = join(ctx.directory, 'docs', 'guide');

  await writeTreeFiles(ctx.directory, { 'docs/intro.md': '# Intro\n' });
  await symlink('intro.md', linkPath);

  await ctx.runGit(['add', 'docs']);
  await ctx.runGit(['commit', '--quiet', '-m', 'add the guide link']);
  await ctx.runGit(['switch', '--quiet', '-c', 'side']);

  await rm(linkPath);
  await symlink('missing-on-side.md', linkPath);

  await ctx.runGit(['commit', '--quiet', '-am', 'point the guide link at the side page']);
  await ctx.runGit(['switch', '--quiet', '-']);

  await rm(linkPath);
  await symlink('missing-on-base.md', linkPath);

  await ctx.runGit(['commit', '--quiet', '-am', 'point the guide link at the base page']);

  await runCommand(['git', 'merge', '--quiet', 'side'], { cwd: ctx.directory, env: ctx.env });

  const exitCode = await ctx.runCheck();

  expect({ exitCode, output: ctx.output }).toStrictEqual({ exitCode: 0, output: [] });
});
