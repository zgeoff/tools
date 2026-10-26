import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubCurl } from './create-stub-curl.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'release-please-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'release-please.yml');
  const outputPath = join(directory, 'output');
  const bin = join(directory, 'bin');
  const runnerTemp = join(directory, 'runner');

  await writeFile(outputPath, '');
  await mkdir(bin);
  await mkdir(runnerTemp);

  // A stub curl that answers every URL with the same body.
  await createStubCurl(bin, '# release script\n');

  const runStep = async (name: string, env: Readonly<Record<string, string>>) => {
    const step = await loadWorkflowStep(workflow, 'release', name);

    const result = await $`bash -c ${step.run}`
      .cwd(directory)
      .env({
        PATH: `${bin}:${process.env['PATH']}`,
        GITHUB_OUTPUT: outputPath,
        RUNNER_TEMP: runnerTemp,
        ...env,
      })
      .nothrow()
      .quiet();

    return { exitCode: result.exitCode, stderr: result.stderr.toString() };
  };

  const readOutput = () => readFile(outputPath, 'utf8');

  const readFetchedURLs = async () => {
    const log = Bun.file(join(bin, 'curl.urls'));

    const exists = await log.exists();

    return exists ? log.text() : '';
  };

  const readFetchedFiles = async () => {
    const files = await readdir(runnerTemp);

    return files.toSorted();
  };

  return { runStep, readOutput, readFetchedURLs, readFetchedFiles };
}

test('it downloads both release scripts from the commit that defines the job', async () => {
  const ctx = await setupTest();

  const result = await ctx.runStep('Fetch the release scripts', {
    JOB_CONTEXT: '{"workflow_repository":"acme/tools","workflow_sha":"abc123"}',
  });

  expect(result).toStrictEqual({ exitCode: 0, stderr: '' });

  const urls = await ctx.readFetchedURLs();

  expect(urls).toBe(
    [
      'https://raw.githubusercontent.com/acme/tools/abc123/scripts/check-release-head.sh',
      'https://raw.githubusercontent.com/acme/tools/abc123/scripts/merge-release-prs.sh',
      '',
    ].join('\n'),
  );

  const files = await ctx.readFetchedFiles();

  expect(files).toStrictEqual(['check-release-head.sh', 'merge-release-prs.sh']);
});

test('it downloads nothing when the job context lacks the commit', async () => {
  const ctx = await setupTest();

  const result = await ctx.runStep('Fetch the release scripts', {
    JOB_CONTEXT: '{"workflow_repository":"acme/tools"}',
  });

  expect(result.exitCode).toBe(1);

  const urls = await ctx.readFetchedURLs();

  expect(urls).toBe('');

  const files = await ctx.readFetchedFiles();

  expect(files).toBeEmpty();
});

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

  const result = await ctx.runStep('Pick the release outputs', {
    RELEASE_OUTPUTS: JSON.stringify(outputs),
  });

  expect(result).toStrictEqual({ exitCode: 0, stderr: '' });

  const output = await ctx.readOutput();

  expect(output).toBe(
    [
      'releases_created=true',
      'tag=@zgeoff/std@0.4.0',
      'version=0.4.0',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  );
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

  const result = await ctx.runStep('Pick the release outputs', {
    RELEASE_OUTPUTS: JSON.stringify(outputs),
  });

  expect(result).toStrictEqual({ exitCode: 0, stderr: '' });

  const output = await ctx.readOutput();

  expect(output).toBe(
    [
      'releases_created=true',
      'tag=v4.2.1',
      'version=4.2.1',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  );
});

test('it reports no release, tag or version for a run that released nothing', async () => {
  const ctx = await setupTest();

  const outputs = { releases_created: 'false', paths_released: '[]', prs_created: 'true' };

  const result = await ctx.runStep('Pick the release outputs', {
    RELEASE_OUTPUTS: JSON.stringify(outputs),
  });

  expect(result).toStrictEqual({ exitCode: 0, stderr: '' });

  const output = await ctx.readOutput();

  expect(output).toBe(
    [
      'releases_created=false',
      'tag=',
      'version=',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  );
});
