import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../test-utils/read-git-env.ts';
import { writeTreeFiles } from '../test-utils/write-tree-files.ts';
import { runTestLayoutCheck } from './run-test-layout-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), `run-test-layout-check-pid${process.pid}-`));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet ${directory}`.env({ ...env });

  const output: string[] = [];
  const errors: string[] = [];

  const run = (files: Readonly<Record<string, string>>) =>
    runTestLayoutCheck({
      readTrackedPaths: () => Promise.resolve(Object.keys(files)),
      readText: (path) => {
        const text = files[path];

        return text === undefined
          ? Promise.reject(new Error(`ENOENT: no such file, open '${path}'`))
          : Promise.resolve(text);
      },
      writeOutput: (text) => {
        output.push(text);
      },
      writeError: (text) => {
        errors.push(text);
      },
    });

  return { output, errors, run, directory, env };
}

test('it exits 0 and prints nothing for a tree with no layout fault', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.run({
    'packages/kettle/src/boil.test.ts':
      "import { buildWater } from './test-utils/build-water.ts';\n",
    'packages/kettle/src/test-utils/build-water.ts': 'export const buildWater = () => 1;\n',
  });

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 0,
    output: [],
    errors: [],
  });
});

test('it prints each fault on its own line and exits 1', async () => {
  const ctx = await setupTest();

  const exitCode = await ctx.run({
    'test-utils/build-water.ts': 'export const buildWater = () => 1;\n',
    'scripts/brew/run-brew.test.ts':
      "import { buildWater } from '../../packages/kettle/src/test-utils/build-water.ts';\n",
  });

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 1,
    output: [
      'test-utils/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/src/test-utils/\n',
      "scripts/brew/run-brew.test.ts imports packages/kettle/src/test-utils/build-water.ts, a test helper of packages/kettle; import it by the package's name, with the package as a workspace:* dev dependency\n",
    ],
    errors: [],
  });
});

test('it exits 2 and prints the error when a tracked file cannot be read', async () => {
  const ctx = await setupTest();

  const exitCode = await runTestLayoutCheck({
    readTrackedPaths: () => Promise.resolve(['packages/kettle/src/boil.ts']),
    readText: () => Promise.reject(new Error('EACCES: permission denied')),
    writeOutput: (text) => {
      ctx.output.push(text);
    },
    writeError: (text) => {
      ctx.errors.push(text);
    },
  });

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 2,
    output: [],
    errors: ['test-layout: EACCES: permission denied\n'],
  });
});

test('it reports a root test-utils file of the git repo it runs in when run as a script', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { 'test-utils/build-water.ts': 'export {};\n' });

  await $`git add -A`.cwd(ctx.directory).env({ ...ctx.env });

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-layout-check.ts')}`
    .cwd(ctx.directory)
    .env({ ...ctx.env })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout:
      'test-utils/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/src/test-utils/\n',
  });
});
