import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubPullRequestGH } from './create-stub-pull-request-gh.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-stub-pull-request-gh-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const state = join(directory, 'pulls.json');

  await createStubPullRequestGH(directory, state);

  return { gh: join(directory, 'gh'), state };
}

test('it prints no number for a branch with no open pull request', async () => {
  const ctx = await setupTest();

  const result =
    await $`${ctx.gh} pr list --head sync --state open --json number --jq ${'.[0].number // empty'}`.text();

  expect(result).toBe('');
});

test('it opens a pull request and lists it by its branch', async () => {
  const ctx = await setupTest();

  const created =
    await $`${ctx.gh} pr create --base main --head sync --title ${'chore: sync'} --body ${'Two files.'}`.text();

  const listed =
    await $`${ctx.gh} pr list --head sync --state open --json number --jq ${'.[0].number // empty'}`.text();

  const state = await readFile(ctx.state, 'utf8');

  const pulls: unknown = JSON.parse(state);

  expect(created).toBe('https://github.com/example/repo/pull/1\n');
  expect(listed).toBe('1\n');

  expect(pulls).toStrictEqual([
    {
      number: 1,
      base: 'main',
      head: 'sync',
      title: 'chore: sync',
      body: 'Two files.',
      state: 'open',
    },
  ]);
});

test('it refuses a second pull request for a branch with one open', async () => {
  const ctx = await setupTest();

  await $`${ctx.gh} pr create --base main --head sync --title one --body one`.quiet();

  const result = await $`${ctx.gh} pr create --base main --head sync --title two --body two`
    .nothrow()
    .quiet();

  const state = await readFile(ctx.state, 'utf8');

  const pulls: unknown = JSON.parse(state);

  expect(result.exitCode).toBe(1);

  expect(result.stderr.toString()).toBe(
    'a pull request for branch "sync" into branch "main" already exists\n',
  );

  expect(pulls).toHaveLength(1);
});

test('it replaces the title and body of an open pull request', async () => {
  const ctx = await setupTest();

  await $`${ctx.gh} pr create --base main --head sync --title one --body one`.quiet();
  await $`${ctx.gh} pr edit 1 --title two --body ${'Three files.'}`.quiet();

  const state = await readFile(ctx.state, 'utf8');

  const pulls: unknown = JSON.parse(state);

  expect(pulls).toStrictEqual([
    { number: 1, base: 'main', head: 'sync', title: 'two', body: 'Three files.', state: 'open' },
  ]);
});

test('it fails to edit a pull request that does not exist', async () => {
  const ctx = await setupTest();
  const result = await $`${ctx.gh} pr edit 4 --title two --body two`.nothrow().quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('no open pull request #4\n');
});

test('it fails when the state file holds no list of pull requests', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.state, '{}\n');

  const result = await $`${ctx.gh} pr edit 1 --title two --body two`.nothrow().quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe(`stub gh: ${ctx.state} holds no list of pull requests\n`);
});

test.each([
  ['a command outside pr', ['issue', 'list']],
  ['a list with other flags', ['pr', 'list', '--head', 'sync']],
  [
    'a list of closed pull requests',
    ['pr', 'list', '--head', 'sync', '--state', 'closed', '--json', 'number', '--jq', '.'],
  ],
  ['a create with no body', ['pr', 'create', '--base', 'main', '--head', 'sync', '--title', 'one']],
  ['an edit with no number', ['pr', 'edit', '--title', 'one', '--body', 'one']],
  ['an unknown flag', ['pr', 'list', '--author', 'someone']],
])('it exits 64 for %s', async (_label, args) => {
  const ctx = await setupTest();
  const result = await $`${ctx.gh} ${args}`.nothrow().quiet();

  expect(result.exitCode).toBe(64);

  expect(result.stderr.toString()).toBe(
    'stub gh: supports only: gh pr list|create|edit|merge, as run-stub-pull-request-gh.ts lists\n',
  );
});

test('it turns auto-merge on for a head and lists it, then turns it off', async () => {
  const ctx = await setupTest();

  await $`${ctx.gh} pr create --base main --head sync --title one --body one`.quiet();
  await $`${ctx.gh} pr merge 1 --auto --squash --match-head-commit abc123`.quiet();

  const armedText = await readFile(ctx.state, 'utf8');

  const armed: unknown = JSON.parse(armedText);

  const listed =
    await $`${ctx.gh} pr list --head sync --state open --json number,autoMergeRequest --jq ${String.raw`.[0] | "\(.number) \(.autoMergeRequest != null)"`}`.text();

  await $`${ctx.gh} pr merge 1 --disable-auto`.quiet();

  const disarmedText = await readFile(ctx.state, 'utf8');

  const disarmed: unknown = JSON.parse(disarmedText);

  expect(armed).toStrictEqual([
    expect.objectContaining({ number: 1, autoMerge: { method: 'squash', head: 'abc123' } }),
  ]);

  expect(listed).toBe('1 true\n');
  expect(disarmed).toStrictEqual([expect.not.objectContaining({ autoMerge: expect.anything() })]);
});

test('it refuses auto-merge with the text the refusal variable holds', async () => {
  const ctx = await setupTest();

  await $`${ctx.gh} pr create --base main --head sync --title one --body one`.quiet();

  const result = await $`${ctx.gh} pr merge 1 --auto --squash --match-head-commit abc123`
    .env({ ...process.env, STUB_GH_AUTO_MERGE_REFUSAL: 'Auto merge is not allowed' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString()).toBe('Auto merge is not allowed\n');
});
