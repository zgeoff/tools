import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubGH } from '../../test-utils/create-stub-gh.ts';
import { isConditionMet } from './is-condition-met.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';
import { parseWorkflowStep } from './parse-workflow-step.ts';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'main-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');

  await writeFile(outputPath, '');

  return { directory, outputPath, workflow: join(import.meta.dir, 'main.yml') };
}

test('it publishes a release that the merge run tagged from a run at the tag', async () => {
  const ctx = await setupTest();
  const resolve = await loadWorkflowStep(ctx.workflow, 'release', 'Resolve release commit');
  const gh = await createStubGH(ctx.directory);

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

  const resolves = isConditionMet(
    resolve.condition ?? '',
    new Map([
      ['steps.release.outputs.releases_created', 'false'],
      ['steps.tag.outputs.releases_created', 'true'],
    ]),
  );

  // The run's first release-please call released nothing, so a dispatch that
  // read its paths would publish no package.
  const expressions = Object.fromEntries<string>([
    ['github.token', 'app-token'],
    ['steps.release.outputs.paths_released', '[]'],
    ...output
      .split('\n')
      .filter((line) => line !== '')
      .map((line): [string, string] => {
        const [name = '', ...value] = line.split('=');

        return [`steps.release-commit.outputs.${name}`, value.join('=')];
      }),
  ]);

  const dispatchExitCode = await runWorkflowSteps(
    ctx.workflow,
    'release',
    ['Dispatch publish at the release tag'],
    {
      cwd: ctx.directory,
      env: {
        PATH: `${ctx.directory}:${process.env['PATH']}`,
        GITHUB_REPOSITORY: 'zgeoff/tools',
        GITHUB_SHA: 'old111',
      },
      expressions,
      outputPath: ctx.outputPath,
    },
  );

  const calls = await gh.readCalls();

  expect({ resolves, dispatchExitCode, calls }).toStrictEqual({
    resolves: true,
    dispatchExitCode: 0,
    calls: [
      'workflow run main.yml --repo zgeoff/tools --ref @zgeoff/std@0.4.0 -f republish_paths=["packages/std","packages/tsconfig"]',
    ],
  });
});

test.each([
  { release: 'true', tag: '', resolves: true },
  { release: 'false', tag: 'true', resolves: true },
  { release: 'false', tag: '', resolves: false },
])(
  'it resolves the release commit only after a release, with release-please $release and the tag step $tag',
  async (row) => {
    const ctx = await setupTest();
    const resolve = await loadWorkflowStep(ctx.workflow, 'release', 'Resolve release commit');

    const values = new Map([
      ['steps.release.outputs.releases_created', row.release],
      ['steps.tag.outputs.releases_created', row.tag],
    ]);

    const result = isConditionMet(resolve.condition ?? '', values);

    expect(result).toBe(row.resolves);
  },
);

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

test('it publishes in the run itself when release-please tagged its own commit', async () => {
  const ctx = await setupTest();
  const resolve = await loadWorkflowStep(ctx.workflow, 'release', 'Resolve release commit');

  const releaseOutputs = {
    releases_created: 'true',
    paths_released: '["packages/std"]',
    'packages/std--sha': 'merge222',
    'packages/std--tag_name': '@zgeoff/std@0.4.0',
  };

  const result = await $`bash -c ${resolve.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      RELEASE_OUTPUTS: JSON.stringify(releaseOutputs),
      GITHUB_SHA: 'merge222',
      GITHUB_OUTPUT: ctx.outputPath,
    })
    .nothrow()
    .quiet();

  const output = await readFile(ctx.outputPath, 'utf8');

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 0,
    stderr: '',
  });

  expect(output).toBe(
    ['tag=@zgeoff/std@0.4.0', 'paths=["packages/std"]', 'here=true', ''].join('\n'),
  );
});
