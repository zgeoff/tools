import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';
import { createStubGH } from '../test-utils/create-stub-gh.ts';

async function setupTest() {
  // Inside the checkout, not the system temp dir: the folder is git-ignored.
  const directory = await mkdtemp(join(import.meta.dir, '.test-check-release-head-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const gh = await createStubGH(directory);

  const scriptPath = fileURLToPath(new URL('check-release-head.sh', import.meta.url));

  const runScript = async () => {
    const result = await $`bash ${scriptPath} zgeoff/tools`
      .env({ ...process.env, PATH: `${directory}:${process.env['PATH']}` })
      .nothrow()
      .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };

  return { writeResponses: gh.writeResponses, readCalls: gh.readCalls, runScript };
}

test('it passes when no merged release PR waits for its tag', async () => {
  const ctx = await setupTest();
  const result = await ctx.runScript();
  const calls = await ctx.readCalls();

  expect({ result, calls }).toStrictEqual({
    result: { exitCode: 0, stdout: '', stderr: '' },
    calls: [
      'pr list --repo zgeoff/tools --state merged --label autorelease: pending --json number,mergeCommit,baseRefName',
    ],
  });
});

test("it passes a release PR whose merge commit is still main's head", async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [
    [{ number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' }],
  ]);

  await ctx.writeResponses('commits', [{ sha: 'merge111' }]);

  const result = await ctx.runScript();
  const calls = await ctx.readCalls();

  expect({ result, apiCalls: calls.filter((call) => call.startsWith('api ')) }).toStrictEqual({
    result: { exitCode: 0, stdout: '', stderr: '' },
    apiCalls: ['api repos/zgeoff/tools/commits/main'],
  });
});

test('it passes a release PR whose main moved on with no workflow change', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [
    [{ number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' }],
  ]);

  await ctx.writeResponses('commits', [{ sha: 'head222' }]);

  await ctx.writeResponses('compares', [
    { files: [{ filename: 'README.md' }, { filename: '.github/PULL_REQUEST_TEMPLATE.md' }] },
  ]);

  const result = await ctx.runScript();

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout:
      'release PR #145: main moved from its merge commit merge111 to head222 with no workflow change; the tag is safe\n',
    stderr: '',
  });
});

test('it fails, naming both commits, when a workflow change merged after the release PR', async () => {
  const ctx = await setupTest();

  await ctx.writeResponses('prs', [
    [{ number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' }],
  ]);

  await ctx.writeResponses('commits', [{ sha: 'head222' }]);

  await ctx.writeResponses('compares', [
    { files: [{ filename: '.github/workflows/ci.yml' }, { filename: 'README.md' }] },
  ]);

  const result = await ctx.runScript();
  const calls = await ctx.readCalls();

  expect({ result, compare: calls.at(-1) }).toStrictEqual({
    result: {
      exitCode: 1,
      stdout: '',
      stderr:
        "release PR #145: its merge commit merge111 is no longer main's head head222, and .github/workflows/ci.yml changed since, so the release App cannot tag it; recover with the steps for an untagged release PR in RELEASING.md\n",
    },
    compare: 'api repos/zgeoff/tools/compare/merge111...head222',
  });
});

test('it fails for a release PR that auto-merge merged once its checks outlasted the wait', async () => {
  const ctx = await setupTest();

  // GitHub merged the release PR minutes after the run that turned on
  // auto-merge; a workflow change merged before the run of that merge's push.
  await ctx.writeResponses('prs', [
    [
      { number: 145, mergeCommit: { oid: 'merge111' }, baseRefName: 'main' },
      { number: 150, mergeCommit: { oid: 'merge333' }, baseRefName: 'main' },
    ],
  ]);

  await ctx.writeResponses('commits', [{ sha: 'merge111' }, { sha: 'head444' }]);
  await ctx.writeResponses('compares', [{ files: [{ filename: '.github/workflows/main.yml' }] }]);

  const result = await ctx.runScript();

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: '',
    stderr:
      "release PR #150: its merge commit merge333 is no longer main's head head444, and .github/workflows/main.yml changed since, so the release App cannot tag it; recover with the steps for an untagged release PR in RELEASING.md\n",
  });
});
