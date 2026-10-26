import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

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
  const readFetchedURLs = () => readFile(join(bin, 'curl.urls'), 'utf8');

  const readFetchedFiles = async () => {
    const files = await readdir(runnerTemp);

    return files.toSorted();
  };

  // Runs the named steps with their env expressions and conditions, in cwd.
  const runSteps = (
    cwd: string,
    names: readonly string[],
    expressions: Readonly<Record<string, string>>,
    env: Readonly<Record<string, string | undefined>> = {},
  ) =>
    runWorkflowSteps(workflow, 'release', names, {
      cwd,
      env: {
        PATH: process.env['PATH'],
        RUNNER_TEMP: runnerTemp,
        GITHUB_REPOSITORY: 'zgeoff/tools',
        ...env,
      },
      expressions,
      outputPath,
    });

  return {
    directory,
    runnerTemp,
    runStep,
    runSteps,
    readOutput,
    readFetchedURLs,
    readFetchedFiles,
  };
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

test('it hands the merge script the release branch and the wait in seconds', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.runnerTemp, 'merge-release-prs.sh'),
    'echo "CHECKS_TIMEOUT=$CHECKS_TIMEOUT GH_TOKEN=$GH_TOKEN $*" > "$RUNNER_TEMP/merge.log"\n',
  );

  const exitCode = await ctx.runSteps(ctx.directory, ['Auto-merge release PRs'], {
    'steps.app-token.outputs.token': 'app-token',
    'inputs.merge': 'true',
    'inputs.release-branch': 'release-please--branches--main--components--@acme/kettle',
    'inputs.checks-timeout-minutes': '60',
  });

  expect(exitCode).toBe(0);

  const recorded = await readFile(join(ctx.runnerTemp, 'merge.log'), 'utf8');

  expect(recorded).toBe(
    'CHECKS_TIMEOUT=3600 GH_TOKEN=app-token zgeoff/tools release-please--branches--main--components--@acme/kettle\n',
  );
});

test.each([
  {
    step: "Check untagged releases against main's head",
    expressions: { 'steps.app-token.outputs.token': '', 'github.token': 'run-token' },
    token: 'run-token',
  },
  {
    step: "Check the merge against main's head",
    expressions: {
      'steps.app-token.outputs.token': 'app-token',
      'steps.merge.outputs.merged': 'true',
    },
    token: 'app-token',
  },
])('it runs the head check for "$step" on the repo with its token', async (row) => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.runnerTemp, 'check-release-head.sh'),
    'echo "GH_TOKEN=$GH_TOKEN $*" > "$RUNNER_TEMP/check.log"\n',
  );

  const exitCode = await ctx.runSteps(ctx.directory, [row.step], row.expressions);

  expect(exitCode).toBe(0);

  const recorded = await readFile(join(ctx.runnerTemp, 'check.log'), 'utf8');

  expect(recorded).toBe(`GH_TOKEN=${row.token} zgeoff/tools\n`);
});

test.each([
  {
    outcome: 'commits and pushes what the sync command changed',
    command: "printf 'fixed\\n' >> README.md",
    subject: 'chore: sync lockfile and format release files',
  },
  {
    outcome: 'pushes nothing when the sync command changed nothing',
    command: 'true',
    subject: 'change',
  },
])('it $outcome on the release branch', async (row) => {
  const ctx = await setupTest();

  const gitEnv = readGitEnv(ctx.directory);
  const remote = join(ctx.directory, 'remote.git');
  const clone = join(ctx.directory, 'clone');

  await runGit(ctx.directory, gitEnv, ['init', '--quiet', '--bare', remote]);
  await runGit(ctx.directory, gitEnv, ['clone', '--quiet', remote, clone]);
  await createGitCommit(clone, gitEnv, { 'README.md': 'kettle\n' });
  await runGit(clone, gitEnv, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  const exitCode = await ctx.runSteps(
    clone,
    ['Sync the release PR'],
    { 'steps.release.outputs.prs_created': 'true', 'inputs.sync-command': row.command },
    gitEnv,
  );

  expect(exitCode).toBe(0);

  const subject = await $`git -C ${remote} log -1 --format=%s`.env({ ...gitEnv }).text();

  expect(subject).toBe(`${row.subject}\n`);
});
