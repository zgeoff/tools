import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { loadWorkflowStep } from './load-workflow-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'release-please-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'release-please.yml');
  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  const runPick = async (outputs: Readonly<Record<string, string>>) => {
    const pick = await loadWorkflowStep(workflow, 'release', 'Pick the release outputs');

    const result = await $`bash -c ${pick.run}`
      .cwd(directory)
      .env({
        PATH: process.env['PATH'],
        RELEASE_OUTPUTS: JSON.stringify(outputs),
        GITHUB_OUTPUT: outputPath,
      })
      .nothrow()
      .quiet();

    const output = await readFile(outputPath, 'utf8');

    return { exitCode: result.exitCode, stderr: result.stderr.toString(), output };
  };

  return { runPick };
}

test('it reports the first package of a multi-package release that the tag step made', async () => {
  const ctx = await setupTest();

  const outputs = {
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
    'packages/tsconfig--version': '1.2.0',
  };

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=true',
      'tag=@zgeoff/std@0.4.0',
      'version=0.4.0',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
});

test('it reports the tag and version of a release of one package at the root', async () => {
  const ctx = await setupTest();

  const outputs = {
    releases_created: 'true',
    release_created: 'true',
    paths_released: '["."]',
    tag_name: 'v4.2.1',
    version: '4.2.1',
  };

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=true',
      'tag=v4.2.1',
      'version=4.2.1',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
});

test('it reports no release, tag or version for a run that released nothing', async () => {
  const ctx = await setupTest();

  const outputs = { releases_created: 'false', paths_released: '[]', prs_created: 'true' };

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=false',
      'tag=',
      'version=',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
});
