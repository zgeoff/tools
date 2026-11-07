import { expect, test } from 'bun:test';
import { buildUnitCommand } from './build-unit-command.ts';
import { defineRig } from './define-rig.ts';

test('it runs the unit tests in random order in one global per worker, with the worker count, and leaves every lane out', () => {
  const command = buildUnitCommand(defineRig({}), {
    e2eDirs: ['e2e', 'apps/shop/e2e'],
    workerCount: 3,
    testRun: { folder: '', bunfig: null, files: null, ignore: [] },
    flags: [],
  });

  expect(command).toStrictEqual([
    'bun',
    'test',
    '--parallel=3',
    '--randomize',
    '--no-isolate',
    '--path-ignore-patterns=**/*.browser.test.ts',
    '--path-ignore-patterns=**/*.browser.test.tsx',
    '--path-ignore-patterns=**/*.docker.test.ts',
    '--path-ignore-patterns=**/*.docker.test.tsx',
    '--path-ignore-patterns=**/*.host.test.ts',
    '--path-ignore-patterns=**/*.host.test.tsx',
    '--path-ignore-patterns=**/*.agent-sdk.test.ts',
    '--path-ignore-patterns=**/*.agent-sdk.test.tsx',
    '--path-ignore-patterns=**/*.model-api.test.ts',
    '--path-ignore-patterns=**/*.model-api.test.tsx',
    '--path-ignore-patterns=e2e/**',
    '--path-ignore-patterns=apps/shop/e2e/**',
  ]);
});

test('it leaves out the files of a lane that the config declares', () => {
  const config = defineRig({
    lanes: { kiln: { limit: '15s' }, oven: { limit: '9s', suffix: '.bake' } },
  });

  const command = buildUnitCommand(config, {
    e2eDirs: [],
    workerCount: 1,
    testRun: { folder: '', bunfig: null, files: null, ignore: [] },
    flags: [],
  });

  expect(command).toIncludeAllMembers([
    '--path-ignore-patterns=**/*.kiln.test.ts',
    '--path-ignore-patterns=**/*.kiln.test.tsx',
    '--path-ignore-patterns=**/*.bake.test.ts',
    '--path-ignore-patterns=**/*.bake.test.tsx',
  ]);
});

test('it leaves out the paths that the config ignores and the paths that another run takes', () => {
  const config = defineRig({ ignore: ['docs/drafts/**', 'notes/**'] });

  const command = buildUnitCommand(config, {
    e2eDirs: [],
    workerCount: 1,
    testRun: { folder: '', bunfig: null, files: null, ignore: ['packages/oven/**'] },
    flags: [],
  });

  expect(command).toIncludeAllMembers([
    '--path-ignore-patterns=docs/drafts/**',
    '--path-ignore-patterns=notes/**',
    '--path-ignore-patterns=packages/oven/**',
  ]);
});

test('it ends with the flags the caller passes, then the files of the run as paths', () => {
  const command = buildUnitCommand(defineRig({}), {
    e2eDirs: [],
    workerCount: 2,
    testRun: { folder: '', bunfig: null, files: ['src/a.test.ts'], ignore: [] },
    flags: ['--timeout=15000'],
  });

  expect(command.slice(-2)).toStrictEqual(['--timeout=15000', './src/a.test.ts']);
});

test('it leaves out only the folders that the e2e lane selects', () => {
  const command = buildUnitCommand(defineRig({}), {
    e2eDirs: [],
    workerCount: 1,
    testRun: { folder: '', bunfig: null, files: null, ignore: [] },
    flags: [],
  });

  expect(command.filter((argument) => argument.includes('e2e'))).toBeEmpty();
});

test('it gives the files and globs of a run in a package folder relative to that folder, and drops the globs of other folders', () => {
  const config = defineRig({ ignore: ['packages/oven/drafts/**', 'notes/**'] });

  const command = buildUnitCommand(config, {
    e2eDirs: ['packages/oven/e2e'],
    workerCount: 1,
    testRun: {
      folder: 'packages/oven',
      bunfig: null,
      files: ['packages/oven/src/heat.test.ts'],
      ignore: [],
    },
    flags: [],
  });

  expect({
    ignoreArgs: command.filter(
      (argument) => argument.startsWith('--path-ignore-patterns=') && !argument.includes('/*.'),
    ),
    lastArg: command.at(-1),
  }).toStrictEqual({
    ignoreArgs: ['--path-ignore-patterns=e2e/**', '--path-ignore-patterns=drafts/**'],
    lastArg: './src/heat.test.ts',
  });
});

test('it passes the bunfig of a run as --config', () => {
  const command = buildUnitCommand(defineRig({}), {
    e2eDirs: [],
    workerCount: 1,
    testRun: {
      folder: '',
      bunfig: 'bunfig.window.toml',
      files: ['packages/shop/src/counter.test.tsx'],
      ignore: [],
    },
    flags: [],
  });

  expect(command.slice(0, 3)).toStrictEqual(['bun', 'test', '--config=./bunfig.window.toml']);
});
