import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { createStubCommand } from './create-stub-command.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'main-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const toolLog = join(directory, 'tools.log');

  await writeFile(toolLog, '');
  await createStubCommand(directory, 'bun', toolLog);
  await createStubCommand(directory, 'npm', toolLog);

  // Resolves the release commit, dispatches the publish, and publishes, from
  // the outputs of the shared release job; the run started at old111.
  const runPublishSteps = (expressions: Readonly<Record<string, string>>) =>
    runWorkflowSteps(
      join(import.meta.dir, 'main.yml'),
      'publish',
      [
        'Resolve release commit',
        'Dispatch publish at the release tag',
        'Publish released packages',
      ],
      {
        cwd: directory,
        env: {
          PATH: `${directory}:${process.env['PATH']}`,
          GITHUB_REPOSITORY: 'zgeoff/tools',
          GITHUB_SHA: 'old111',
        },
        expressions: { 'github.token': 'app-token', ...expressions },
        outputPath: join(directory, 'output'),
      },
    );

  const writePackageManifest = async (
    path: string,
    manifest: Readonly<Record<string, unknown>>,
  ) => {
    await mkdir(join(directory, path), { recursive: true });
    await writeFile(join(directory, path, 'package.json'), JSON.stringify(manifest));
  };

  const readToolCalls = () => readFile(toolLog, 'utf8');

  return { gh, runPublishSteps, writePackageManifest, readToolCalls };
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
    'inputs.republish_paths': '',
  });

  expect(exitCode).toBe(0);

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@0.4.0 -f republish_paths=["packages/std","packages/tsconfig"]',
  ]);

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe('');
});

test('it publishes the released paths in the run itself when the release tagged its own commit', async () => {
  const ctx = await setupTest();

  await ctx.writePackageManifest('packages/std', { name: '@zgeoff/std', version: '0.4.0' });

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'old111',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
  };

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'true',
    'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
    'inputs.republish_paths': '',
  });

  expect(exitCode).toBe(0);

  const calls = await ctx.gh.readCalls();

  expect(calls).toBeEmpty();

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe(
    [
      'npm view @zgeoff/std@0.4.0 version',
      'bun pm pack',
      'npm publish ./*.tgz --provenance --access public',
      '',
    ].join('\n'),
  );
});

test('it refuses to publish a package whose version the release did not tag', async () => {
  const ctx = await setupTest();

  await ctx.writePackageManifest('packages/std', { name: '@zgeoff/std', version: '0.3.9' });

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'old111',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
  };

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'true',
    'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
    'inputs.republish_paths': '',
  });

  expect(exitCode).toBe(1);

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe('');
});

test('it publishes the given paths in a republish run, which has no release outputs', async () => {
  const ctx = await setupTest();

  await ctx.writePackageManifest('packages/std', { name: '@zgeoff/std', version: '0.4.0' });

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': '',
    'needs.release.outputs.release-outputs': '',
    'steps.release-commit.outputs.here': '',
    'steps.release-commit.outputs.paths': '',
    'inputs.republish_paths': '["packages/std"]',
  });

  expect(exitCode).toBe(0);

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe(
    [
      'npm view @zgeoff/std@0.4.0 version',
      'bun pm pack',
      'npm publish ./*.tgz --provenance --access public',
      '',
    ].join('\n'),
  );
});

test('it neither resolves, dispatches nor publishes when the release job tagged nothing', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.runPublishSteps({
    'needs.release.outputs.releases_created': 'false',
    'steps.release-commit.outputs.here': '',
    'inputs.republish_paths': '',
  });

  expect(exitCode).toBe(0);

  const calls = await ctx.gh.readCalls();

  expect(calls).toBeEmpty();

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe('');
});
