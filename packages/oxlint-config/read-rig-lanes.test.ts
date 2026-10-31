import { expect, test } from 'bun:test';
import { pathToFileURL } from 'node:url';
import { defineRig, parseRigConfig } from '../rig/src/index.ts';
import readRigLanes from './read-rig-lanes.js';
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

test("it fails the plugin load with rig's parser reason for a lane whose limit is no number", async () => {
  const files = {
    'rig.config.ts': [
      'export default {',
      '  lanes: [',
      "    { name: 'kiln', suffix: '.kiln', limitMs: '15s', parallel: 1, memory: null, start: null, stop: null },",
      '  ],',
      '};',
      '',
    ].join('\n'),
    'oven.kiln.test.ts': buildTimeoutSource(1000),
  };

  const result = await runLintTree(files, 'oven.kiln.test.ts', {
    'zgeoff/max-test-timeout': 'error',
  });

  expect(result.exitCode).not.toBe(0);

  expect(result.stdout).toInclude(
    'lane "kiln" has the limitMs "15s", which defineRig never resolves',
  );
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

  // oxlint wraps the plugin error at a fixed width, so a long temp path can split the message.
  expect(result.stdout.replaceAll(/\n\s*\| /gu, ' ')).toInclude(
    'reading a TypeScript config needs Node >= 22.18 or Bun',
  );
});

test('it reads no lanes outside a repository', async () => {
  const lanes = await readRigLanes('/bakery', {
    resolveRepoRoot: () => null,
    probeFile: () => true,
    importModule: () => Promise.resolve({}),
    resolveRepoRig: () => '/bakery/node_modules/@zgeoff/rig/src/index.ts',
  });

  expect(lanes).toBeNull();
});

test('it reads no lanes from a repository without a rig.config.ts', async () => {
  const lanes = await readRigLanes('/bakery/oven', {
    resolveRepoRoot: () => '/bakery',
    probeFile: () => false,
    importModule: () => Promise.resolve({}),
    resolveRepoRig: () => '/bakery/node_modules/@zgeoff/rig/src/index.ts',
  });

  expect(lanes).toBeNull();
});

test('it keys each lane but unit by its suffix, and a directory lane by its name', async () => {
  const modules: Readonly<Record<string, unknown>> = {
    [pathToFileURL('/bakery/rig.config.ts').href]: {
      default: defineRig({ lanes: { kiln: { limit: '15s' } } }),
    },
    [pathToFileURL('/bakery/node_modules/@zgeoff/rig/src/index.ts').href]: { parseRigConfig },
  };

  const lanes = await readRigLanes('/bakery/oven', {
    resolveRepoRoot: () => '/bakery',
    probeFile: () => true,
    importModule: (url) => Promise.resolve(modules[url]),
    resolveRepoRig: () => '/bakery/node_modules/@zgeoff/rig/src/index.ts',
  });

  expect(lanes).toStrictEqual(
    new Map([
      ['e2e', 15_000],
      ['browser', 10_000],
      ['docker', 15_000],
      ['host', 15_000],
      ['agent-sdk', 5000],
      ['model-api', 120_000],
      ['kiln', 15_000],
    ]),
  );
});

test("it refuses a rig.config.ts that rig's parser refuses, with the parser's reason", async () => {
  const modules: Readonly<Record<string, unknown>> = {
    [pathToFileURL('/bakery/rig.config.ts').href]: { default: { lanes: 3 } },
    [pathToFileURL('/bakery/node_modules/@zgeoff/rig/src/index.ts').href]: { parseRigConfig },
  };

  const failure = await readRigLanes('/bakery/oven', {
    resolveRepoRoot: () => '/bakery',
    probeFile: () => true,
    importModule: (url) => Promise.resolve(modules[url]),
    resolveRepoRig: () => '/bakery/node_modules/@zgeoff/rig/src/index.ts',
  }).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(TypeError);

  expect(failure).toHaveProperty(
    'message',
    '/bakery/rig.config.ts must default-export the result of defineRig from @zgeoff/rig: its lanes are no list',
  );
});

test('it refuses a rig.config.ts that fails to import, with the cause in the message', async () => {
  const cause = new Error('Cannot find module ./missing-rig.ts');

  const failure = await readRigLanes('/bakery/oven', {
    resolveRepoRoot: () => '/bakery',
    probeFile: () => true,
    importModule: () => Promise.reject(cause),
    resolveRepoRig: () => '/bakery/node_modules/@zgeoff/rig/src/index.ts',
  }).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    'cannot load /bakery/rig.config.ts: Cannot find module ./missing-rig.ts (reading a TypeScript config needs Node >= 22.18 or Bun)',
  );

  expect(failure).toHaveProperty('cause', cause);
});
