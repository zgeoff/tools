import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
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

  return { repo, env, copyDocsScripts, trackFiles };
}

test('it skips with a notice when the repo has no docs-writing scripts', async () => {
  const ctx = await setupTest();
  const result = await runDocsCheck({ cwd: ctx.repo, env: ctx.env, runCommand });

  expect(result).toStrictEqual({
    exitCode: 0,
    output:
      '::notice::docs: skipped, because the repo has no .claude/skills/docs-writing/scripts/check-length.sh; take the skill-docs-writing entry of repo-sync to run it\n',
  });
});

test('it fails on a broken link even when every doc is within its length limit', async () => {
  const ctx = await setupTest();

  await ctx.copyDocsScripts();
  await ctx.trackFiles({ 'README.md': '# Greeter\n\nRead the [guide](./guide.md).\n' });

  const result = await runDocsCheck({ cwd: ctx.repo, env: ctx.env, runCommand });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('guide.md');
  expect(result.output).toInclude('::error::docs: check-links.sh failed');
  expect(result.output).not.toInclude('::error::docs: check-length.sh failed');
});

test('it fails on a README over its line limit even when every link resolves', async () => {
  const ctx = await setupTest();

  // The root README holds 100 lines at most, and this one has 101 and no link.
  const lines = Array.from({ length: 100 }, (_, index) => `Step ${index + 1} greets the visitor.`);

  await ctx.copyDocsScripts();
  await ctx.trackFiles({ 'README.md': `# Greeter\n${lines.join('\n')}\n` });

  const result = await runDocsCheck({ cwd: ctx.repo, env: ctx.env, runCommand });

  expect(result.exitCode).toBe(1);
  expect(result.output).toInclude('README.md: 101 lines, over the front page README limit of 100');
  expect(result.output).toInclude('::error::docs: check-length.sh failed');
  expect(result.output).not.toInclude('::error::docs: check-links.sh failed');
});
