import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileContent } from './read-file-content.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-content-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the bytes of a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'a.test.ts'), "test('it adds', () => {});\n");

  const content = await readFileContent(join(ctx.directory, 'a.test.ts'));

  expect(new TextDecoder().decode(content ?? undefined)).toBe("test('it adds', () => {});\n");
});

test('it reads null for a path that holds no file', async () => {
  const ctx = await setupTest();
  const content = await readFileContent(join(ctx.directory, 'gone.test.ts'));

  expect(content).toBeNull();
});

test('it reads null for a folder', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'vendor'));

  const content = await readFileContent(join(ctx.directory, 'vendor'));

  expect(content).toBeNull();
});
