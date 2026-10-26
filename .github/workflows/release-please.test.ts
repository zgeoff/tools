import { expect, onTestFinished, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { buildMockHeadResponse } from '../../test-utils/build-mock-head-response.ts';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
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
        PATH: `${bin}:${process.env['PATH']}`,
        RUNNER_TEMP: runnerTemp,
        GITHUB_REPOSITORY: 'zgeoff/tools',
        POLL_INTERVAL: '0',
        ...env,
      },
      expressions,
      outputPath,
    });

  // Puts the repo's own release scripts where the fetch step leaves them,
  // and a stub gh at the GitHub boundary.
  const installReleaseScripts = async () => {
    for (const script of ['check-release-head.sh', 'merge-release-prs.sh']) {
      await copyFile(
        join(import.meta.dir, '..', '..', 'scripts', script),
        join(runnerTemp, script),
      );
    }

    return createStubGH(bin);
  };

  return {
    directory,
    installReleaseScripts,
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

test('it merges the release PR of the branch the caller names', async () => {
  const ctx = await setupTest();
  const gh = await ctx.installReleaseScripts();

  await gh.writeResponses('prs', [[{ number: 212 }]]);

  await gh.writeResponses('heads', [
    buildMockHeadResponse('cafe12', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const exitCode = await ctx.runSteps(ctx.directory, ['Auto-merge release PRs'], {
    'steps.app-token.outputs.token': 'app-token',
    'inputs.merge': 'true',
    'inputs.release-branch': 'release-please--branches--main--components--@acme/kettle',
    'inputs.checks-timeout-minutes': '15',
  });

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

test("it leaves the release PR open once the caller's wait in minutes runs out", async () => {
  const ctx = await setupTest();
  const gh = await ctx.installReleaseScripts();

  await gh.writeResponses('prs', [[{ number: 212 }]]);
  await gh.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);

  await gh.writeResponses('heads', [
    buildMockHeadResponse('cafe12', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const exitCode = await ctx.runSteps(ctx.directory, ['Auto-merge release PRs'], {
    'steps.app-token.outputs.token': 'app-token',
    'inputs.merge': 'true',
    'inputs.release-branch': 'release-please--branches--main',
    'inputs.checks-timeout-minutes': '0',
  });

  expect(exitCode).toBe(0);

  const calls = await gh.readCalls();

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
    const gh = await ctx.installReleaseScripts();

    await gh.writeResponses('prs', [
      [{ number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' }],
    ]);

    await gh.writeResponses('commits', [{ sha: 'head222' }]);
    await gh.writeResponses('compares', [{ files: [{ filename: '.github/workflows/ci.yml' }] }]);

    const exitCode = await ctx.runSteps(ctx.directory, [row.step], row.expressions);

    expect(exitCode).toBe(1);

    const calls = await gh.readCalls();

    expect(calls).toStrictEqual([
      'pr list --repo zgeoff/tools --state merged --label autorelease: pending --json number,mergeCommit,baseRefName',
      'api repos/zgeoff/tools/commits/main',
      'api repos/zgeoff/tools/compare/merge111...head222',
    ]);
  },
);

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
