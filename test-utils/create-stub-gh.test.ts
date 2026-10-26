import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubGH } from './create-stub-gh.ts';

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-stub-gh-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  return { directory, gh };
}

test('it answers the nth call to an endpoint with line n, then repeats the last line', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('prs', [[{ number: 7 }], [{ number: 8 }]]);

  const first = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'pr',
    'list',
    '--state',
    'open',
  ]).stdout.toString();

  const second = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'pr',
    'list',
    '--state',
    'open',
  ]).stdout.toString();

  const third = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'pr',
    'list',
    '--state',
    'open',
  ]).stdout.toString();

  expect(first).toBe('[{"number":7}]\n');
  expect(second).toBe('[{"number":8}]\n');
  expect(third).toBe('[{"number":8}]\n');
});

test('it answers an endpoint with no response file with its default body', async () => {
  const ctx = await setupTest();

  const result = Bun.spawnSync([join(ctx.directory, 'gh'), 'pr', 'view', '145']);

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('{"mergeable":"MERGEABLE"}\n');
});

test('it answers the commit, compare and branch rules endpoints with their responses', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('commits', [{ sha: 'head222' }]);
  await ctx.gh.writeResponses('compares', [{ files: [{ filename: 'README.md' }] }]);
  await ctx.gh.writeResponses('rules', [[{ type: 'required_status_checks' }]]);

  const commit = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'api',
    'repos/zgeoff/tools/commits/main',
  ]);

  const compare = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'api',
    'repos/zgeoff/tools/compare/merge111...head222',
  ]);

  const rules = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'api',
    'repos/zgeoff/tools/rules/branches/main',
  ]);

  expect(commit.stdout.toString()).toBe('{"sha":"head222"}\n');
  expect(compare.stdout.toString()).toBe('{"files":[{"filename":"README.md"}]}\n');
  expect(rules.stdout.toString()).toBe('[{"type":"required_status_checks"}]\n');
});

test('it prints nothing for a merge and fails the merge whose response is "error"', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('merges', ['merged', 'error']);

  const first = Bun.spawnSync([join(ctx.directory, 'gh'), 'pr', 'merge', '145', '--squash']);
  const second = Bun.spawnSync([join(ctx.directory, 'gh'), 'pr', 'merge', '145', '--auto']);

  expect({ exitCode: first.exitCode, stdout: first.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: '',
  });

  expect({ exitCode: second.exitCode, stderr: second.stderr.toString() }).toStrictEqual({
    exitCode: 1,
    stderr: 'HTTP 502\n',
  });
});

test('it fails a call whose body is "error"', async () => {
  const ctx = await setupTest();

  await ctx.gh.writeResponses('mergeable', ['error']);

  const result = Bun.spawnSync([join(ctx.directory, 'gh'), 'pr', 'view', '145']);

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('HTTP 502\n');
});

test('it fails a call that matches no endpoint', async () => {
  const ctx = await setupTest();

  const result = Bun.spawnSync([join(ctx.directory, 'gh'), 'issue', 'list']);

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('unexpected gh call: issue list\n');
});

test('it logs each call less its GraphQL query', async () => {
  const ctx = await setupTest();

  Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'api',
    'graphql',
    '-f',
    'owner=zgeoff',
    '-f',
    'name=tools',
    '-f',
    'ref=refs/heads/release-please--branches--main',
    '-f',
    'query=query { viewer { login } }',
  ]);

  Bun.spawnSync([join(ctx.directory, 'gh'), 'pr', 'merge', '145', '--squash']);

  const dispatch = Bun.spawnSync([
    join(ctx.directory, 'gh'),
    'workflow',
    'run',
    'main.yml',
    '--ref',
    '@zgeoff/std@0.4.0',
  ]);

  const calls = await ctx.gh.readCalls();

  expect(dispatch.exitCode).toBe(0);

  expect(calls).toStrictEqual([
    'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    'pr merge 145 --squash',
    'workflow run main.yml --ref @zgeoff/std@0.4.0',
  ]);
});
