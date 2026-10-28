import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubCommand } from '../../test-utils/create-stub-command.ts';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';
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
  // the outputs of the shared release job, with the run's env and expressions.
  const runPublishSteps = (
    environment: Readonly<Record<string, string>>,
    expressions: Readonly<Record<string, string>>,
  ) =>
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
          ...environment,
        },
        expressions,
        outputPath: join(directory, 'output'),
      },
    );

  const readToolCalls = () => readFile(toolLog, 'utf8');
  const workflow = join(import.meta.dir, 'main.yml');

  const setupShfmt = await loadWorkflowStep(workflow, 'checks', 'Setup shfmt');
  const setupActionlint = await loadWorkflowStep(workflow, 'checks', 'Setup actionlint');

  return { directory, gh, runPublishSteps, readToolCalls, setupShfmt, setupActionlint };
}

test('it installs shfmt into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.directory, 'fake shfmt\n');

  const result = await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.directory)
    .env({
      PATH: `${ctx.directory}:${process.env['PATH']}`,
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
    })
    .nothrow()
    .quiet();

  const installed = await readFile(join(ctx.directory, 'shfmt-bin/shfmt'), 'utf8');
  const stats = await stat(join(ctx.directory, 'shfmt-bin/shfmt'));
  const githubPath = await readFile(join(ctx.directory, 'github-path'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(installed).toBe('fake shfmt\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.directory, 'shfmt-bin')}\n`);
});

test('it installs actionlint from the release archive into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.directory, archive);

  const result = await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      PATH: `${ctx.directory}:${process.env['PATH']}`,
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      ACTIONLINT_VERSION: '1.7.12',
      ACTIONLINT_SHA256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
    })
    .nothrow()
    .quiet();

  const binary = await readFile(join(ctx.directory, 'actionlint-bin/actionlint'), 'utf8');
  const githubPath = await readFile(join(ctx.directory, 'github-path'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(binary).toBe('fake actionlint\n');
  expect(githubPath).toBe(`${join(ctx.directory, 'actionlint-bin')}\n`);
});

test('it dispatches the publish at the tag, with every released path, for a release the merge run tagged', async () => {
  const ctx = await setupTest();

  // The release job tagged the release PR it merged, at merge222, after this
  // run started at old111.
  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--sha': 'merge222',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/tsconfig--sha': 'merge222',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
  };

  const exitCode = await ctx.runPublishSteps(
    { GITHUB_REPOSITORY: 'zgeoff/tools', GITHUB_SHA: 'old111' },
    {
      'github.token': 'app-token',
      'needs.release.outputs.releases_created': 'true',
      'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
      'inputs.republish_paths': '',
    },
  );

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

  await writeTreeFiles(ctx.directory, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
  });

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'old111',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
  };

  const exitCode = await ctx.runPublishSteps(
    { GITHUB_REPOSITORY: 'zgeoff/tools', GITHUB_SHA: 'old111' },
    {
      'github.token': 'app-token',
      'needs.release.outputs.releases_created': 'true',
      'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
      'inputs.republish_paths': '',
    },
  );

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

  await writeTreeFiles(ctx.directory, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.3.9' }),
  });

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'old111',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/std--version': '0.4.0',
  };

  const exitCode = await ctx.runPublishSteps(
    { GITHUB_REPOSITORY: 'zgeoff/tools', GITHUB_SHA: 'old111' },
    {
      'github.token': 'app-token',
      'needs.release.outputs.releases_created': 'true',
      'needs.release.outputs.release-outputs': JSON.stringify(releaseOutputs),
      'inputs.republish_paths': '',
    },
  );

  expect(exitCode).toBe(1);

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe('');
});

test('it publishes the given paths in a republish run, which has no release outputs', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
  });

  const exitCode = await ctx.runPublishSteps(
    { GITHUB_REPOSITORY: 'zgeoff/tools', GITHUB_SHA: 'old111' },
    {
      'github.token': 'app-token',
      'needs.release.outputs.releases_created': '',
      'needs.release.outputs.release-outputs': '',
      'steps.release-commit.outputs.here': '',
      'steps.release-commit.outputs.paths': '',
      'inputs.republish_paths': '["packages/std"]',
    },
  );

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

  const exitCode = await ctx.runPublishSteps(
    { GITHUB_REPOSITORY: 'zgeoff/tools', GITHUB_SHA: 'old111' },
    {
      'github.token': 'app-token',
      'needs.release.outputs.releases_created': 'false',
      'steps.release-commit.outputs.here': '',
      'inputs.republish_paths': '',
    },
  );

  expect(exitCode).toBe(0);

  const calls = await ctx.gh.readCalls();

  expect(calls).toBeEmpty();

  const toolCalls = await ctx.readToolCalls();

  expect(toolCalls).toBe('');
});
