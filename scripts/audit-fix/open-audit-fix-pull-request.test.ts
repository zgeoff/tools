import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import { runCommand } from '../ci/run-command.ts';
import { openAuditFixPullRequest } from './open-audit-fix-pull-request.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-open-audit-fix-pull-request-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

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
      fileSystem: nodeFileSystem,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readBody = () => readFile(join(directory, 'pr-body.md'), 'utf8');

  const writeAuditResult = (files: Readonly<Record<string, string>>) =>
    writeTreeFiles(directory, files);

  return { directory, gh, output, runOpen, readBody, writeAuditResult };
}

test('it opens a labelled pull request against the base and turns auto-merge on', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.runOpen('main', true);

  const calls = await ctx.gh.readCalls();
  const body = await ctx.readBody();

  expect(body).toBe(
    'Updates kettle.\n\n[Workflow run](https://github.com/acme/kettle/actions/runs/7)\n',
  );

  expect(calls).toStrictEqual([
    'pr list --head audit-fix --state open --json number',
    'label create dependencies',
    'label create security',
    `pr create --base main --head audit-fix --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --label dependencies,security`,
    'pr merge audit-fix --auto --squash',
  ]);
});

test('it updates the open pull request and drops the audit-ignore label of an earlier run', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);
  await ctx.runOpen('main', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'pr list --head audit-fix --state open --json number',
    'label create dependencies',
    'label create security',
    `pr edit 41 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --add-label dependencies,security`,
    'pr edit 41 --remove-label audit-ignore',
  ]);
});

test('it labels a change that adds an ignore for review and never turns auto-merge on', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'true\n',
  });

  await ctx.gh.writeResponses('prs', [[{ number: 41 }]]);
  await ctx.runOpen('main', true);

  const calls = await ctx.gh.readCalls();

  expect(calls).toStrictEqual([
    'pr list --head audit-fix --state open --json number',
    'label create dependencies',
    'label create security',
    'label create audit-ignore',
    `pr edit 41 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --add-label dependencies,security,audit-ignore`,
  ]);

  expect(ctx.output).toStrictEqual([
    "The pull request adds or renews an ignore, so it waits for a person's review.\n",
  ]);
});

test('it opens the pull request of another base from that base fix branch', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.runOpen('release/v2', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toContain(
    `pr create --base release/v2 --head audit-fix-release-v2 --title fix(deps): update kettle to 1.0.1 --body-file ${join(ctx.directory, 'pr-body.md')} --label dependencies,security`,
  );
});

test('it warns and passes when GitHub refuses auto-merge', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.gh.writeResponses('merges', ['error']);
  await ctx.runOpen('main', true);

  expect(ctx.output).toStrictEqual([
    '::warning::GitHub refused auto-merge; allow auto-merge in the repo settings, or merge the pull request by hand.\n',
  ]);
});

test('it keeps going when a label already exists', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.gh.writeResponses('labels', ['error']);
  await ctx.runOpen('main', false);

  const calls = await ctx.gh.readCalls();

  expect(calls).toContainEqual(expect.toStartWith('pr create --base main --head audit-fix'));
});

test('it fails when GitHub refuses to open the pull request', async () => {
  const ctx = await setupTest();

  await ctx.writeAuditResult({
    'title.txt': 'fix(deps): update kettle to 1.0.1\n',
    'body.md': 'Updates kettle.\n',
    'needs-review.txt': 'false\n',
  });

  await ctx.gh.writeResponses('creates', ['error']);

  expect(ctx.runOpen('main', true)).rejects.toThrow('gh pr create --base main --head audit-fix');

  const calls = await ctx.gh.readCalls();

  expect(calls).not.toContain('pr merge audit-fix --auto --squash');
});
