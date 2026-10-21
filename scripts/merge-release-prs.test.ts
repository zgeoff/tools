import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockHeadResponse } from '../test-utils/build-mock-head-response.ts';
import { createStubGH } from '../test-utils/create-stub-gh.ts';

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const directory = await mkdtemp(join(import.meta.dir, '.test-merge-release-prs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const scriptPath = fileURLToPath(new URL('merge-release-prs.sh', import.meta.url));

  const runScript = (env: Record<string, string> = {}) =>
    spawnSync('bash', [scriptPath, 'zgeoff/tools'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env['PATH']}`,
        POLL_INTERVAL: '0',
        ...env,
      },
    });

  return { writeResponses: gh.writeResponses, runScript, readCalls: gh.readCalls };
}

test('it waits for checks that have not started yet, then merges the checked head', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', []),
    buildMockHeadResponse('abc123', []),
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('merged release PR #145 at abc123\n');

  expect(
    calls.filter(
      (call) =>
        call ===
        'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    ),
  ).toHaveLength(4);

  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit abc123`);
});

test('it waits on the head a push moved the branch to, and merges that head', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('old111', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
    buildMockHeadResponse('new222', []),
    buildMockHeadResponse('new222', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);

  expect(
    calls.filter(
      (call) =>
        call ===
        'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    ),
  ).toHaveLength(3);

  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit new222`);
});

test('it waits for the GitHub Actions checks when other apps pass first', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  const socket = {
    name: 'Socket Security: Project Report',
    status: 'COMPLETED',
    conclusion: 'SUCCESS',
    app: 'socket-security',
  };

  const coderabbit = { context: 'CodeRabbit', state: 'SUCCESS' };

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [], [coderabbit]),
    buildMockHeadResponse('abc123', [socket], [coderabbit]),
    buildMockHeadResponse(
      'abc123',
      [socket, { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null }],
      [coderabbit],
    ),
    buildMockHeadResponse(
      'abc123',
      [socket, { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      [coderabbit],
    ),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);

  expect(
    calls.filter(
      (call) =>
        call ===
        'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    ),
  ).toHaveLength(4);

  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit abc123`);
});

test('it counts skipped checks and passed commit statuses as passed', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse(
      'abc123',
      [
        { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'pr / gitleaks', status: 'COMPLETED', conclusion: 'SKIPPED' },
      ],
      [{ context: 'CodeRabbit', state: 'SUCCESS' }],
    ),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);
  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit abc123`);
});

test('it retries a poll whose API call fails', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    'error',
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);
  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit abc123`);
});

test.each(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])(
  'it fails without a merge when a check ends with %s',
  async (conclusion) => {
    const ctx = await setupTest();

    await ctx.writeResponses('prs', [[{ number: 145 }]]);

    await ctx.writeResponses('heads', [
      buildMockHeadResponse('abc123', [
        { name: 'pr / checks', status: 'COMPLETED', conclusion },
        { name: 'pr / gitleaks', status: 'COMPLETED', conclusion: 'SUCCESS' },
      ]),
    ]);

    const result = ctx.runScript();

    const calls = await ctx.readCalls();

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('release PR #145 has failing checks on abc123: pr / checks\n');
    expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
  },
);

test('it fails without a merge when a commit status fails', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse(
      'abc123',
      [{ name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' }],
      [{ context: 'ci/legacy', state: 'ERROR' }],
    ),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(1);
  expect(result.stderr).toBe('release PR #145 has failing checks on abc123: ci/legacy\n');
  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
});

test('it fails without a merge when the checks do not finish before the timeout', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('heads', [buildMockHeadResponse('abc123', [])]);

  const result = ctx.runScript({ CHECKS_TIMEOUT: '0' });

  const calls = await ctx.readCalls();

  expect(result.status).toBe(1);
  expect(result.stderr).toBe('release PR #145 checks on abc123 did not finish within 0s\n');
  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
});

test('it fails when the release PR has conflicts', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  await ctx.writeResponses('mergeable', [{ mergeable: 'CONFLICTING' }]);

  const result = ctx.runScript();

  expect(result.status).toBe(1);
  expect(result.stderr).toBe('release PR #145 has conflicts\n');
});

test('it exits cleanly when no release PR is open', async () => {
  const ctx = await setupTest();

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);
  expect(result.stdout).toBe('no open release PR\n');

  expect(calls).toStrictEqual([
    'pr list --repo zgeoff/tools --head release-please--branches--main --json number',
  ]);
});
