import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { nodeFileSystem } from './node-file-system.ts';
import type { BundleConfig } from './write-step-bundles.ts';
import {
  collectStaleStepBundles,
  readCommittedStepBundles,
  readStepBundles,
  runBundleChecks,
  writeStepBundles,
} from './write-step-bundles.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-step-bundles-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it bundles a step script with the files and packages it imports, and keeps the built-ins', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'scripts/kettle/boil.ts': [
      "import { join } from 'node:path';",
      "import { pour } from 'kettle-spout';",
      "import { heat } from './heat.ts';",
      '',
      "console.log(join('cup', pour(heat())));",
      '',
    ].join('\n'),
    'scripts/kettle/heat.ts': "export const heat = () => 'hot';\n",
    'node_modules/kettle-spout/package.json': JSON.stringify({
      name: 'kettle-spout',
      main: 'index.js',
    }),
    'node_modules/kettle-spout/index.js': "export const pour = (water) => 'poured ' + water;\n",
    'scripts/kettle/whistle.sh': 'echo whistle\n',
  });

  const bundles = await readStepBundles(
    ctx.directory,
    ['scripts/kettle/boil.ts', 'scripts/kettle/whistle.sh'],
    (config) => Bun.build(config),
  );

  const imports = bundles.map((bundle) =>
    new Bun.Transpiler({ loader: 'js' }).scanImports(bundle.text).map((imported) => imported.path),
  );

  expect(bundles.map((bundle) => bundle.path)).toStrictEqual([
    'step-bundles/scripts/kettle/boil.js',
  ]);

  expect(imports).toStrictEqual([['path']]);
  expect(bundles[0]?.text).toInclude('poured');
});

test('it fails with the error of a build that fails', () => {
  const bundles = readStepBundles('/srv/kettle', ['scripts/kettle/boil.ts'], () =>
    Promise.reject(new Error('Could not resolve: "kettle-spout"')),
  );

  expect(bundles).rejects.toThrow('Could not resolve: "kettle-spout"');
});

test('it fails for a build that writes no bundle', () => {
  const bundles = readStepBundles('/srv/kettle', ['scripts/kettle/boil.ts'], () =>
    Promise.resolve({ outputs: [] }),
  );

  expect(bundles).rejects.toThrow('bun build wrote no bundle for scripts/kettle/boil.ts');
});

test('it builds each TypeScript entry once from the repo root, and skips a shell script', async () => {
  const calls: BundleConfig[] = [];

  const build = (config: BundleConfig) => {
    calls.push(config);

    return Promise.resolve({ outputs: [{ text: () => Promise.resolve('// boil') }] });
  };

  const bundles = await readStepBundles(
    '/srv/kettle',
    ['scripts/kettle/boil.ts', 'scripts/kettle/boil.ts', 'scripts/kettle/whistle.sh'],
    build,
  );

  expect(calls).toStrictEqual([
    { entrypoints: ['/srv/kettle/scripts/kettle/boil.ts'], root: '/srv/kettle', target: 'bun' },
  ]);

  expect(bundles).toStrictEqual([{ path: 'step-bundles/scripts/kettle/boil.js', text: '// boil' }]);
});

test.each<[string, Readonly<Record<string, string>>, string[]]>([
  ['a fresh bundle', { 'step-bundles/boil.js': 'boil' }, []],
  ['a bundle whose text changed', { 'step-bundles/boil.js': 'simmer' }, ['step-bundles/boil.js']],
  ['a missing bundle', {}, ['step-bundles/boil.js']],
  [
    'a bundle that no step script builds',
    { 'step-bundles/boil.js': 'boil', 'step-bundles/steep.js': 'steep' },
    ['step-bundles/steep.js'],
  ],
])('it lists the stale bundles for %s', (_label, committed, expected) => {
  const stale = collectStaleStepBundles(
    [{ path: 'step-bundles/boil.js', text: 'boil' }],
    new Map(Object.entries(committed)),
  );

  expect(stale).toStrictEqual(expected);
});

test('it replaces the bundles folder with the bundles it writes', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, { 'step-bundles/old/steep.js': 'steep' });

  await writeStepBundles(
    ctx.directory,
    [{ path: 'step-bundles/scripts/kettle/boil.js', text: 'boil' }],
    nodeFileSystem,
  );

  const committed = await readCommittedStepBundles(ctx.directory, nodeFileSystem);

  expect(committed).toStrictEqual(new Map([['step-bundles/scripts/kettle/boil.js', 'boil']]));

  const text = await readFile(join(ctx.directory, 'step-bundles/scripts/kettle/boil.js'), 'utf8');

  expect(text).toBe('boil');
});

test('it finds no fault in the bundles this commit holds', async () => {
  const root = join(import.meta.dir, '../..');

  const committed = await readCommittedStepBundles(root, nodeFileSystem);
  const faults = await runBundleChecks(root, committed, () => Promise.resolve({ logs: [] }));

  expect(faults).toStrictEqual([]);
});

test('it reports the set whose bundle imports a package, which a runner cannot install', async () => {
  const root = join(import.meta.dir, '../..');

  const committed = await readCommittedStepBundles(root, nodeFileSystem);

  committed.set(
    'step-bundles/scripts/paths-changed/run-changed-files-step.js',
    "import { match } from 'ts-pattern';\n\nmatch(1);\n",
  );

  const faults = await runBundleChecks(root, committed, () => Promise.resolve({ logs: [] }));

  expect(faults).toStrictEqual([
    expect.stringMatching(/^the paths-changed download: Error: .*ts-pattern/u),
  ]);
});

test('it reports each error that compiling the bundles logs', async () => {
  const root = join(import.meta.dir, '../..');

  const committed = await readCommittedStepBundles(root, nodeFileSystem);

  const faults = await runBundleChecks(root, committed, () =>
    Promise.resolve({ logs: ['Could not resolve "./lid.js"'] }),
  );

  expect(faults).toStrictEqual(['bun build: Could not resolve "./lid.js"']);
});
