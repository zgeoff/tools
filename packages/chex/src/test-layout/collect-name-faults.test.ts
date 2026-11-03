import { expect, test } from 'bun:test';
import { collectNameFaults } from './collect-name-faults.ts';
import type { TestLayout } from './types.ts';

function setupTest() {
  return {
    collect: (trackedPaths: readonly string[], override: Partial<TestLayout> = {}) =>
      collectNameFaults({
        trackedPaths: ['packages/kettle/package.json', ...trackedPaths],
        workspaces: ['packages/kettle'],
        isWorkspaceRepo: true,
        laneSuffixes: ['.browser', '.host'],
        ...override,
      }),
  };
}

test.each([
  'start-',
  'stop-',
  'recover-',
  'cli-',
  'build-',
  'runtime-',
  'enforce-',
  'compat-',
  'journey-',
])('it passes an e2e test whose name starts with %s', (prefix) => {
  const ctx = setupTest();

  expect(ctx.collect([`packages/kettle/e2e/${prefix}boil.test.ts`])).toStrictEqual([]);
});

test('it reports an e2e test whose name starts with no e2e prefix', () => {
  const ctx = setupTest();

  expect(ctx.collect(['packages/kettle/e2e/smoke.test.ts'])).toStrictEqual([
    "packages/kettle/e2e/smoke.test.ts doesn't start with an e2e prefix; rename it to start with start-, stop-, recover-, cli-, build-, runtime-, enforce-, compat- or journey-",
  ]);
});

test('it leaves out a file in e2e/fixtures and one that is no test', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/e2e/fixtures/smoke.test.ts',
    'packages/kettle/e2e/helper.ts',
  ]);

  expect(faults).toStrictEqual([]);
});

test('it checks the e2e names at the root of a single-package repo only', () => {
  const ctx = setupTest();

  expect(ctx.collect(['e2e/smoke.test.ts'], { isWorkspaceRepo: false })).toHaveLength(1);
  expect(ctx.collect(['e2e/smoke.test.ts'])).toStrictEqual([]);
});

test('it passes a test beside the module it tests, whatever the extension', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/src/boil.ts',
    'packages/kettle/src/boil.test.ts',
    'packages/kettle/src/run-hook.sh',
    'packages/kettle/src/run-hook.test.ts',
    'packages/kettle/src/Pot.tsx',
    'packages/kettle/src/Pot.test.ts',
  ]);

  expect(faults).toStrictEqual([]);
});

test('it reports a test in src/ with no module beside it', () => {
  const ctx = setupTest();
  const faults = ctx.collect(['packages/kettle/src/boil.test.ts', 'packages/kettle/src/steep.ts']);

  expect(faults).toStrictEqual([
    'packages/kettle/src/boil.test.ts has no boil.<ext> beside it; move the test next to the module it tests, or rename it after that module',
  ]);
});

test('it reports a test whose module sits in another folder', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/src/a/boil.ts',
    'packages/kettle/src/b/boil.test.ts',
  ]);

  expect(faults).toHaveLength(1);
});

test('it leaves a test outside src/ without a module', () => {
  const ctx = setupTest();

  expect(ctx.collect(['scripts/brew/run-brew.test.ts', 'lefthook.test.ts'])).toStrictEqual([]);
});

test('it passes a lane test beside the module it tests', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/src/boil.ts',
    'packages/kettle/src/boil.host.test.ts',
  ]);

  expect(faults).toStrictEqual([]);
});

test('it reports a lane test with no module beside it', () => {
  const ctx = setupTest();
  const faults = ctx.collect(['packages/kettle/src/boil.host.test.ts']);

  expect(faults).toStrictEqual([
    'packages/kettle/src/boil.host.test.ts has no boil.<ext> beside it; move the test next to the module it tests, or rename it after that module',
  ]);
});

test('it passes a module test of a module whose name holds a dot', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/src/boil.stage.ts',
    'packages/kettle/src/boil.stage.test.ts',
  ]);

  expect(faults).toStrictEqual([]);
});

test('it reports an undeclared lane suffix with no module of that name beside it', () => {
  const ctx = setupTest();

  const faults = ctx.collect([
    'packages/kettle/src/boil.ts',
    'packages/kettle/src/boil.slow.test.ts',
  ]);

  expect(faults).toStrictEqual([
    "packages/kettle/src/boil.slow.test.ts uses the suffix .slow, which no lane in rig.config.ts declares, and boil.slow.<ext> isn't beside it; declare the lane in rig.config.ts lanes, or rename the test after the module it tests",
  ]);
});

test('it reports an undeclared lane suffix outside src/', () => {
  const ctx = setupTest();
  const faults = ctx.collect(['scripts/brew/run-brew.slow.test.ts']);

  expect(faults).toHaveLength(1);
});

test('it passes a suffix that a lane of rig.config.ts declares', () => {
  const ctx = setupTest();

  const faults = ctx.collect(
    ['packages/kettle/src/boil.ts', 'packages/kettle/src/boil.kiln.test.ts'],
    { laneSuffixes: ['.kiln'] },
  );

  expect(faults).toStrictEqual([]);
});
