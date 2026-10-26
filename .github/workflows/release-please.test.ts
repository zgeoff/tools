import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildMockHeadResponse } from '../../test-utils/build-mock-head-response.ts';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { createStubClock } from '../../test-utils/create-stub-clock.ts';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { installReleaseScripts } from '../../test-utils/install-release-scripts.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runGit } from '../../test-utils/run-git.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'release-please-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'release-please.yml');
  const outputPath = join(directory, 'output');
  const stubDirectory = join(directory, 'bin');
  const runnerTemporaryDirectory = join(directory, 'runner');

  await writeFile(outputPath, '');
  await mkdir(stubDirectory);
  await mkdir(runnerTemporaryDirectory);

  const readOutput = () => readFile(outputPath, 'utf8');
  const readFetchedURLs = () => readFile(join(stubDirectory, 'curl.urls'), 'utf8');

  const readFetchedFiles = async () => {
    const files = await readdir(runnerTemporaryDirectory);

    return files.toSorted();
  };

  // Runs the named steps with their env expressions and conditions, in the
  // working directory.
  const runSteps = (
    workingDirectory: string,
    names: readonly string[],
    expressions: Readonly<Record<string, string>>,
    environment: Readonly<Record<string, string | undefined>> = {},
  ) =>
    runWorkflowSteps(workflow, 'release', names, {
      cwd: workingDirectory,
      env: {
        PATH: `${stubDirectory}:${process.env['PATH']}`,
        RUNNER_TEMP: runnerTemporaryDirectory,

        // Polls without a pause; no test's outcome reads it.
        POLL_INTERVAL: '0',
        ...environment,
      },
      expressions,
      outputPath,
    });

  return {
    directory,
    stubDirectory,
    runnerTemporaryDirectory,
    runSteps,
    readOutput,
    readFetchedURLs,
    readFetchedFiles,
  };
}

test('it downloads both release scripts from the commit that defines the job', async () => {
  const ctx = await setupTest();

  // A stub curl that answers every URL with the same body.
  await createStubCurl(ctx.stubDirectory, '# release script\n');

  const exitCode = await ctx.runSteps(ctx.directory, ['Fetch the release scripts'], {
    'job.workflow_repository': 'acme/tools',
    'job.workflow_sha': 'abc123',
  });

  expect(exitCode).toBe(0);

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

  // A stub curl that answers every URL with the same body.
  await createStubCurl(ctx.stubDirectory, '# release script\n');

  const exitCode = await ctx.runSteps(ctx.directory, ['Fetch the release scripts'], {
    'job.workflow_repository': 'acme/tools',
  });

  expect(exitCode).toBe(1);

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

  const exitCode = await ctx.runSteps(ctx.directory, ['Pick the release outputs'], {
    'steps.release.outputs.releases_created': 'false',
    'steps.release.outputs.paths_released': '[]',
    'steps.tag.outputs.releases_created': 'true',
    'steps.tag.outputs.paths_released': '["packages/std","packages/tsconfig"]',
    'steps.tag.outputs.packages/std--tag_name': '@zgeoff/std@0.4.0',
    'steps.tag.outputs.packages/std--version': '0.4.0',
    'steps.tag.outputs.packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
    'steps.tag.outputs.packages/tsconfig--version': '1.2.0',
  });

  expect(exitCode).toBe(0);

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

  // The tag step skipped, so its outputs read as empty.
  const exitCode = await ctx.runSteps(ctx.directory, ['Pick the release outputs'], {
    'steps.release.outputs.releases_created': 'true',
    'steps.release.outputs.release_created': 'true',
    'steps.release.outputs.paths_released': '["."]',
    'steps.release.outputs.tag_name': 'v4.2.1',
    'steps.release.outputs.version': '4.2.1',
    'steps.tag.outputs.releases_created': '',
  });

  expect(exitCode).toBe(0);

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

  const exitCode = await ctx.runSteps(ctx.directory, ['Pick the release outputs'], {
    'steps.release.outputs.releases_created': 'false',
    'steps.release.outputs.paths_released': '[]',
    'steps.release.outputs.prs_created': 'true',
    'steps.tag.outputs.releases_created': '',
  });

  expect(exitCode).toBe(0);

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

test('it merges the release PR of the branch the caller names', async () => {
  const ctx = await setupTest();

  await installReleaseScripts(ctx.runnerTemporaryDirectory);

  const gh = await createStubGH(ctx.stubDirectory);

  await gh.writeResponses('prs', [[{ number: 212 }]]);

  await gh.writeResponses('heads', [
    buildMockHeadResponse('cafe12', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const exitCode = await ctx.runSteps(
    ctx.directory,
    ['Auto-merge release PRs'],
    {
      'steps.app-token.outputs.token': 'app-token',
      'inputs.merge': 'true',
      'inputs.release-branch': 'release-please--branches--main--components--@acme/kettle',
      'inputs.checks-timeout-minutes': '15',
    },
    { GITHUB_REPOSITORY: 'zgeoff/tools' },
  );

  expect(exitCode).toBe(0);

  const calls = await gh.readCalls();

  expect(
    calls.filter((call) => call.startsWith('pr list') || call.startsWith('pr merge')),
  ).toStrictEqual([
    'pr list --repo zgeoff/tools --head release-please--branches--main--components--@acme/kettle --json number,isDraft,labels',
    'pr merge 212 --repo zgeoff/tools --squash --match-head-commit cafe12',
  ]);

  const output = await ctx.readOutput();

  expect(output).toBe('merged=true\n');
});

test("it waits exactly the caller's minutes, in seconds, before it leaves the release PR open", async () => {
  const ctx = await setupTest();

  await installReleaseScripts(ctx.runnerTemporaryDirectory);

  const gh = await createStubGH(ctx.stubDirectory);

  // The wait starts at 1000. Two minutes as 120 seconds polls again at 1119
  // and stops at 1120; any other conversion polls once or more than twice.
  await createStubClock(ctx.stubDirectory, [1000, 1119, 1120, 1121]);

  await gh.writeResponses('prs', [[{ number: 212 }]]);
  await gh.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);

  await gh.writeResponses('heads', [
    buildMockHeadResponse('cafe12', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const exitCode = await ctx.runSteps(
    ctx.directory,
    ['Auto-merge release PRs'],
    {
      'steps.app-token.outputs.token': 'app-token',
      'inputs.merge': 'true',
      'inputs.release-branch': 'release-please--branches--main',
      'inputs.checks-timeout-minutes': '2',
    },
    { GITHUB_REPOSITORY: 'zgeoff/tools' },
  );

  expect(exitCode).toBe(0);

  const calls = await gh.readCalls();

  expect(calls.filter((call) => call.startsWith('api graphql'))).toHaveLength(2);
  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();

  const output = await ctx.readOutput();

  expect(output).toBe('');
});

test.each([
  {
    step: "Check untagged releases against main's head",
    expressions: { 'steps.app-token.outputs.token': '', 'github.token': 'run-token' },
  },
  {
    step: "Check the merge against main's head",
    expressions: {
      'steps.app-token.outputs.token': 'app-token',
      'steps.merge.outputs.merged': 'true',
    },
  },
])(
  'it fails "$step" when main moved past a pending release with a workflow change',
  async (row) => {
    const ctx = await setupTest();

    await installReleaseScripts(ctx.runnerTemporaryDirectory);

    const gh = await createStubGH(ctx.stubDirectory);

    await gh.writeResponses('prs', [
      [{ number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' }],
    ]);

    await gh.writeResponses('commits', [{ sha: 'head222' }]);
    await gh.writeResponses('compares', [{ files: [{ filename: '.github/workflows/ci.yml' }] }]);

    const exitCode = await ctx.runSteps(ctx.directory, [row.step], row.expressions, {
      GITHUB_REPOSITORY: 'zgeoff/tools',
    });

    expect(exitCode).toBe(1);

    const calls = await gh.readCalls();

    expect(calls).toStrictEqual([
      'pr list --repo zgeoff/tools --state merged --label autorelease: pending --json number,mergeCommit,baseRefName',
      'api repos/zgeoff/tools/commits/main',
      'api repos/zgeoff/tools/compare/merge111...head222',
    ]);
  },
);

test('it commits and pushes what the sync command changed on the release branch', async () => {
  const ctx = await setupTest();

  const gitEnvironment = readGitEnv(ctx.directory);
  const remote = join(ctx.directory, 'remote.git');
  const clone = join(ctx.directory, 'clone');

  await runGit(ctx.directory, gitEnvironment, ['init', '--quiet', '--bare', remote]);
  await runGit(ctx.directory, gitEnvironment, ['clone', '--quiet', remote, clone]);
  await createGitCommit(clone, gitEnvironment, { 'README.md': 'kettle\n' });
  await runGit(clone, gitEnvironment, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  const exitCode = await ctx.runSteps(
    clone,
    ['Sync the release PR'],
    {
      'steps.release.outputs.prs_created': 'true',
      'inputs.sync-command': String.raw`printf 'fixed\n' >> README.md`,
    },
    gitEnvironment,
  );

  expect(exitCode).toBe(0);

  const pushed = await $`git -C ${remote} show HEAD:README.md`.env({ ...gitEnvironment }).text();

  expect(pushed).toBe('kettle\nfixed\n');

  const subject = await $`git -C ${remote} log -1 --format=%s`.env({ ...gitEnvironment }).text();

  expect(subject).toBe('chore: sync lockfile and format release files\n');
});

test('it pushes nothing to the release branch when the sync command changed nothing', async () => {
  const ctx = await setupTest();

  const gitEnvironment = readGitEnv(ctx.directory);
  const remote = join(ctx.directory, 'remote.git');
  const clone = join(ctx.directory, 'clone');

  await runGit(ctx.directory, gitEnvironment, ['init', '--quiet', '--bare', remote]);
  await runGit(ctx.directory, gitEnvironment, ['clone', '--quiet', remote, clone]);
  await createGitCommit(clone, gitEnvironment, { 'README.md': 'kettle\n' });
  await runGit(clone, gitEnvironment, ['push', '--quiet', '-u', 'origin', 'HEAD']);

  const before = await $`git -C ${remote} rev-parse HEAD`.env({ ...gitEnvironment }).text();

  const exitCode = await ctx.runSteps(
    clone,
    ['Sync the release PR'],
    { 'steps.release.outputs.prs_created': 'true', 'inputs.sync-command': 'true' },
    gitEnvironment,
  );

  expect(exitCode).toBe(0);

  const after = await $`git -C ${remote} rev-parse HEAD`.env({ ...gitEnvironment }).text();

  expect(after).toBe(before);
});
