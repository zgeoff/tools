import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeCheckPlan } from './write-check-plan.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-check-plan-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');
  const readOutput = () => readFile(outputPath, 'utf8');

  return { directory, outputPath, readOutput };
}

test('it writes the plan for the script names package.json defines to the step outputs', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true', test: 'true', 'test:e2e': 'true' } }),
  );

  const errors = await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'all',
    scripts: 'lint test test:e2e',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  const output = await ctx.readOutput();

  expect(errors).toStrictEqual([]);

  expect(output).toBe(
    ['scripts= lint test test:e2e ', 'static= lint ', 'test= test ', 'lanes=["e2e"]', ''].join(
      '\n',
    ),
  );
});

test('it plans the standard static checks for the static job of a caller that lists no scripts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        audit: 'true',
        deadcode: 'true',
        'format:check': 'true',
        lint: 'true',
        check: 'true',
        typecheck: 'true',
        test: 'true',
      },
    }),
  );

  await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'static',
    scripts: '',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  const output = await ctx.readOutput();

  expect(output).toInclude('scripts= audit deadcode format:check lint typecheck \n');
});

test('it plans no lanes for a repo without lane scripts, so no public lane job starts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true', test: 'true' } }),
  );

  await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'all',
    scripts: 'lint test',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  const output = await ctx.readOutput();

  expect(output).toBe(
    ['scripts= lint test ', 'static= lint ', 'test= test ', 'lanes=[]', ''].join('\n'),
  );
});

test('it plans one lane per lane script, and a lane job runs only its own lane script', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { lint: 'true', test: 'true', 'test:e2e': 'true', 'test:host': 'true' },
    }),
  );

  await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'lane',
    scripts: 'lint test test:e2e test:host',
    lane: 'host',
    fileSystem: nodeFileSystem,
  });

  const output = await ctx.readOutput();

  expect(output).toBe(
    ['scripts= test:host ', 'static= lint ', 'test= test ', 'lanes=["e2e","host"]', ''].join('\n'),
  );
});

test('it plans the static checks, the tests and each lane once for the private checks job', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        lint: 'true',
        test: 'true',
        'test:e2e': 'true',
        'test:browser': 'true',
        'test:docker': 'true',
        'test:host': 'true',
      },
    }),
  );

  await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'all',
    scripts: 'lint test test:e2e test:browser test:docker test:host',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  const output = await ctx.readOutput();

  expect(output).toBe(
    [
      'scripts= lint test test:e2e test:browser test:docker test:host ',
      'static= lint ',
      'test= test ',
      'lanes=["e2e","browser","docker","host"]',
      '',
    ].join('\n'),
  );
});

test('it fails with an error and writes no outputs when a listed script is missing', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true' } }),
  );

  const errors = await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'all',
    scripts: 'lint check',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  const wroteOutput = await Bun.file(ctx.outputPath).exists();

  expect(errors).toStrictEqual([
    'package.json defines no script named: check. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.',
  ]);

  expect(wroteOutput).toBeFalse();
});

test('it fails with an error on a part it does not know', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true' } }),
  );

  const errors = await writeCheckPlan({
    cwd: ctx.directory,
    outputPath: ctx.outputPath,
    part: 'everything',
    scripts: 'lint',
    lane: '',
    fileSystem: nodeFileSystem,
  });

  expect(errors).toStrictEqual([
    'the plan step needs PART (one of all, static, test, lane) and GITHUB_OUTPUT.',
  ]);
});
