import { expect, test } from 'bun:test';
import { collectTestLayoutFaults } from './collect-test-layout-faults.ts';

test('it passes a tree whose tests import only the helpers of their own workspace', () => {
  const faults = collectTestLayoutFaults(
    ['packages/kettle/src/boil.test.ts', 'packages/kettle/src/test-utils/build-water.ts'],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: "import { buildWater } from './test-utils/build-water.ts';\n",
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
  ['e2e', 'e2e/boil.test.ts', 'e2e'],
  ['integration', 'integration/pour.test.ts', 'integration'],
  ['test-utils', 'test-utils/build-water.ts', 'src/test-utils'],
])('it reports a %s folder at the repo root', (directory, path, target) => {
  expect(collectTestLayoutFaults(['package.json', path], [])).toStrictEqual([
    `${directory}/ sits at the repo root; move each file into the workspace it tests, such as packages/<name>/${target}/`,
  ]);
});

test('it passes a package folder whose name only starts like a root test folder', () => {
  expect(
    collectTestLayoutFaults(['e2e-fixtures/kettle.json', 'packages/kettle/e2e/boil.test.ts'], []),
  ).toStrictEqual([]);
});

test.each([
  ['a static import', "import { buildWater } from '../../teapot/src/test-utils/build-water.ts';\n"],
  ['a type import', "import type { Water } from '../../teapot/src/test-utils/build-water.ts';\n"],
  [
    'an import of inline types',
    "import { type Water, type Pour } from '../../teapot/src/test-utils/build-water.ts';\n",
  ],
  ['a re-export', "export { buildWater } from '../../teapot/src/test-utils/build-water.ts';\n"],
  ['a dynamic import', "await import('../../teapot/src/test-utils/build-water.ts');\n"],
  [
    'a type re-export',
    "export type { Water } from '../../teapot/src/test-utils/build-water.ts';\n",
  ],
  ['a star re-export', "export * from '../../teapot/src/test-utils/build-water.ts';\n"],
  [
    'an import type reference',
    "type Water = import('../../teapot/src/test-utils/build-water.ts').Water;\n",
  ],
  [
    'a typeof import reference',
    "type Helpers = typeof import('../../teapot/src/test-utils/build-water.ts');\n",
  ],
  [
    'an import-equals require',
    "import water = require('../../teapot/src/test-utils/build-water.ts');\n",
  ],
  ['a require call', "const water = require('../../teapot/src/test-utils/build-water.ts');\n"],
  [
    'a dynamic import of a template',
    'await import(`../../teapot/src/test-utils/build-water.ts`);\n',
  ],
  [
    'a require call of a template',
    'const water = require(`../../teapot/src/test-utils/build-water.ts`);\n',
  ],
])('it reports %s of another package test helper', (_label, text) => {
  const faults = collectTestLayoutFaults([], [{ path: 'packages/kettle/src/boil.test.ts', text }]);

  expect(faults).toStrictEqual([
    "packages/kettle/src/boil.test.ts imports packages/teapot/src/test-utils/build-water.ts, a test helper of packages/teapot; import it by the package's name, with the package as a workspace:* dev dependency",
  ]);
});

test('it reports a script that imports a test helper of a package', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'scripts/brew/run-brew.test.ts',
        text: "import { runGit } from '../../packages/kettle/src/test-utils/run-git.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "scripts/brew/run-brew.test.ts imports packages/kettle/src/test-utils/run-git.ts, a test helper of packages/kettle; import it by the package's name, with the package as a workspace:* dev dependency",
  ]);
});

test('it passes a script that imports package source, which is no test helper', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'scripts/brew/create-pot.ts',
        text: "import { readTeapot } from '../../packages/teapot/src/read-teapot.ts';\n",
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
        text: "import { buildWater } from '../teapot/src/test-utils/build-water.ts';\n",
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
          'const fixture = "import { buildWater } from \'../../teapot/src/test-utils/build-water.ts\';";',
          "// import { buildWater } from '../../teapot/src/test-utils/build-water.ts';",
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
        text: "#!/usr/bin/env bun\nimport { runGit } from '../../packages/kettle/src/test-utils/run-git.ts';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "scripts/brew/run-brew.ts imports packages/kettle/src/test-utils/run-git.ts, a test helper of packages/kettle; import it by the package's name, with the package as a workspace:* dev dependency",
  ]);
});

test('it reports an import of the test-utils folder of another package', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: "import { buildWater } from '../../teapot/src/test-utils';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    "packages/kettle/src/boil.test.ts imports packages/teapot/src/test-utils, a test helper of packages/teapot; import it by the package's name, with the package as a workspace:* dev dependency",
  ]);
});

test.each([
  ['scripts', '../../../scripts/test-utils/create-stub-tap.ts'],
  ['sync', '../../../sync/test-utils/create-stub-tap.ts'],
])('it reports a package that imports a test helper of %s', (owner, specifier) => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: `import { createStubTap } from '${specifier}';\n`,
      },
    ],
  );

  expect(faults).toStrictEqual([
    `packages/kettle/src/boil.test.ts imports ${owner}/test-utils/create-stub-tap.ts, a test helper of ${owner}; copy the helper into the importer's own test-utils/`,
  ]);
});

test('it reports a source file that does not parse, whose imports it cannot read', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/view.test.js',
        text: "import { buildWater } from '../../teapot/src/test-utils/build-water.ts';\nexport const View = () => <p>{buildWater()}</p>;\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    'packages/kettle/src/view.test.js does not parse, so the layout check cannot read its imports: Unexpected JSX expression',
  ]);
});

test('it reports a package helper that sits outside src/', () => {
  const faults = collectTestLayoutFaults(
    [
      'packages/kettle/test-utils/build-water.ts',
      'packages/kettle/test-utils/build-water.test.ts',
      'packages/kettle/src/test-utils/build-steam.ts',
    ],
    [],
  );

  expect(faults).toStrictEqual([
    'packages/kettle/test-utils/ holds test helpers outside src/; move each file into packages/kettle/src/test-utils/',
  ]);
});

test('it passes a test that imports a helper of another package by its name', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/boil.test.ts',
        text: "import { buildWater } from '@acme/teapot/test-utils/build-water';\n",
      },
      {
        path: 'packages/kettle/e2e/pour.test.ts',
        text: "import { buildWater } from '@acme/teapot/test-utils/build-water';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test.each([
  [
    'by package name',
    "'@acme/teapot/test-utils/build-water'",
    '@acme/teapot/test-utils/build-water',
  ],
  [
    'by a relative path into its own package',
    "'./test-utils/build-water.ts'",
    'packages/kettle/src/test-utils/build-water.ts',
  ],
])('it reports production code that imports a test helper %s', (_label, specifier, target) => {
  const faults = collectTestLayoutFaults(
    [],
    [{ path: 'packages/kettle/src/boil.ts', text: `import { buildWater } from ${specifier};\n` }],
  );

  expect(faults).toStrictEqual([
    `packages/kettle/src/boil.ts imports ${target}, a test helper, from production code; import test helpers only from tests and other test helpers`,
  ]);
});

test('it passes a test helper that imports another helper of its own package', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/src/test-utils/create-pot.ts',
        text: "import { buildWater } from './build-water.ts';\nimport { runGit } from '@acme/std/test-utils/run-git';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([]);
});

test('it reports a source that a package ships from its root when it imports a test helper', () => {
  const faults = collectTestLayoutFaults(
    [],
    [
      {
        path: 'packages/kettle/index.js',
        text: "import { buildWater } from '@acme/teapot/test-utils/build-water';\n",
      },
    ],
  );

  expect(faults).toStrictEqual([
    'packages/kettle/index.js imports @acme/teapot/test-utils/build-water, a test helper, from production code; import test helpers only from tests and other test helpers',
  ]);
});

test.each(['e2e/pour.ts', 'integration/pour.ts', 'evals/pour.ts', 'bench/pour.ts', 'pour.test.ts'])(
  'it passes a package file at %s that imports a test helper by name',
  (file) => {
    const faults = collectTestLayoutFaults(
      [],
      [
        {
          path: `packages/kettle/${file}`,
          text: "import { buildWater } from '@acme/teapot/test-utils/build-water';\n",
        },
      ],
    );

    expect(faults).toStrictEqual([]);
  },
);
