import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPackageBin } from './read-package-bin.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const packageDir = await mkdtemp(join(tmpdir(), 'package-bin-'));

  onTestFinished(() => rm(packageDir, { recursive: true, force: true }));

  return { packageDir };
}

test('it reads the path of the bin that the package declares, from the package folder', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({ name: 'kettle', bin: { kettle: './src/boil.ts' } }),
  });

  const binPath = await readPackageBin(ctx.packageDir, 'kettle');

  expect(binPath).toBe(join(ctx.packageDir, 'src', 'boil.ts'));
});

test('it fails for a bin that the package does not declare', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({ name: 'kettle', bin: { steam: './src/steam.ts' } }),
  });

  const failure = await readPackageBin(ctx.packageDir, 'kettle').catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    expect.stringContaining('declares no bin named kettle'),
  );
});

test('it fails for a package with no bin map', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.packageDir, {
    'package.json': JSON.stringify({ name: 'kettle', bin: './src/boil.ts' }),
  });

  const failure = await readPackageBin(ctx.packageDir, 'kettle').catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    expect.stringContaining('declares no bin named kettle'),
  );
});
