import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMockHeadResponse } from '../test-utils/build-mock-head-response.ts';
import { createStubGH } from '../test-utils/create-stub-gh.ts';
import { runBashScript } from '../test-utils/run-bash-script.ts';

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const directory = await mkdtemp(join(import.meta.dir, '.test-merge-release-prs-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const scriptPath = fileURLToPath(new URL('merge-release-prs.sh', import.meta.url));
  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  const runScript = (args: readonly string[], env: Readonly<Record<string, string>> = {}) =>
    runBashScript({
      script: scriptPath,
      args,
      stubDirectory: directory,

      // Polls without a pause; no test's outcome reads it.
      env: { POLL_INTERVAL: '0', GITHUB_OUTPUT: outputPath, ...env },
    });

  const readOutput = () => readFile(outputPath, 'utf8');

  return { writeResponses: gh.writeResponses, runScript, readCalls: gh.readCalls, readOutput };
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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #145 at abc123\n',
    stderr: '',
  });

  expect(
    calls.filter(
      (call) =>
        call ===
        'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    ),
  ).toHaveLength(4);

  expect(calls.at(-1)).toBe(`pr merge 145 --repo zgeoff/tools --squash --match-head-commit abc123`);

  const output = await ctx.readOutput();

  expect(output).toBe('merged=true\n');
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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #145 at new222\n',
    stderr: '',
  });

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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #145 at abc123\n',
    stderr: '',
  });

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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #145 at abc123\n',
    stderr: '',
  });

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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #145 at abc123\n',
    stderr: 'HTTP 502\n',
  });

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

    const result = await ctx.runScript(['zgeoff/tools']);
    const calls = await ctx.readCalls();

    expect({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toStrictEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'release PR #145 has failing checks on abc123: pr / checks\n',
    });

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

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'release PR #145 has failing checks on abc123: ci/legacy\n',
  });

  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();

  const output = await ctx.readOutput();

  expect(output).toBe('');
});

test('it turns on auto-merge and exits cleanly when only required checks outlast the wait', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);

  await ctx.writeResponses('rules', [
    [
      { type: 'pull_request' },
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'pr / checks' }] },
      },
    ],
  ]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const result = await ctx.runScript(['zgeoff/tools'], { CHECKS_TIMEOUT: '0' });
  const calls = await ctx.readCalls();
  const output = await ctx.readOutput();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'release PR #145 checks on abc123 did not finish within 0s; turning on auto-merge\n',
    stderr: '',
  });

  expect(output).toBe('');

  expect(calls.filter((call) => call.startsWith('pr merge'))).toStrictEqual([
    'pr merge 145 --repo zgeoff/tools --auto --squash --match-head-commit abc123',
  ]);
});

test('it leaves the release PR open without auto-merge when no ruleset requires a check', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);
  await ctx.writeResponses('rules', [[{ type: 'pull_request' }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const result = await ctx.runScript(['zgeoff/tools'], { CHECKS_TIMEOUT: '0' });
  const calls = await ctx.readCalls();
  const output = await ctx.readOutput();

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout:
      'release PR #145 checks on abc123 did not finish within 0s; a ruleset on main does not require every pending check, so the next push to main merges it\n',
  });

  expect(output).toBe('');
  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
});

test('it leaves the release PR open without auto-merge while a check the ruleset does not require runs', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);

  await ctx.writeResponses('rules', [
    [
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'pr / checks' }] },
      },
    ],
  ]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'pr / e2e', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const result = await ctx.runScript(['zgeoff/tools'], { CHECKS_TIMEOUT: '0' });
  const calls = await ctx.readCalls();

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout:
      'release PR #145 checks on abc123 did not finish within 0s; a ruleset on main does not require every pending check, so the next push to main merges it\n',
  });

  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
});

test('it exits cleanly with the PR open when auto-merge does not turn on', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('mergeable', [{ isDraft: false, labels: [], baseRefName: 'main' }]);
  await ctx.writeResponses('merges', ['error']);

  await ctx.writeResponses('rules', [
    [
      {
        type: 'required_status_checks',
        parameters: { required_status_checks: [{ context: 'pr / checks' }] },
      },
    ],
  ]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null },
    ]),
  ]);

  const result = await ctx.runScript(['zgeoff/tools'], { CHECKS_TIMEOUT: '0' });

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'release PR #145 checks on abc123 did not finish within 0s; turning on auto-merge\n',
    stderr:
      'HTTP 502\nrelease PR #145: auto-merge did not turn on; the next push to main merges it\n',
  });

  const output = await ctx.readOutput();

  expect(output).toBe('');
});

test('it leaves a held release PR without auto-merge when the checks outlast the wait', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);
  await ctx.writeResponses('heads', [buildMockHeadResponse('abc123', [])]);
  await ctx.writeResponses('mergeable', [{ mergeable: 'MERGEABLE', isDraft: true, labels: [] }]);

  const result = await ctx.runScript(['zgeoff/tools'], { CHECKS_TIMEOUT: '0' });
  const calls = await ctx.readCalls();

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: 'release PR #145 is held (a draft); leaving it open\n',
  });

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

  const result = await ctx.runScript(['zgeoff/tools']);

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr: 'release PR #145 has conflicts\n',
  });

  const output = await ctx.readOutput();

  expect(output).toBe('');
});

test('it exits cleanly when no release PR is open', async () => {
  const ctx = await setupTest();
  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  }).toStrictEqual({
    exitCode: 0,
    stdout: 'no open release PR\n',
    stderr: '',
  });

  expect(calls).toStrictEqual([
    'pr list --repo zgeoff/tools --head release-please--branches--main --json number,isDraft,labels',
  ]);

  const output = await ctx.readOutput();

  expect(output).toBe('');
});

test('it merges the release PR of the branch it is given', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 212 }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('cafe12', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = await ctx.runScript([
    'zgeoff/tools',
    'release-please--branches--main--components--@acme/kettle',
  ]);

  const calls = await ctx.readCalls();

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: 'merged release PR #212 at cafe12\n',
  });

  expect(calls.filter((call) => !call.startsWith('pr view'))).toStrictEqual([
    'pr list --repo zgeoff/tools --head release-please--branches--main--components--@acme/kettle --json number,isDraft,labels',
    'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main--components--@acme/kettle',
    'pr merge 212 --repo zgeoff/tools --squash --match-head-commit cafe12',
  ]);
});

test('it refuses more than two arguments', async () => {
  const ctx = await setupTest();
  const result = await ctx.runScript(['zgeoff/tools', 'release-please--branches--main', 'extra']);

  expect({ exitCode: result.exitCode, stderr: result.stderr }).toStrictEqual({
    exitCode: 2,
    stderr: 'usage: merge-release-prs.sh <owner/repo> [<release branch>]\n',
  });
});

test.each([
  ['a draft', { number: 145, isDraft: true, labels: [] }, 'a draft'],
  [
    'labelled autorelease: hold',
    {
      number: 145,
      isDraft: false,
      labels: [{ name: 'autorelease: pending' }, { name: 'autorelease: hold' }],
    },
    'labelled autorelease: hold',
  ],
])(
  'it leaves a release PR that is %s open, without a wait or a merge',
  async (_, listed, reason) => {
    const ctx = await setupTest();

    await ctx.writeResponses('prs', [[listed]]);

    const result = await ctx.runScript(['zgeoff/tools']);
    const calls = await ctx.readCalls();
    const output = await ctx.readOutput();

    expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
      exitCode: 0,
      stdout: `release PR #145 is held (${reason}); leaving it open\n`,
    });

    expect(calls).toStrictEqual([
      'pr list --repo zgeoff/tools --head release-please--branches--main --json number,isDraft,labels',
    ]);

    expect(output).toBe('');
  },
);

test('it leaves a release PR open when someone holds it during the wait', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145, isDraft: false, labels: [] }]]);

  await ctx.writeResponses('heads', [
    buildMockHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  await ctx.writeResponses('mergeable', [
    { mergeable: 'MERGEABLE', isDraft: false, labels: [{ name: 'autorelease: hold' }] },
  ]);

  const result = await ctx.runScript(['zgeoff/tools']);
  const calls = await ctx.readCalls();

  expect({ exitCode: result.exitCode, stdout: result.stdout }).toStrictEqual({
    exitCode: 0,
    stdout: 'release PR #145 is held (labelled autorelease: hold); leaving it open\n',
  });

  expect(calls.filter((call) => call.startsWith('pr merge'))).toBeEmpty();
});
