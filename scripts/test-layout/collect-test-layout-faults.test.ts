import { expect, test } from 'bun:test';
import { collectTestLayoutFaults } from './collect-test-layout-faults.ts';

test('it passes a tree whose tests import only the helpers of their own workspace', () => {
  const faults = collectTestLayoutFaults(
    ['packages/kettle/src/boil.test.ts', 'packages/kettle/test-utils/build-water.ts'],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: "import { buildWater } from '../test-utils/build-water.ts';\n",
      },
      {
        path: 'scripts/brew/run-brew.test.ts',
        text: "import { createStubTap } from '../test-utils/create-stub-tap.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test.each([
  ['e2e', 'e2e/boil.test.ts'],
  ['integration', 'integration/pour.test.ts'],
  ['test-utils', 'test-utils/build-water.ts'],
])('it reports a %s folder at the repo root', (directory, path) => {
  expect(collectTestLayoutFaults(['package.json', path], [])).toStrictEqual([
    `${directory}/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/${directory}/`,
  ]);
});

test('it passes a package folder whose name only starts like a root test folder', () => {
  expect(
    collectTestLayoutFaults(['e2e-fixtures/kettle.json', 'packages/kettle/e2e/boil.test.ts'], []),
  ).toStrictEqual([]);
});

test.each([
  ['a static import', "import { buildWater } from '../../teapot/test-utils/build-water.ts';\n"],
  ['a type import', "import type { Water } from '../../teapot/test-utils/build-water.ts';\n"],
  [
    'an import of inline types',
    "import { type Water, type Pour } from '../../teapot/test-utils/build-water.ts';\n",
  ],
  ['a re-export', "export { buildWater } from '../../teapot/test-utils/build-water.ts';\n"],
  ['a dynamic import', "await import('../../teapot/test-utils/build-water.ts');\n"],
  ['a type re-export', "export type { Water } from '../../teapot/test-utils/build-water.ts';\n"],
  ['a star re-export', "export * from '../../teapot/test-utils/build-water.ts';\n"],
  [
    'an import type reference',
    "type Water = import('../../teapot/test-utils/build-water.ts').Water;\n",
  ],
  [
    'a typeof import reference',
    "type Helpers = typeof import('../../teapot/test-utils/build-water.ts');\n",
  ],
  [
    'an import-equals require',
    "import water = require('../../teapot/test-utils/build-water.ts');\n",
  ],
  ['a require call', "const water = require('../../teapot/test-utils/build-water.ts');\n"],
  ['a dynamic import of a template', 'await import(`../../teapot/test-utils/build-water.ts`);\n'],
  [
    'a require call of a template',
    'const water = require(`../../teapot/test-utils/build-water.ts`);\n',
  ],
])('it reports %s of another package test helper', (_label, text) => {
  const faults = collectTestLayoutFaults([], [{ path: 'packages/kettle/src/boil.test.ts', text }]);

  expect(faults).toStrictEqual([
    "packages/kettle/src/boil.test.ts imports packages/teapot/test-utils/build-water.ts, a test helper of packages/teapot; copy the helper into the importer's own test-utils/",
  ]);
});

test('it reports a script that imports a test helper of a package', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'scripts/brew/run-brew.test.ts',
        text: "import { runGit } from '../../packages/kettle/test-utils/run-git.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "scripts/brew/run-brew.test.ts imports packages/kettle/test-utils/run-git.ts, a test helper of packages/kettle; copy the helper into the importer's own test-utils/",
  ]);
});

test('it passes an import of another package source, which is no test helper', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/test-utils/create-pot.ts',
        text: "import { readTeapot } from '../../teapot/src/read-teapot.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test('it reads only source files for imports', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/README.md',
        text: "import { buildWater } from '../teapot/test-utils/build-water.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test('it passes import text that sits in a string or a comment', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: [
          'const fixture = "import { buildWater } from \'../../teapot/test-utils/build-water.ts\';";',
          "// import { buildWater } from '../../teapot/test-utils/build-water.ts';",
          '',
        ].join('\n'),
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test('it reads the imports of a script that starts with a shebang line', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'scripts/brew/run-brew.ts',
        text: "#!/usr/bin/env bun\nimport { runGit } from '../../packages/kettle/test-utils/run-git.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "scripts/brew/run-brew.ts imports packages/kettle/test-utils/run-git.ts, a test helper of packages/kettle; copy the helper into the importer's own test-utils/",
  ]);
});

test('it reports an import of the test-utils folder of another package', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: "import { buildWater } from '../../teapot/test-utils';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "packages/kettle/src/boil.test.ts imports packages/teapot/test-utils, a test helper of packages/teapot; copy the helper into the importer's own test-utils/",
  ]);
});
