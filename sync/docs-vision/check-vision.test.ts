import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'check-vision-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // A pre-push hook in a linked worktree exports GIT_DIR, which would point git init and the
  // script's git calls at the real repository.
  const env = {
    PATH: process.env.PATH,
    HOME: directory,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };

  await $`git init -q`.cwd(directory).env(env).quiet();

  const scriptPath = fileURLToPath(new URL('check-vision.sh', import.meta.url));

  const writeText = async (path: string, text: string) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), text);
  };

  const run = (...args: readonly string[]) =>
    $`bash ${scriptPath} ${args}`.cwd(directory).env(env).nothrow().quiet();

  return { writeText, run };
}

test('it fails when the repo has no docs/vision.md', async () => {
  const ctx = await setupTest();
  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      "docs/vision.md: missing; write the vision doc the docs-writing skill's docs-tree reference describes (error)\n",
    stderr: '',
  });
});

test('it passes when docs/vision.md fits in 60 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeText('docs/vision.md', '- The relay serves one team.\n'.repeat(60));

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'docs/vision.md: 60 lines (vision doc; limit 60)\n',
    stderr: '',
  });
});

test('it fails when docs/vision.md runs past 60 lines', async () => {
  const ctx = await setupTest();

  await ctx.writeText('docs/vision.md', '- The relay serves one team.\n'.repeat(61));

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      'docs/vision.md: 61 lines, over the vision doc limit of 60 (error: cut points to fit one page)\n',
    stderr: '',
  });
});

test('it fails when git ignores docs/vision.md', async () => {
  const ctx = await setupTest();

  await ctx.writeText('.gitignore', 'docs/vision.md\n');
  await ctx.writeText('docs/vision.md', '- The relay serves one team.\n');

  const result = await ctx.run();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      "docs/vision.md: missing; write the vision doc the docs-writing skill's docs-tree reference describes (error)\n",
    stderr: '',
  });
});

test('it exits 2 when given an argument', async () => {
  const ctx = await setupTest();
  const result = await ctx.run('docs/other.md');

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: 'usage: check-vision.sh\n',
  });
});
