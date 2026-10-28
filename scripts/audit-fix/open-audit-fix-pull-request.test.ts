import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { openAuditFixPullRequest } from './open-audit-fix-pull-request.ts';

async function setupTest(needsReview: string) {
  const directory = await mkdtemp(join(import.meta.dir, '.test-open-audit-fix-pull-request-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  await writeTreeFiles(directory, {
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': needsReview,
  });

  const output: string[] = [];

  const runOpen = (base: string, isAutomerge: boolean) =>
    openAuditFixPullRequest({
      cwd: directory,
      env: { PATH: `${directory}:${process.env['PATH']}` },
      runnerTemp: directory,
      base,
      defaultBranch: 'main',
      isAutomerge,
      runURL: 'https://github.com/acme/kettle/actions/runs/7',
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readBody = () => readFile(join(directory, 'pr-body.md'), 'utf8');

  return { directory, gh, output, runOpen, readBody };
}

test('it opens a labelled pull request against the base and turns auto-merge on', async () => {
  const ctx = await setupTest('false\n');

  await ctx.runOpen('main', true);

  const calls = await ctx.gh.readCalls();
  const body = await ctx.readBody();

  expect(body).toBe(
    'Updates kettle.\n\n[Workflow run](https://github.com/acme/kettle/actions/runs/7)\n',
  );

  expect(calls).toStrictEqual([
    'label create dependencies',
    'label create security',
    'pr list --head audit-fix --state open --json number',
    `pr create --base main --head audit-fix --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --label dependencies,security`,
    'pr merge audit-fix --auto --squash',
  ]);
});

test('it updates the open pull request and drops the audit-ignore label of an earlier run', async () => {
  const ctx = await setupTest('false\n');

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);
  await ctx.runOpen('main', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'label create dependencies',
    'label create security',
    'pr list --head audit-fix --state open --json number',
    `pr edit 41 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --add-label dependencies,security`,
    'pr edit 41 --remove-label audit-ignore',
  ]);
});

test('it labels a change that adds an ignore for review and never turns auto-merge on', async () => {
  const ctx = await setupTest('true\n');

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);
  await ctx.runOpen('main', true);

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'label create dependencies',
    'label create security',
    'label create audit-ignore',
    'pr list --head audit-fix --state open --json number',
    `pr edit 41 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --add-label dependencies,security,audit-ignore`,
  ]);

  expect(ctx.output).toStrictEqual([
    "The pull request adds or renews an ignore, so it waits for a person's review.\n",
  ]);
});

test('it opens the pull request of another base from that base fix branch', async () => {
  const ctx = await setupTest('false\n');

  await ctx.runOpen('release/v2', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toContain(
    `pr create --base release/v2 --head audit-fix-release-v2 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --label dependencies,security`,
  );
});

test('it warns and passes when GitHub refuses auto-merge', async () => {
  const ctx = await setupTest('false\n');

  await ctx.gh.writeResponses('merges', ['error']);
  await ctx.runOpen('main', true);

  expect(ctx.output).toStrictEqual([
    '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
  ]);
});

test('it keeps going when a label already exists', async () => {
  const ctx = await setupTest('false\n');

  await ctx.gh.writeResponses('labels', ['error']);
  await ctx.runOpen('main', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toContainEqual(expect.toStartWith('pr create --base main --head audit-fix'));
});
