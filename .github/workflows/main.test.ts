import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'main-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const outputPath = join(directory, 'output');

  // Resolves the release commit and dispatches the publish, from the outputs
  // of the shared release job; the run started at old111.
  const runPublishSteps = (expressions: Readonly<Record<string, string>>) =>
    runWorkflowSteps(
      join(import.meta.dir, 'main.yml'),
      'publish',
      ['Resolve release commit', 'Dispatch publish at the release tag'],
      {
        cwd: directory,
        env: {
          PATH: `${directory}:${process.env['PATH']}`,
          GITHUB_REPOSITORY: 'zgeoff/tools',
          GITHUB_SHA: 'old111',
        },
        expressions: { 'github.token': 'app-token', ...expressions },
        outputPath,
      },
    );

  return { gh, outputPath, runPublishSteps };
}

test('it dispatches the publish at the tag, with every released path, for a release the merge run tagged', async () => {
  const ctx = await setupTest();

  // The release job tagged the release PR it merged, at merge222.
  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--sha': 'merge222',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/tsconfig--sha': 'merge222',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
  };

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'true',
    'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
  });

  const calls = await ctx.gh.readCalls();

  expect({ exitCode, calls }).toStrictEqual({
    exitCode: 0,
    calls: [
      'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@0.4.0 -f republish_paths=["packages/std","packages/tsconfig"]',
    ],
  });
});

test('it publishes in the run itself when the release tagged its own commit', async () => {
  const ctx = await setupTest();

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'old111',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
  };

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'true',
    'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
  });

  const output = await readFile(ctx.outputPath, 'utf8');
  const calls = await ctx.gh.readCalls();

  expect({ exitCode, output, calls }).toStrictEqual({
    exitCode: 0,
    output: ['tag=@zgeoff/std@0.4.0', 'paths=["packages/std"]', 'here=true', ''].join('\n'),
    calls: [],
  });
});

test('it neither resolves nor dispatches when the release job tagged nothing', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'false',
    'steps.release-commit.outputs.here': '',
  });

  const calls = await ctx.gh.readCalls();

  expect({ exitCode, calls }).toStrictEqual({ exitCode: 0, calls: [] });
});
