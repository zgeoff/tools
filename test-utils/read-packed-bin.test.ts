import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initFiles } from '../packages/rig/src/init-files.ts';
import { readPackedBin } from './read-packed-bin.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-packed-bin-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it returns the absolute path of the bin the package declares', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'package.json': JSON.stringify({ bin: { kettle: './src/cli.ts' } }),
    'src/cli.ts': 'export {};\n',
  });

  const binPath = await readPackedBin(ctx.directory, 'kettle', initFiles);

  expect(binPath).toBe(join(ctx.directory, 'src/cli.ts'));
});

test('it throws for a package that declares no bin of the name', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'package.json': JSON.stringify({ bin: { lid: './src/cli.ts' } }),
  });

  const binPath = readPackedBin(ctx.directory, 'kettle', initFiles);

  expect(binPath).rejects.toThrow(
    `the packed ${join(ctx.directory, 'package.json')} declares no bin named kettle`,
  );
});

test('it throws for a bin whose file the tarball lacks', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.directory, {
    'package.json': JSON.stringify({ bin: { kettle: './src/cli.ts' } }),
  });

  const binPath = readPackedBin(ctx.directory, 'kettle', initFiles);

  expect(binPath).rejects.toThrow(
    'the packed kettle declares the bin ./src/cli.ts, which its tarball lacks',
  );
});
