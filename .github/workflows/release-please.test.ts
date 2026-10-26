import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { isConditionMet } from './is-condition-met.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';
import { parseWorkflowStep } from './parse-workflow-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'release-please-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'release-please.yml');
  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  const runPick = async (outputs: Readonly<Record<string, string>>) => {
    const pick = await loadWorkflowStep(workflow, 'release', 'Pick the release outputs');

    const result = await $`bash -c ${pick.run}`
      .cwd(directory)
      .env({
        PATH: process.env['PATH'],
        RELEASE_OUTPUTS: JSON.stringify(outputs),
        GITHUB_OUTPUT: outputPath,
      })
      .nothrow()
      .quiet();

    const output = await readFile(outputPath, 'utf8');

    return { exitCode: result.exitCode, stderr: result.stderr.toString(), output };
  };

  return { workflow, runPick };
}

test.each([
  {
    verb: 'tags',
    run: 'a release PR this run merged',
    merged: 'true',
    created: 'false',
    met: true,
  },
  { verb: 'leaves', run: 'a run with no merge', merged: '', created: 'false', met: false },
  {
    verb: 'leaves',
    run: 'a run whose first release-please call tagged a release',
    merged: 'true',
    created: 'true',
    met: false,
  },
])('it $verb the merge for $run', async (row) => {
  const ctx = await setupTest();
  const text = await readFile(ctx.workflow, 'utf8');

  const tag = parseWorkflowStep(text, 'release', 'Tag the merged release');

  if (tag.kind !== 'parsed') {
    throw new Error(tag.message);
  }

  const values = new Map([
    ['steps.merge.outputs.merged', row.merged],
    ['steps.release.outputs.releases_created', row.created],
  ]);

  const result = isConditionMet(tag.step.condition ?? '', values);

  expect(result).toBe(row.met);
});

test.each([
  { value: 'true', runs: true },
  { value: 'false', runs: false },
])('it merges the release PR only when merge is on, with merge $value', async (row) => {
  const ctx = await setupTest();
  const text = await readFile(ctx.workflow, 'utf8');

  const step = parseWorkflowStep(text, 'release', 'Auto-merge release PRs');

  if (step.kind !== 'parsed') {
    throw new Error(step.message);
  }

  const values = new Map([
    ['steps.app-token.outputs.token', 'app-token'],
    ['inputs.merge', row.value],
  ]);

  const result = isConditionMet(step.step.condition ?? '', values);

  expect(result).toBe(row.runs);
});

test.each([
  { merged: 'true', checks: true },
  { merged: '', checks: false },
])("it checks main's head after its own merge only, with merged '$merged'", async (row) => {
  const ctx = await setupTest();
  const text = await readFile(ctx.workflow, 'utf8');

  const step = parseWorkflowStep(text, 'release', "Check the merge against main's head");

  if (step.kind !== 'parsed') {
    throw new Error(step.message);
  }

  const result = isConditionMet(
    step.step.condition ?? '',
    new Map([['steps.merge.outputs.merged', row.merged]]),
  );

  expect(result).toBe(row.checks);
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

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=true',
      'tag=@zgeoff/std@0.4.0',
      'version=0.4.0',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
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

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=true',
      'tag=v4.2.1',
      'version=4.2.1',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
});

test('it reports no release, tag or version for a run that released nothing', async () => {
  const ctx = await setupTest();

  const outputs = { releases_created: 'false', paths_released: '[]', prs_created: 'true' };

  const result = await ctx.runPick(outputs);

  expect(result).toStrictEqual({
    exitCode: 0,
    stderr: '',
    output: [
      'releases_created=false',
      'tag=',
      'version=',
      `release-outputs=${JSON.stringify(outputs)}`,
      '',
    ].join('\n'),
  });
});
