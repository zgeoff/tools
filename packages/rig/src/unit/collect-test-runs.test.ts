import { expect, test } from 'bun:test';
import { collectTestRuns } from './collect-test-runs.ts';

test('it lets the root run of a whole lane find its own tests, and leaves out the tests the other runs take', () => {
  const runs = collectTestRuns({
    bunfigs: [{ path: 'bunfig.window.toml', files: ['packages/shop/**/*.test.tsx'] }],
    trackedFiles: [
      'packages/oven/package.json',
      'packages/oven/bunfig.toml',
      'packages/oven/src/heat.test.ts',
      'packages/shop/package.json',
      'packages/shop/src/counter.test.tsx',
      'src/till.test.ts',
    ],
    tests: [
      'packages/oven/src/heat.test.ts',
      'packages/shop/src/counter.test.tsx',
      'src/till.test.ts',
    ],
    isDiscovery: true,
  });

  expect(runs).toStrictEqual([
    {
      folder: '',
      bunfig: null,
      files: null,
      ignore: ['packages/oven/**', 'packages/shop/**/*.test.tsx'],
    },
    {
      folder: '',
      bunfig: 'bunfig.window.toml',
      files: ['packages/shop/src/counter.test.tsx'],
      ignore: [],
    },
    {
      folder: 'packages/oven',
      bunfig: null,
      files: ['packages/oven/src/heat.test.ts'],
      ignore: [],
    },
  ]);
});

test('it gives each run its named files when the tests are a selection', () => {
  const runs = collectTestRuns({
    bunfigs: [],
    trackedFiles: ['packages/oven/package.json', 'packages/oven/bunfig.toml'],
    tests: ['src/till.test.ts', 'packages/oven/src/heat.test.ts'],
    isDiscovery: false,
  });

  expect(runs).toStrictEqual([
    { folder: '', bunfig: null, files: ['src/till.test.ts'], ignore: [] },
    {
      folder: 'packages/oven',
      bunfig: null,
      files: ['packages/oven/src/heat.test.ts'],
      ignore: [],
    },
  ]);
});

test('it gives a test to the deepest package with a bunfig.toml above it', () => {
  const runs = collectTestRuns({
    bunfigs: [],
    trackedFiles: [
      'packages/oven/package.json',
      'packages/oven/bunfig.toml',
      'packages/oven/tray/package.json',
      'packages/oven/tray/bunfig.toml',
    ],
    tests: ['packages/oven/tray/src/rack.test.ts'],
    isDiscovery: false,
  });

  expect(runs).toStrictEqual([
    {
      folder: 'packages/oven/tray',
      bunfig: null,
      files: ['packages/oven/tray/src/rack.test.ts'],
      ignore: [],
    },
  ]);
});

test('it runs a test from the root when the bunfig.toml above it sits in a folder with no package.json', () => {
  const runs = collectTestRuns({
    bunfigs: [],
    trackedFiles: ['fixtures/oven/bunfig.toml'],
    tests: ['fixtures/oven/heat.test.ts'],
    isDiscovery: false,
  });

  expect(runs).toStrictEqual([
    { folder: '', bunfig: null, files: ['fixtures/oven/heat.test.ts'], ignore: [] },
  ]);
});

test("it runs a test that a bunfigs entry matches under the entry's bunfig, over its package's own", () => {
  const runs = collectTestRuns({
    bunfigs: [{ path: 'bunfig.window.toml', files: ['**/*.test.tsx'] }],
    trackedFiles: ['packages/shop/package.json', 'packages/shop/bunfig.toml'],
    tests: ['packages/shop/src/counter.test.tsx'],
    isDiscovery: false,
  });

  expect(runs).toStrictEqual([
    {
      folder: '',
      bunfig: 'bunfig.window.toml',
      files: ['packages/shop/src/counter.test.tsx'],
      ignore: [],
    },
  ]);
});

test('it starts no root run when every test belongs to another run', () => {
  const runs = collectTestRuns({
    bunfigs: [],
    trackedFiles: ['packages/oven/package.json', 'packages/oven/bunfig.toml'],
    tests: ['packages/oven/src/heat.test.ts'],
    isDiscovery: true,
  });

  expect(runs).toStrictEqual([
    {
      folder: 'packages/oven',
      bunfig: null,
      files: ['packages/oven/src/heat.test.ts'],
      ignore: [],
    },
  ]);
});
