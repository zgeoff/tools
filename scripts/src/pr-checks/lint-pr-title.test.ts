import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { runBashScript } from '../test-utils/run-bash-script.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, readRunFolderPrefix('.test-pr-checks-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stubs = join(directory, 'stubs');

  await mkdir(stubs);

  // The stand-in npm logs its call; the stand-in commitlint logs the title it reads and rejects or
  // accepts it as the test says.
  await writeFile(
    join(stubs, 'npm'),
    `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "npm $*" >> "$dir/calls.log"
`,
  );

  await writeFile(join(stubs, 'calls.log'), '');
  await chmod(join(stubs, 'npm'), 0o755);

  const installCommitlint = async (rejects: boolean) => {
    const bin = join(directory, 'commitlint', 'node_modules', '.bin');

    await mkdir(bin, { recursive: true });

    await writeFile(
      join(bin, 'commitlint'),
      `#!/usr/bin/env bash
title=$(cat)
echo "commitlint $title" >> "${join(stubs, 'calls.log')}"
${rejects ? 'echo "✖   subject may not be empty [subject-empty]"; exit 1' : 'exit 0'}
`,
    );

    await chmod(join(bin, 'commitlint'), 0o755);
  };

  const run = (script: string, env: Readonly<Record<string, string>>) =>
    runBashScript({
      script: fileURLToPath(new URL(script, import.meta.url)),
      args: [],
      stubDirectory: stubs,
      env: { RUNNER_TEMP: directory, CHEX: '@zgeoff/chex@9.9.9', REPO: 'acme/widgets', ...env },
    });

  const readCalls = async () => {
    const log = await readFile(join(stubs, 'calls.log'), 'utf8');

    return log
      .split('\n')
      .filter(Boolean)
      .map((call) => call.replaceAll(directory, '<dir>'));
  };

  return { directory, installCommitlint, run, readCalls };
}

test('it passes a title that commitlint accepts', async () => {
  const ctx = await setupTest();

  await ctx.installCommitlint(false);

  const result = await ctx.run('lint-pr-title.sh', {
    PR_TITLE: 'fix(api): retry a refused upload',
    COMMITLINT_CLI: '@commitlint/cli@1.0.0',
    COMMITLINT_CONFIG: '@zgeoff/commitlint-config@1.0.0',
  });

  const calls = await ctx.readCalls();
  const config = await readFile(join(ctx.directory, 'commitlint', 'commitlint.config.mjs'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(config).toBe("export default { extends: ['@zgeoff/commitlint-config'] };\n");

  expect(calls).toStrictEqual([
    'npm install --no-save --ignore-scripts --no-audit --no-fund @commitlint/cli@1.0.0 @zgeoff/commitlint-config@1.0.0',
    'commitlint fix(api): retry a refused upload',
  ]);
});

test('it prints the findings and the fix for a title that commitlint rejects', async () => {
  const ctx = await setupTest();

  await ctx.installCommitlint(true);

  const result = await ctx.run('lint-pr-title.sh', {
    PR_TITLE: 'Fixed the upload $(touch pwned)',
    COMMITLINT_CLI: '@commitlint/cli@1.0.0',
    COMMITLINT_CONFIG: '@zgeoff/commitlint-config@1.0.0',
  });

  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(1);
  expect(result.stdout).toContain('subject may not be empty [subject-empty]');

  expect(result.stderr).toContain(
    'Rename the PR title to a Conventional Commit in the imperative mood, such as "fix(api): retry a refused upload".',
  );

  expect(calls).toContain('commitlint Fixed the upload $(touch pwned)');
});
