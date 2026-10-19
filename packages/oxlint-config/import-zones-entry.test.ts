import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ImportZonesOptions } from '@zgeoff/oxlint-config/import-zones';
import { collectRefusingEdges, importZonesSchema } from '@zgeoff/oxlint-config/import-zones';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'import-zones-entry-test-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    oxlintBin: join(import.meta.dir, '..', '..', 'node_modules', '.bin', 'oxlint'),
    pluginPath: join(import.meta.dir, 'plugin.js'),
  };
}

test('it gives a schema that names every option and refuses any other', () => {
  expect(importZonesSchema).toMatchObject({ type: 'object', additionalProperties: false });

  expect(importZonesSchema['properties']).toContainAllKeys([
    'zones',
    'extensions',
    'conditions',
    'workspaces',
    'edges',
    'modules',
    'globals',
    'unzoned',
    'unresolved',
    'selfImports',
  ]);
});

test('it returns an edge whose to zone holds the target', () => {
  const edge = { name: 'app-no-scripts', from: ['app'], to: ['scripts'] };

  const refusing = collectRefusingEdges(
    { zones: { app: ['src/**'], scripts: ['scripts/**'] }, edges: [edge] },
    { from: 'src/main.ts', to: 'scripts/seed.ts' },
  );

  expect(refusing).toStrictEqual([edge]);
});

test('it returns no edge for a target that an allow zone holds', () => {
  const options = {
    zones: { app: ['src/**'], shared: ['src/shared/**'], scripts: ['scripts/**'] },
    edges: [{ name: 'app-shared-only', from: ['app'], to: ['app'], allow: ['shared'] }],
  };

  expect(
    collectRefusingEdges(options, { from: 'src/main.ts', to: 'src/shared/clock.ts' }),
  ).toStrictEqual([]);
});

test('it returns an allow-only edge for a target in no zone', () => {
  const edge = { name: 'shared-alone', from: ['shared'], allow: ['shared'] };

  const refusing = collectRefusingEdges(
    { zones: { shared: ['src/shared/**'] }, edges: [edge] },
    { from: 'src/shared/clock.ts', to: 'vendor/tick.ts' },
  );

  expect(refusing).toStrictEqual([edge]);
});

test.each([
  ['a type-only import', true, []],
  ['a runtime import', false, ['shared-alone']],
])('it judges %s of a target that an allowTypeOnly glob matches', (_, typeOnly, expected) => {
  const options = {
    zones: { shared: ['src/shared/**'], app: ['src/app/**'] },
    edges: [
      {
        name: 'shared-alone',
        from: ['shared'],
        allow: ['shared'],
        allowTypeOnly: ['**/types.ts'],
      },
    ],
  };

  const refusing = collectRefusingEdges(options, {
    from: 'src/shared/clock.ts',
    to: 'src/app/types.ts',
    typeOnly,
  });

  expect(refusing.map((edge) => edge.name)).toStrictEqual(expected);
});

test.each([
  ['inside its own directory', 'src/billing/totals.ts', []],
  ['into a sibling directory', 'src/orders/totals.ts', ['features']],
])('it judges an allowWithin edge for an import %s', (_, to, expected) => {
  const options = {
    zones: { feature: ['src/{billing,orders}/**'], shared: ['src/shared/**'] },
    edges: [{ name: 'features', from: ['feature'], allow: ['shared'], allowWithin: 'src/*' }],
  };

  const refusing = collectRefusingEdges(options, { from: 'src/billing/invoice.ts', to });

  expect(refusing.map((edge) => edge.name)).toStrictEqual(expected);
});

test('it returns no edge for an importer that an ignore glob matches', () => {
  const options = {
    zones: { app: ['src/**'], scripts: ['scripts/**'] },
    edges: [{ name: 'app-no-scripts', from: ['app'], to: ['scripts'], ignore: ['**/*.test.ts'] }],
  };

  expect(
    collectRefusingEdges(options, { from: 'src/main.test.ts', to: 'scripts/seed.ts' }),
  ).toStrictEqual([]);
});

test('it returns no edge for an importer outside every from zone', () => {
  const options = {
    zones: { app: ['src/**'], scripts: ['scripts/**'] },
    edges: [{ name: 'app-no-scripts', from: ['app'], to: ['scripts'] }],
  };

  expect(
    collectRefusingEdges(options, { from: 'tools/build.ts', to: 'scripts/seed.ts' }),
  ).toStrictEqual([]);
});

test('it returns the edges that the rule reports for the same import', async () => {
  const ctx = await setupTest();

  const options: ImportZonesOptions = {
    zones: { app: ['src/**'], shared: ['src/shared/**'], scripts: ['scripts/**'] },
    edges: [
      { name: 'app-no-scripts', from: ['app'], to: ['scripts'] },
      { name: 'app-shared-only', from: ['app'], allow: ['shared'] },
      { name: 'app-to-app', from: ['app'], to: ['app'] },
    ],
  };

  const config = {
    jsPlugins: [ctx.pluginPath],
    rules: { 'zgeoff/import-zones': ['error', options] },
  };

  await mkdir(join(ctx.directory, 'src'));
  await mkdir(join(ctx.directory, 'scripts'));
  await writeFile(join(ctx.directory, '.oxlintrc.json'), JSON.stringify(config));

  await writeFile(
    join(ctx.directory, 'src', 'main.ts'),
    "import { seed } from '../scripts/seed';\n\nseed();\n",
  );

  await writeFile(join(ctx.directory, 'scripts', 'seed.ts'), 'export function seed(): void {}\n');

  const subprocess = Bun.spawn([ctx.oxlintBin, '-c', '.oxlintrc.json', 'src/main.ts'], {
    cwd: ctx.directory,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
  ]);

  const refusing = collectRefusingEdges(options, { from: 'src/main.ts', to: 'scripts/seed.ts' });

  expect(exitCode).toBe(1);
  expect(refusing.map((edge) => edge.name)).toStrictEqual(['app-no-scripts', 'app-shared-only']);
  expect(stdout).toInclude('app-no-scripts: app must not import scripts/seed.ts (scripts)');
  expect(stdout).toInclude('app-shared-only: app must not import scripts/seed.ts (scripts)');
  expect(stdout).not.toInclude('app-to-app');
});

test('it accepts every option that the types name in the rule', async () => {
  const ctx = await setupTest();

  const options: ImportZonesOptions = {
    zones: { app: ['src/**'], shared: ['src/shared/**'] },
    extensions: ['.ts'],
    conditions: ['bun'],
    workspaces: ['packages/*'],
    edges: [
      {
        name: 'app-shared-only',
        from: ['app'],
        ignore: ['**/*.test.ts'],
        reason: 'the app reaches shared code only',
        to: ['app'],
        allow: ['shared'],
        allowTypeOnly: ['**/types.ts'],
        allowWithin: 'src/*',
      },
    ],
    modules: [
      {
        name: 'no-http',
        modules: ['node:http'],
        from: ['app'],
        allow: ['shared'],
        allowTypeOnly: true,
      },
    ],
    globals: [{ name: 'no-fetch', globals: ['fetch'], from: ['app'], allow: ['shared'] }],
    unzoned: [{ name: 'zoned', from: ['app'], zones: ['shared'] }],
    unresolved: [{ name: 'unresolved', from: ['app'] }],
    selfImports: [{ name: 'self', from: ['app'] }],
  };

  const config = {
    jsPlugins: [ctx.pluginPath],
    rules: { 'zgeoff/import-zones': ['error', options] },
  };

  await mkdir(join(ctx.directory, 'src', 'shared'), { recursive: true });
  await writeFile(join(ctx.directory, '.oxlintrc.json'), JSON.stringify(config));
  await writeFile(join(ctx.directory, 'src', 'shared', 'clock.ts'), 'export const tick = 1;\n');

  const subprocess = Bun.spawn([ctx.oxlintBin, '-c', '.oxlintrc.json', 'src/shared/clock.ts'], {
    cwd: ctx.directory,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);

  expect({ exitCode, stderr }).toStrictEqual({ exitCode: 0, stderr: '' });
});
