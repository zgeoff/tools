import { expect, test } from 'bun:test';
import { readPackedBin } from './read-packed-bin.ts';

test('it returns the absolute path of the bin the package declares', async () => {
  const binPath = await readPackedBin('/packs/kettle', 'kettle', {
    readJSON: () => Promise.resolve({ bin: { kettle: './src/cli.ts' } }),
    probeFile: (path) => Promise.resolve(path === '/packs/kettle/src/cli.ts'),
  });

  expect(binPath).toBe('/packs/kettle/src/cli.ts');
});

test('it throws for a package that declares no bin of the name', () => {
  const binPath = readPackedBin('/packs/kettle', 'kettle', {
    readJSON: () => Promise.resolve({ bin: { lid: './src/cli.ts' } }),
    probeFile: () => Promise.resolve(true),
  });

  expect(binPath).rejects.toThrow(
    'the packed /packs/kettle/package.json declares no bin named kettle',
  );
});

test('it throws for a bin whose file the tarball lacks', () => {
  const binPath = readPackedBin('/packs/kettle', 'kettle', {
    readJSON: () => Promise.resolve({ bin: { kettle: './src/cli.ts' } }),
    probeFile: () => Promise.resolve(false),
  });

  expect(binPath).rejects.toThrow(
    'the packed kettle declares the bin ./src/cli.ts, which its tarball lacks',
  );
});
