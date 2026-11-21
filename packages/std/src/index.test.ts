import { expect, test } from 'bun:test';
import { join } from 'node:path';
import manifest from '../package.json' with { type: 'json' };

function setupTest() {
  const packageFolder = join(import.meta.dir, '..');

  const targets = Object.fromEntries(
    Object.entries(manifest.exports).map(([subpath, target]) => [subpath, target.default]),
  );

  return {
    publicHelpers: [
      'isOneOf',
      'isRecord',
      'machineTypes',
      'mergeDeep',
      'pick',
      'readOptionalText',
      'systemClock',
      'toExactOptional',
      'toReadonlyDeep',
      'toTagged',
      'writeStdout',
    ],
    targets,
    importTarget: (subpath: string): Promise<Record<string, unknown>> =>
      import(join(packageFolder, targets[subpath] ?? '')),
  };
}

test('it lists exactly the root and with-file-lock subpaths in the export map', () => {
  const context = setupTest();

  expect(Object.keys(context.targets).toSorted()).toStrictEqual(['.', './with-file-lock']);
});

test('it resolves the root export to the public helpers', async () => {
  const context = setupTest();

  const resolved = await context.importTarget('.');

  expect(Object.keys(resolved).toSorted()).toStrictEqual(context.publicHelpers.toSorted());
});

test('it resolves the with-file-lock export to withFileLock', async () => {
  const context = setupTest();

  const resolved = await context.importTarget('./with-file-lock');

  expect(Object.keys(resolved)).toStrictEqual(['withFileLock']);
  expect(typeof resolved['withFileLock']).toBe('function');
});
