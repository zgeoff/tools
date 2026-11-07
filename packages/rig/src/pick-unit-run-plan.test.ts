import { expect, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { pickUnitRunPlan } from './pick-unit-run-plan.ts';

test.each([['--watch'], ['--coverage'], ['--coverage-reporter=lcov']])(
  'it refuses %s when the tests need more than one run',
  (flag) => {
    const plan = pickUnitRunPlan(
      defineRig({}),
      {
        flags: [flag],
        tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
        isDiscovery: false,
      },
      ['packages/oven/package.json', 'packages/oven/bunfig.toml'],
    );

    expect(plan).toStrictEqual({
      kind: 'refused',
      message: `rig: ${flag} needs the tests in one bun test run, and these tests need 2, one for each bunfig; name the tests of one bunfig\n`,
    });
  },
);

test.each([['--watch'], ['--coverage']])(
  'it plans one run for %s when the tests need one run',
  (flag) => {
    const plan = pickUnitRunPlan(
      defineRig({}),
      { flags: [flag], tests: ['src/till.test.ts'], isDiscovery: false },
      ['packages/oven/package.json', 'packages/oven/bunfig.toml'],
    );

    expect(plan).toStrictEqual({
      kind: 'runs',
      testRuns: [{ folder: '', bunfig: null, files: ['src/till.test.ts'], ignore: [] }],
    });
  },
);

test('it plans one run for each bunfig when no flag needs a single run', () => {
  const plan = pickUnitRunPlan(
    defineRig({}),
    {
      flags: ['--timeout=15000'],
      tests: ['packages/oven/src/heat.test.ts', 'src/till.test.ts'],
      isDiscovery: false,
    },
    ['packages/oven/package.json', 'packages/oven/bunfig.toml'],
  );

  expect(plan).toStrictEqual({
    kind: 'runs',
    testRuns: [
      { folder: '', bunfig: null, files: ['src/till.test.ts'], ignore: [] },
      {
        folder: 'packages/oven',
        bunfig: null,
        files: ['packages/oven/src/heat.test.ts'],
        ignore: [],
      },
    ],
  });
});
