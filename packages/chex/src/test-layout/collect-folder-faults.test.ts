import { expect, test } from 'bun:test';
import { collectFolderFaults } from './collect-folder-faults.ts';
import type { TestLayout } from './types.ts';

function setupTest() {
  return {
    collect: (trackedPaths: readonly string[], override: Partial<TestLayout> = {}) =>
      collectFolderFaults({
        trackedPaths,
        workspaces: ['packages/kettle', 'packages/teapot'],
        isWorkspaceRepo: true,
        laneSuffixes: [],
        departures: [],
        ...override,
      }),
  };
}

test('it passes a workspace repo whose tests sit in its packages', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'package.json',
    'packages/kettle/package.json',
    'packages/kettle/e2e/cli-boil.test.ts',
    'packages/kettle/e2e/fixtures/water/lake.json',
    'packages/kettle/bench/boil.bench.ts',
    'packages/kettle/evals/taste/run-taste-eval.ts',
    'packages/kettle/src/test-utils/build-water.ts',
    'scripts/test-utils/create-stub-tap.ts',
  ]);

  expect(faults).toStrictEqual([]);
});

test.each([
  ['e2e', 'e2e/cli-boil.test.ts', 'e2e'],
  ['evals', 'evals/taste/run-taste-eval.ts', 'evals'],
  ['bench', 'bench/boil.bench.ts', 'bench'],
  ['test-utils', 'test-utils/build-water.ts', 'src/test-utils'],
])('it reports a %s folder at the root of a workspace repo', (directory, path, target) => {
  const ctx = setupTest();

  expect(ctx.collect(['package.json', path])).toStrictEqual([
    `${directory}/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/${target}/`,
  ]);
});

test('it names the folder that holds the workspaces in the example', () => {
  const ctx = setupTest();
  const faults = ctx.collect(['e2e/cli-boil.test.ts'], { workspaces: ['apps/shop'] });

  expect(faults).toStrictEqual([
    'e2e/ sits at the repo root; move each file into the workspace it tests, such as apps/<name>/e2e/',
  ]);
});

test.each(['e2e/cli-boil.test.ts', 'evals/taste/run-taste-eval.ts', 'bench/boil.bench.ts'])(
  'it passes %s at the root of a single-package repo',
  (path) => {
    const ctx = setupTest();
    const faults = ctx.collect(['package.json', path], { workspaces: [], isWorkspaceRepo: false });

    expect(faults).toStrictEqual([]);
  },
);

test('it reports a root test-utils folder of a single-package repo', () => {
  const ctx = setupTest();

  const faults = ctx.collect(['test-utils/build-water.ts'], {
    workspaces: [],
    isWorkspaceRepo: false,
  });

  expect(faults).toStrictEqual([
    'test-utils/ sits at the repo root; move each file into src/test-utils/',
  ]);
});

test('it passes a package folder whose name only starts like a root test folder', () => {
  const ctx = setupTest();
  const faults = ctx.collect(['e2e-fixtures/kettle.json', 'packages/kettle/e2e/cli-boil.test.ts']);

  expect(faults).toStrictEqual([]);
});

test('it reports a package helper that sits outside src/', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/test-utils/build-water.ts',
    'packages/kettle/test-utils/build-water.test.ts',
    'packages/kettle/src/test-utils/build-steam.ts',
  ]);

  expect(faults).toStrictEqual([
    'packages/kettle/test-utils/ holds test helpers outside src/; move each file into packages/kettle/src/test-utils/',
  ]);
});

test.each([
  ['the repo root', 'integration/pour.test.ts', ''],
  ['a package', 'packages/kettle/integration/pour.test.ts', 'packages/kettle/'],
  ['scripts', 'scripts/integration/pour.test.ts', 'scripts/'],
  ['src', 'packages/kettle/src/integration/pour.test.ts', 'packages/kettle/src/'],
])('it reports an integration folder at %s', (_label, path, root) => {
  const ctx = setupTest();

  expect(ctx.collect([path, `${root}integration/spill.test.ts`])).toStrictEqual([
    `${root}integration/ holds tests; move each one beside the module it tests, in the package that wires together the packages it imports`,
  ]);
});

test.each(['test', 'tests', '__tests__'])('it reports a folder named %s', (name) => {
  const ctx = setupTest();
  const faults = ctx.collect([`packages/kettle/${name}/boil.test.ts`]);

  expect(faults).toStrictEqual([
    `packages/kettle/${name}/ is a test folder; move its tests beside the modules they test, its end-to-end tests into the package's e2e/, and its helpers into src/test-utils/`,
  ]);
});

test('it passes a folder whose name only contains test', () => {
  const ctx = setupTest();

  expect(
    ctx.collect(['packages/kettle/src/test-fixtures/water.json', 'docs/latest/a.md']),
  ).toStrictEqual([]);
});

test('it reports a subfolder of e2e/ other than fixtures/', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/package.json',
    'packages/kettle/e2e/helpers/pour.ts',
    'packages/kettle/e2e/helpers/spill.ts',
    'packages/kettle/e2e/fixtures/lake.json',
  ]);

  expect(faults).toStrictEqual([
    'packages/kettle/e2e/helpers/ is a subfolder of packages/kettle/e2e/; keep the tests flat in packages/kettle/e2e/, with fixtures in packages/kettle/e2e/fixtures/ and helpers in src/test-utils/',
  ]);
});

test('it reports a subfolder of bench/, fixtures/ included', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/package.json',
    'packages/kettle/bench/fixtures/lake.json',
  ]);

  expect(faults).toStrictEqual([
    'packages/kettle/bench/fixtures/ is a subfolder of packages/kettle/bench/; keep the bench files flat in packages/kettle/bench/, with helpers in src/test-utils/',
  ]);
});

test('it reports a subfolder below evals/<name>/ and passes the suite folder itself', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/package.json',
    'packages/kettle/evals/taste/run-taste-eval.ts',
    'packages/kettle/evals/taste/cases/sweet.json',
  ]);

  expect(faults).toStrictEqual([
    "packages/kettle/evals/taste/cases/ is a subfolder of packages/kettle/evals/taste/; keep that suite's files flat in packages/kettle/evals/taste/, with helpers in src/test-utils/",
  ]);
});

test('it leaves out an e2e/ folder in a folder with no package.json', () => {
  const ctx = setupTest();

  expect(ctx.collect(['packages/kettle/src/legacy/e2e/helpers/pour.ts'])).toStrictEqual([]);
});

test.each([
  {
    label: 'a declared root e2e/ folder',
    trackedPaths: ['e2e/journey-boil.test.ts'],
    departures: ['e2e'],
    faults: [],
  },
  {
    label: 'a declared integration folder',
    trackedPaths: ['packages/kettle/integration/pour.test.ts'],
    departures: ['packages/kettle/integration'],
    faults: [],
  },
  {
    label: 'a declared root test-utils/ folder',
    trackedPaths: ['test-utils/build-water.ts'],
    departures: ['test-utils'],
    faults: [],
  },
  {
    label: 'a declared tests/ folder',
    trackedPaths: ['packages/kettle/tests/boil.test.ts'],
    departures: ['packages/kettle/tests'],
    faults: [],
  },
  {
    label: 'a declared package test-utils/ folder outside src/',
    trackedPaths: ['packages/kettle/test-utils/build-water.ts'],
    departures: ['packages/kettle/test-utils'],
    faults: [],
  },
  {
    label: 'a declared subfolder of e2e/',
    trackedPaths: ['packages/kettle/package.json', 'packages/kettle/e2e/helpers/pour.ts'],
    departures: ['packages/kettle/e2e/helpers'],
    faults: [],
  },
  {
    label: 'a root e2e/ folder that the repo declares nothing for',
    trackedPaths: ['e2e/journey-boil.test.ts'],
    departures: [],
    faults: [
      'e2e/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/e2e/',
    ],
  },
  {
    label: 'a declared folder that git tracks no file in',
    trackedPaths: ['packages/kettle/src/boil.ts'],
    departures: ['e2e'],
    faults: [
      'e2e/ is a test-layout departure in package.json, and git tracks no file in it; remove the departure',
    ],
  },
  {
    label: 'a fault of another folder beside a declared one',
    trackedPaths: ['e2e/journey-boil.test.ts', 'bench/boil.bench.ts'],
    departures: ['e2e'],
    faults: [
      'bench/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/bench/',
    ],
  },
  {
    label: 'a subfolder fault inside a declared folder',
    trackedPaths: [
      'packages/kettle/package.json',
      'packages/kettle/e2e/helpers/pour.ts',
      'packages/kettle/e2e/cli-boil.test.ts',
    ],
    departures: ['packages/kettle/e2e'],
    faults: [
      'packages/kettle/e2e/helpers/ is a subfolder of packages/kettle/e2e/; keep the tests flat in packages/kettle/e2e/, with fixtures in packages/kettle/e2e/fixtures/ and helpers in src/test-utils/',
    ],
  },
])('it reports the folder faults of a tree with $label', (row) => {
  const ctx = setupTest();

  expect(ctx.collect(row.trackedPaths, { departures: row.departures })).toStrictEqual([
    ...row.faults,
  ]);
});

test('it takes the example from a workspace outside the folder it reports', () => {
  const ctx = setupTest();

  const faults = ctx.collect(['e2e/journey-boil.test.ts', 'e2e/plugin/package.json'], {
    workspaces: ['e2e/plugin', 'packages/kettle'],
  });

  expect(faults).toStrictEqual([
    'e2e/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/e2e/',
  ]);
});
