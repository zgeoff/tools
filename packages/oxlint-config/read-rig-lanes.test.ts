import { expect, test } from 'bun:test';
import { buildRigConfigSource } from './test-utils/build-rig-config-source.ts';
import { buildTimeoutSource } from './test-utils/build-timeout-source.ts';
import { runLintTree } from './test-utils/run-lint-tree.ts';

test('it reads the limit of a lane that rig.config.ts declares', async () => {
  const files = {
    'rig.config.ts': buildRigConfigSource("{ lanes: { kiln: { limit: '15s' } } }"),
    'oven.kiln.test.ts': buildTimeoutSource(20_000),
  };

  const result = await runLintTree(files, 'oven.kiln.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.stdout).toInclude('above the 15000 ms limit of the kiln lane');
});

test('it reads the limit that rig.config.ts gives a built-in lane', async () => {
  const files = {
    'rig.config.ts': buildRigConfigSource("{ lanes: { host: { limit: '30s' } } }"),
    'oven.host.test.ts': buildTimeoutSource(30_000),
    'e2e/bake.test.ts': buildTimeoutSource(15_001),
  };

  const atLimit = await runLintTree(files, 'oven.host.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  const e2eAbove = await runLintTree(files, 'e2e/bake.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(atLimit.exitCode).toBe(0);
  expect(e2eAbove.stdout).toInclude('above the 15000 ms limit of the e2e lane');
});

test('it fails the plugin load for a lane whose suffix would take the place of the e2e lane limit', async () => {
  const files = {
    'rig.config.ts': buildRigConfigSource("{ lanes: { smoke: { suffix: '.e2e', limit: '60s' } } }"),
    'e2e/bake.test.ts': buildTimeoutSource(60_000),
  };

  const result = await runLintTree(files, 'e2e/bake.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toInclude('the suffix ".e2e", which the e2e lane reserves');
});

test('it keeps a lane test beside its module under the suffix that rig.config.ts declares', async () => {
  const files = {
    'rig.config.ts': buildRigConfigSource("{ lanes: { kiln: { limit: '15s' } } }"),
    'oven.ts': 'export const heat = 1;\n',
    'oven.kiln.test.ts': buildTimeoutSource(1000),
    'stove.kiln.test.ts': buildTimeoutSource(1000),
  };

  const beside = await runLintTree(files, 'oven.kiln.test.ts', {
    'zgeoff/test-beside-module': 'error',
  });

  const missing = await runLintTree(files, 'stove.kiln.test.ts', {
    'zgeoff/test-beside-module': 'error',
  });

  expect(beside.exitCode).toBe(0);
  expect(missing.stdout).toInclude('no `stove.<ext>` sits in this directory');
});

test.each(['zgeoff/max-test-timeout', 'zgeoff/test-beside-module'])(
  'it reports a lanes option of %s in a repo that has a rig.config.ts',
  async (rule) => {
    const files = {
      'rig.config.ts': buildRigConfigSource('{ lanes: {} }'),
      'oven.test.ts': buildTimeoutSource(1000),
      'oven.ts': 'export const heat = 1;\n',
    };

    const result = await runLintTree(files, 'oven.test.ts', {
      [rule]: ['error', { lanes: ['kiln'] }],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toInclude('Declare lanes in rig.config.ts only');
  },
);

test('it leaves the lanes option alone in a repo with no rig.config.ts', async () => {
  const files = { 'oven.kiln.test.ts': buildTimeoutSource(60_000), 'oven.ts': '' };

  const result = await runLintTree(files, 'oven.kiln.test.ts', {
    'zgeoff/max-test-timeout': ['error', { lanes: { kiln: 60_000 } }],
  });

  expect(result.exitCode).toBe(0);
});

test('it fails the plugin load with the cause when rig.config.ts cannot be imported', async () => {
  const files = {
    'rig.config.ts':
      "import { defineRig } from './missing-rig.ts';\n\nexport default defineRig({});\n",
    'oven.test.ts': buildTimeoutSource(1000),
  };

  const result = await runLintTree(files, 'oven.test.ts', { 'zgeoff/max-test-timeout': 'error' });

  expect(result.exitCode).not.toBe(0);
  expect(result.stdout).toInclude('reading a TypeScript config needs Node >= 22.18 or Bun');
});
