import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { createStubGH } from '../test-utils/create-stub-gh.ts';
import { runBashScript } from '../test-utils/run-bash-script.ts';

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-dispatch-tag-publish-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const scriptPath = fileURLToPath(new URL('dispatch-tag-publish.sh', import.meta.url));

  const runScript = (releaseOutputs: unknown) =>
    runBashScript({
      script: scriptPath,
      args: [],
      stubDirectory: directory,
      env: {
        RELEASE_OUTPUTS: JSON.stringify(releaseOutputs),
        GITHUB_REPOSITORY: 'zgeoff/tools',
      },
    });

  return { readCalls: gh.readCalls, runScript };
}

test('it dispatches main.yml at the tag of the first released path with every path', async () => {
  const ctx = await setupTest();

  const result = await ctx.runScript({
    paths_released: JSON.stringify(['packages/std', 'packages/chex']),
    'packages/std--sha': 'abc123',
    'packages/std--tag_name': '@zgeoff/std@1.2.0',
    'packages/chex--sha': 'abc123',
    'packages/chex--tag_name': '@zgeoff/chex@3.0.1',
  });

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });

  const calls = await ctx.readCalls();

  expect(calls).toStrictEqual([
    'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@1.2.0 -f republish_paths=["packages/std","packages/chex"]',
  ]);
});

test('it refuses packages released from different commits and dispatches nothing', async () => {
  const ctx = await setupTest();

  const result = await ctx.runScript({
    paths_released: JSON.stringify(['packages/std', 'packages/chex']),
    'packages/std--sha': 'abc123',
    'packages/std--tag_name': '@zgeoff/std@1.2.0',
    'packages/chex--sha': 'def456',
    'packages/chex--tag_name': '@zgeoff/chex@3.0.1',
  });

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '::error::expected one release commit, got: abc123 def456\n',
    stderr: '',
  });

  const calls = await ctx.readCalls();

  expect(calls).toStrictEqual([]);
});

test('it refuses a release that names no commit', async () => {
  const ctx = await setupTest();

  const result = await ctx.runScript({
    paths_released: JSON.stringify(['packages/std']),
    'packages/std--tag_name': '@zgeoff/std@1.2.0',
  });

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '::error::expected one release commit, got: null\n',
    stderr: '',
  });

  const calls = await ctx.readCalls();

  expect(calls).toStrictEqual([]);
});

test('it accepts paths_released as a plain array', async () => {
  const ctx = await setupTest();

  const result = await ctx.runScript({
    paths_released: ['packages/std'],
    'packages/std--sha': 'abc123',
    'packages/std--tag_name': '@zgeoff/std@1.2.0',
  });

  expect(result.exitCode).toBe(0);

  const calls = await ctx.readCalls();

  expect(calls).toStrictEqual([
    'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@1.2.0 -f republish_paths=["packages/std"]',
  ]);
});
