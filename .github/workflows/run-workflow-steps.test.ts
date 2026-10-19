import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkflowSteps } from './run-workflow-steps.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-workflow-steps-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    workflow: join(directory, 'ci.yml'),
    outputPath: join(directory, 'output'),
  };
}

test('it passes a step output to a later step through its expression', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Pick',
      '        id: pick',
      '        run: echo "color=blue" >> "$GITHUB_OUTPUT"',
      '      - name: Write',
      '        env:',
      `          COLOR: \${{ steps.pick.outputs.color }}`,
      '        run: echo "$COLOR" > picked',
      '',
    ].join('\n'),
  );

  const exitCode = await runWorkflowSteps(ctx.workflow, 'build', ['Pick', 'Write'], {
    cwd: ctx.directory,
    env: process.env,
    expressions: {},
    outputPath: ctx.outputPath,
  });

  const picked = await readFile(join(ctx.directory, 'picked'), 'utf8');

  expect(exitCode).toBe(0);
  expect(picked).toBe('blue\n');
});

test('it fills an env value from the given expressions and keeps a literal value', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Write',
      '        env:',
      `          REPO: \${{ github.repository }}`,
      '          BRANCH: release',
      '        run: echo "$REPO $BRANCH" > written',
      '',
    ].join('\n'),
  );

  await runWorkflowSteps(ctx.workflow, 'build', ['Write'], {
    cwd: ctx.directory,
    env: process.env,
    expressions: { 'github.repository': 'example/app' },
    outputPath: ctx.outputPath,
  });

  const written = await readFile(join(ctx.directory, 'written'), 'utf8');

  expect(written).toBe('example/app release\n');
});

test.each([
  ['runs', 'true', 'ran\n'],
  ['skips', 'false', ''],
])('it %s a step when its condition compares %s', async (_label, pushed, expected) => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Push',
      '        id: push',
      `        run: echo "pushed=${pushed}" >> "$GITHUB_OUTPUT" && touch log`,
      '      - name: Open',
      "        if: steps.push.outputs.pushed == 'true'",
      '        run: echo ran >> log',
      '',
    ].join('\n'),
  );

  await runWorkflowSteps(ctx.workflow, 'build', ['Push', 'Open'], {
    cwd: ctx.directory,
    env: process.env,
    expressions: {},
    outputPath: ctx.outputPath,
  });

  const log = await readFile(join(ctx.directory, 'log'), 'utf8');

  expect(log).toBe(expected);
});

test('it stops at the first failing step and returns its exit code', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Break',
      '        run: exit 3',
      '      - name: Write',
      '        run: touch written',
      '',
    ].join('\n'),
  );

  const exitCode = await runWorkflowSteps(ctx.workflow, 'build', ['Break', 'Write'], {
    cwd: ctx.directory,
    env: process.env,
    expressions: {},
    outputPath: ctx.outputPath,
  });

  const wrote = await Bun.file(join(ctx.directory, 'written')).exists();

  expect(exitCode).toBe(3);
  expect(wrote).toBeFalse();
});

test.each([
  [
    'an expression with no value',
    `REPO: \${{ github.repository }}`,
    'no value for github.repository',
  ],
  [
    'an expression inside other text',
    `REPO: repo-\${{ github.repository }}`,
    `unsupported expression: repo-\${{ github.repository }}`,
  ],
])('it rejects %s in an env value', async (_label, line, message) => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Write',
      '        env:',
      `          ${line}`,
      '        run: "true"',
      '',
    ].join('\n'),
  );

  expect(
    runWorkflowSteps(ctx.workflow, 'build', ['Write'], {
      cwd: ctx.directory,
      env: process.env,
      expressions: {},
      outputPath: ctx.outputPath,
    }),
  ).rejects.toThrow(message);
});

test('it rejects a condition other than an equality with a quoted text', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Write',
      '        if: always()',
      '        run: "true"',
      '',
    ].join('\n'),
  );

  expect(
    runWorkflowSteps(ctx.workflow, 'build', ['Write'], {
      cwd: ctx.directory,
      env: process.env,
      expressions: {},
      outputPath: ctx.outputPath,
    }),
  ).rejects.toThrow('unsupported condition: always()');
});

test('it rejects an output line with no equals sign', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.workflow,
    [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Pick',
      '        id: pick',
      '        run: echo "color" >> "$GITHUB_OUTPUT"',
      '',
    ].join('\n'),
  );

  expect(
    runWorkflowSteps(ctx.workflow, 'build', ['Pick'], {
      cwd: ctx.directory,
      env: process.env,
      expressions: {},
      outputPath: ctx.outputPath,
    }),
  ).rejects.toThrow('unsupported output line: color');
});
