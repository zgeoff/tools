import { expect, test } from 'bun:test';
import { Visitor, parseSync } from 'oxc-parser';
import { collectTestLayoutFaults } from './collect-test-layout-faults.ts';

test('it reports the faults of the folders, the names and the imports together', () => {
  const faults = collectTestLayoutFaults(
    { Visitor, parseSync },
    {
      trackedPaths: ['test-utils/build-water.ts', 'packages/kettle/src/boil.test.ts'],
      workspaces: ['packages/kettle'],
      isWorkspaceRepo: true,
      laneSuffixes: [],
      departures: [],
    },
    [
      {
        path: 'packages/kettle/src/steep.ts',
        text: "import { buildWater } from '@acme/teapot/test-utils/build-water';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    'test-utils/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/src/test-utils/',
    'packages/kettle/src/boil.test.ts has no boil.<ext> beside it; move the test next to the module it tests, or rename it after that module',
    'packages/kettle/src/steep.ts imports @acme/teapot/test-utils/build-water, a test helper, from production code; import test helpers only from tests and other test helpers',
  ]);
});

test('it passes a tree with no fault', () => {
  const faults = collectTestLayoutFaults(
    { Visitor, parseSync },
    {
      trackedPaths: ['packages/kettle/src/boil.ts', 'packages/kettle/src/boil.test.ts'],
      workspaces: ['packages/kettle'],
      isWorkspaceRepo: true,
      laneSuffixes: [],
      departures: [],
    },
    [],
  );

  expect(faults).toStrictEqual([]);
});
