import { expect, test } from 'bun:test';
import { parsePackageBin } from './parse-package-bin.ts';

test('it reads the path of the bin that the manifest declares', () => {
  const binPath = parsePackageBin({ name: 'kettle', bin: { kettle: './src/boil.ts' } }, 'kettle');

  expect(binPath).toBe('./src/boil.ts');
});

test('it returns null for a bin that the manifest does not declare', () => {
  const binPath = parsePackageBin({ name: 'kettle', bin: { steam: './src/steam.ts' } }, 'kettle');

  expect(binPath).toBeNull();
});

test('it returns null for a manifest with no bin map', () => {
  const binPath = parsePackageBin({ name: 'kettle', bin: './src/boil.ts' }, 'kettle');

  expect(binPath).toBeNull();
});
