import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { loadWorkflowStep } from './load-workflow-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'main-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  return { directory, outputPath };
}

test('it publishes a release that the merge run tagged from a run at the tag', async () => {
  const ctx = await setupTest();

  const resolve = await loadWorkflowStep(
    join(import.meta.dir, 'main.yml'),
    'release',
    'Resolve release commit',
  );

  // The outputs of the tag step after it tags the release PR that this run
  // merged: the merge made commit merge222, and the run started at old111.
  const tagOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std","packages/tsconfig"]',
    'packages/std--sha': 'merge222',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
    'packages/tsconfig--sha': 'merge222',
    'packages/tsconfig--tag_name': '@zgeoff/tsconfig@1.2.0',
  };

  const result = await $`bash -c ${resolve.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      RELEASE_OUTPUTS: JSON.stringify(tagOutputs),
      GITHUB_SHA: 'old111',
      GITHUB_OUTPUT: ctx.outputPath,
    })
    .nothrow()
    .quiet();

  expect(resolve.env).toStrictEqual({
    RELEASE_OUTPUTS: `\${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`,
  });

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 0,
    stderr: '',
  });

  const output = await readFile(ctx.outputPath, 'utf8');

  expect(output).toBe(
    ['tag=@zgeoff/std@0.4.0', 'paths=["packages/std","packages/tsconfig"]', 'here=false', ''].join(
      '\n',
    ),
  );
});
