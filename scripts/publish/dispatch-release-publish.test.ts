import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { runCommand } from '../ci/run-command.ts';
import { dispatchReleasePublish } from './dispatch-release-publish.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-dispatch-release-publish-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const errors: string[] = [];

  const runDispatch = (
    releaseOutputs: Readonly<Record<string, string>>,
    runEnv: Readonly<Record<string, string>> = {},
  ) =>
    dispatchReleasePublish({
      cwd: directory,
      env: { PATH: `${directory}:${process.env['PATH']}`, ...runEnv },
      repository: 'zgeoff/tools',
      releaseOutputsText: JSON.stringify(releaseOutputs),
      runCommand,
      writeError: (text) => {
        errors.push(text);
      },
    });

  return { gh, errors, runDispatch };
}

test('it dispatches the publish at the first tag, with every released path and version', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.runDispatch({
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--sha': 'merge222',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
    'packages/tsconfig--sha': 'merge222',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
    'packages/tsconfig--version': '1.2.0',
  });

  const calls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(calls).toStrictEqual([
    'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@0.4.0 -f republish_paths=["packages/std","packages/tsconfig"] -f released_versions={"packages/std":"0.4.0","packages/tsconfig":"1.2.0"}',
  ]);
});

test('it dispatches a release that tagged the commit of the run itself, like any other', async () => {
  const ctx = await setupTest();

  // The run's own commit is the one the release tagged.
  const exitCode = await ctx.runDispatch(
    {
      releases_created: 'true',
      paths_released: '["packages/std"]',
      'packages/std--sha': 'old111',
      'packages/std--tag_name': '@zgeoff/std@0.4.0',
      'packages/std--version': '0.4.0',
    },
    { GITHUB_SHA: 'old111' },
  );

  const calls = await ctx.gh.readCalls();

  expect(exitCode).toBe(0);

  expect(calls).toStrictEqual([
    'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@0.4.0 -f republish_paths=["packages/std"] -f released_versions={"packages/std":"0.4.0"}',
  ]);
});

test.each([
  [
    'two release commits',
    {
      paths_released: '["packages/std","packages/tsconfig"]',
      'packages/std--sha': 'merge222',
      'packages/std--tag_name': '@zgeoff/std@0.4.0',
      'packages/tsconfig--sha': 'merge333',
      'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
    },
    '::error::expected one release commit, got: merge222 merge333\n',
  ],
  [
    'a path with no release commit',
    { paths_released: '["packages/std"]', 'packages/std--tag_name': '@zgeoff/std@0.4.0' },
    '::error::expected one release commit, got: null\n',
  ],
  ['no released path', { paths_released: '[]' }, '::error::expected one release commit, got: \n'],
  [
    'no tag for its first path',
    { paths_released: '["packages/std"]', 'packages/std--sha': 'merge222' },
    '::error::the release outputs hold no tag for packages/std\n',
  ],
])('it dispatches nothing and fails for a release with %s', async (_label, outputs, error) => {
  const ctx = await setupTest();
  const exitCode = await ctx.runDispatch({ releases_created: 'true', ...outputs });
  const calls = await ctx.gh.readCalls();

  expect(exitCode).toBe(1);
  expect(ctx.errors).toStrictEqual([error]);
  expect(calls).toBeEmpty();
});
