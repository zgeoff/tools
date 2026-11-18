import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initFiles } from './init-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-init-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads a JSON file as its value', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'package.json');

  await writeFile(path, '{"name":"kettle","private":true}');

  const manifest = await initFiles.readJSON(path);

  expect(manifest).toStrictEqual({ name: 'kettle', private: true });
});

test('it fails to read a file that holds no JSON', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'package.json');

  await writeFile(path, 'name = kettle');

  expect(initFiles.readJSON(path)).rejects.toBeInstanceOf(SyntaxError);
});

test('it writes the text to the file', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'rig.config.ts');

  await initFiles.writeText(path, 'export default {};\n');

  const text = await readFile(path, 'utf8');

  expect(text).toBe('export default {};\n');
});

test('it finds a file that exists', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'rig.config.ts');

  await writeFile(path, '');

  const found = await initFiles.probeFile(path);

  expect(found).toBeTrue();
});

test('it finds no file at a path where nothing exists', async () => {
  const ctx = await setupTest();
  const found = await initFiles.probeFile(join(ctx.directory, 'missing.ts'));

  expect(found).toBeFalse();
});
