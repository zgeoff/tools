import { expect, onTestFinished, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stands in for the GitHub API: the nth call to an endpoint answers with line n
// of its response file, or the last line, and a body of "error" fails the call.
// calls.log records each call's arguments, less the GraphQL query.
const FAKE_GH = `#!/usr/bin/env bash
dir=$(dirname "$0")
call="$*"
printf '%s\\n' "\${call%% -f query=*}" >> "$dir/calls.log"
take() {
  local file="$dir/$1" n total
  [ -f "$file" ] || { printf '%s\\n' "$2"; return; }
  n=$(cat "$file.n" 2>/dev/null || echo 0)
  total=$(wc -l < "$file")
  body=$(sed -n "$(( n < total ? n + 1 : total ))p" "$file")
  echo $((n + 1)) > "$file.n"
  [ "$body" != '"error"' ] || { echo "HTTP 502" >&2; exit 1; }
  printf '%s\\n' "$body"
}
case "$*" in
  "pr list "*) take prs '[]' ;;
  "api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main -f query="*)
    take heads '' ;;
  "pr view "*) take mergeable '{"mergeable":"MERGEABLE"}' ;;
  "pr merge "*) ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;

interface Check {
  name: string;
  status: string;
  conclusion: string | null;
}

interface Status {
  context: string;
  state: string;
}

// The body GitHub returns for the script's query: the branch head, and its
// status rollup, which is null until the first check registers.
function buildHeadResponse(oid: string, checks: Check[], statuses: Status[] = []) {
  const nodes = [
    ...checks.map((check) => ({ __typename: 'CheckRun', ...check })),
    ...statuses.map((status) => ({ __typename: 'StatusContext', ...status })),
  ];

  const statusCheckRollup = nodes.length === 0 ? null : { contexts: { nodes } };

  return { data: { repository: { ref: { target: { oid, statusCheckRollup } } } } };
}

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const dir = await mkdtemp(join(import.meta.dir, '.test-merge-release-prs-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, 'gh'), FAKE_GH);
  await chmod(join(dir, 'gh'), 0o755);
  await writeFile(join(dir, 'calls.log'), '');

  const scriptPath = fileURLToPath(new URL('merge-release-prs.sh', import.meta.url));

  const writeResponses = async (name: string, bodies: unknown[]) => {
    await writeFile(join(dir, name), bodies.map((body) => `${JSON.stringify(body)}\n`).join(''));
  };

  const runScript = (env: Record<string, string> = {}) =>
    spawnSync('bash', [scriptPath, 'zgeoff/tools'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, POLL_INTERVAL: '0', ...env },
    });

  const readCalls = async () => {
    const log = await readFile(join(dir, 'calls.log'), 'utf8');

    return log.split('\n').filter(Boolean);
  };

  return { writeResponses, runScript, readCalls };
}

const HEAD_QUERY_CALL =
  'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main';

const MERGE_CALL = 'pr merge 145 --repo zgeoff/tools --squash --match-head-commit';

test('it waits for checks that have not started yet, then merges the checked head', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildHeadResponse('abc123', []),
    buildHeadResponse('abc123', []),
    buildHeadResponse('abc123', [{ name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null }]),
    buildHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  expect(result.stdout).toBe('merged release PR #145 at abc123\n');
  expect(calls.filter((call) => call === HEAD_QUERY_CALL)).toHaveLength(4);
  expect(calls.at(-1)).toBe(`${MERGE_CALL} abc123`);
});

test('it waits on the head a push moved the branch to, and merges that head', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildHeadResponse('old111', [{ name: 'pr / checks', status: 'IN_PROGRESS', conclusion: null }]),
    buildHeadResponse('new222', []),
    buildHeadResponse('new222', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);
  expect(calls.filter((call) => call === HEAD_QUERY_CALL)).toHaveLength(3);
  expect(calls.at(-1)).toBe(`${MERGE_CALL} new222`);
});

test('it counts skipped checks and passed commit statuses as passed', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    buildHeadResponse(
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
  expect(calls.at(-1)).toBe(`${MERGE_CALL} abc123`);
});

test('it retries a poll whose API call fails', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [[{ number: 145 }]]);

  await ctx.writeResponses('heads', [
    'error',
    buildHeadResponse('abc123', [
      { name: 'pr / checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ]),
  ]);

  const result = ctx.runScript();

  const calls = await ctx.readCalls();

  expect(result.status).toBe(0);
  expect(calls.at(-1)).toBe(`${MERGE_CALL} abc123`);
});

test.each(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])(
  'it fails without a merge when a check ends with %s',
  async (conclusion) => {
    const ctx = await setupTest();

    await ctx.writeResponses('prs', [[{ number: 145 }]]);

    await ctx.writeResponses('heads', [
      buildHeadResponse('abc123', [
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
    buildHeadResponse(
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
  await ctx.writeResponses('heads', [buildHeadResponse('abc123', [])]);

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
    buildHeadResponse('abc123', [
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
