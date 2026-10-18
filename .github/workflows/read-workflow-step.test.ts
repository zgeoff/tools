import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkflowStep } from './read-workflow-step.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'read-workflow-step-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it returns the run script of the named step', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'ci.yml'),
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '      - name: Greet',
      '        run: |',
      '          echo "hello"',
      '          echo "bye"',
      '',
    ].join('\n'),
  );

  const run = await readWorkflowStep(join(ctx.dir, 'ci.yml'), 'build', 'Greet');

  expect(run).toBe('echo "hello"\necho "bye"\n');
});

test('it rejects a step name the job lacks', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'ci.yml'),
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Greet',
      '        run: echo "hello"',
      '',
    ].join('\n'),
  );

  expect(readWorkflowStep(join(ctx.dir, 'ci.yml'), 'build', 'Deploy')).rejects.toThrow(
    `${join(ctx.dir, 'ci.yml')}: the build job has no step named Deploy with a run script`,
  );
});

test('it rejects a job the workflow lacks', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'ci.yml'),
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Greet',
      '        run: echo "hello"',
      '',
    ].join('\n'),
  );

  expect(readWorkflowStep(join(ctx.dir, 'ci.yml'), 'deploy', 'Greet')).rejects.toThrow(
    `${join(ctx.dir, 'ci.yml')}: the deploy job has no steps`,
  );
});
