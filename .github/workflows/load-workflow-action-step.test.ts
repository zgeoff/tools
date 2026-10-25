import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorkflowActionStep } from './load-workflow-action-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'load-workflow-action-step-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { workflow: join(directory, 'ci.yml') };
}

test('it returns the condition, action and inputs of the named step', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Greet',
      '        run: echo "hello"',
      '      - name: Brew',
      "        if: steps.kettle.outputs.hot == 'true'",
      '        uses: acme/brew-action@v2',
      '        with:',
      `          token: \${{ steps.token.outputs.token }}`,
      '          strong: true',
      '          cups: 2',
      '',
    ].join('\n'),
  );

  const step = await loadWorkflowActionStep(ctx.workflow, 'build', 'Brew');

  expect(step).toStrictEqual({
    condition: "steps.kettle.outputs.hot == 'true'",
    uses: 'acme/brew-action@v2',
    inputs: { token: `\${{ steps.token.outputs.token }}`, strong: 'true', cups: '2' },
  });
});

test('it returns no condition and no inputs for a step without them', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Brew',
      '        uses: acme/brew-action@v2',
      '',
    ].join('\n'),
  );

  const step = await loadWorkflowActionStep(ctx.workflow, 'build', 'Brew');

  expect(step).toStrictEqual({ condition: null, uses: 'acme/brew-action@v2', inputs: {} });
});

test.each([
  [
    'a step that runs a script',
    'Greet',
    'the build job has no step named Greet that uses an action',
  ],
  ['a missing step', 'Pour', 'the build job has no step named Pour that uses an action'],
])('it rejects %s', async (_, name, message) => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Greet',
      '        run: echo "hello"',
      '',
    ].join('\n'),
  );

  expect(loadWorkflowActionStep(ctx.workflow, 'build', name)).rejects.toThrow(message);
});

test('it rejects a job with no steps', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.workflow, ['jobs:', '  build:', '    runs-on: ubuntu-latest', ''].join('\n'));

  expect(loadWorkflowActionStep(ctx.workflow, 'build', 'Brew')).rejects.toThrow(
    'the build job has no steps',
  );
});
