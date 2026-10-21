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

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'api graphql -f owner=zgeoff -f name=tools -f ref=refs/heads/release-please--branches--main',
    'pr merge 145 --squash',
  ]);
});
