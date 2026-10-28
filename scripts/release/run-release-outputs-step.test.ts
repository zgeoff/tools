import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runReleaseOutputsStep } from './run-release-outputs-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-release-outputs-step-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  const output: string[] = [];

  const runStep = (env: Readonly<Record<string, string | undefined>>) =>
    runReleaseOutputsStep({
      env,
      fileSystem: nodeFileSystem,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readOutputFile = () => readFile(outputPath, 'utf8');

  return { outputPath, output, runStep, readOutputFile };
}

test('it writes the release outputs to the GITHUB_OUTPUT file', async () => {
  const ctx = await setupTest();

  const releaseOutputs = JSON.stringify({
    releases_created: 'true',
    tag_name: 'v4.2.1',
    version: '4.2.1',
  });

  const exitCode = await ctx.runStep({
    RELEASE_OUTPUTS: releaseOutputs,
    GITHUB_OUTPUT: ctx.outputPath,
  });

  const outputFile = await ctx.readOutputFile();

  expect(exitCode).toBe(0);

  expect(outputFile).toBe(
    `releases_created=true\ntag=v4.2.1\nversion=4.2.1\nrelease-outputs=${releaseOutputs}\n`,
  );
});

test('it fails and writes no output when it cannot read the release outputs', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.runStep({
    RELEASE_OUTPUTS: '{"releases_created":"true","paths_released":"packages/std"}',
    GITHUB_OUTPUT: ctx.outputPath,
  });

  const outputFile = await ctx.readOutputFile();

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    '::error::RELEASE_OUTPUTS: paths_released holds no JSON array of paths\n',
  ]);

  expect(outputFile).toBe('');
});

test('it fails when the step has no GITHUB_OUTPUT', async () => {
  const ctx = await setupTest();
  const exitCode = await ctx.runStep({ RELEASE_OUTPUTS: '{}' });

  expect(exitCode).toBe(1);
  expect(ctx.output).toStrictEqual(['::error::the release outputs step needs GITHUB_OUTPUT\n']);
});
