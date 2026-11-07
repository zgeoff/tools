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

  return { directory, output, runGit, runCheck };
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
