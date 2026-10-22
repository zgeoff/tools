import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileHashes } from './read-file-hashes.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-hashes-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives files with the same content the same hash, and a missing path null', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.test.ts'), "test('it adds', () => {});\n");
  await writeFile(join(ctx.directory, 'b.test.ts'), "test('it adds', () => {});\n");
  await writeFile(join(ctx.directory, 'c.test.ts'), "test('it subtracts', () => {});\n");

  const hashes = await readFileHashes(ctx.directory, [
    'a.test.ts',
    'b.test.ts',
    'c.test.ts',
    'gone.test.ts',
  ]);

  expect(hashes).toStrictEqual({
    'a.test.ts': expect.any(String),
    'b.test.ts': expect.any(String),
    'c.test.ts': expect.any(String),
    'gone.test.ts': null,
  });

  expect(hashes['b.test.ts']).toBe(hashes['a.test.ts']);
  expect(hashes['c.test.ts']).not.toBe(hashes['a.test.ts']);
});
