import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTextFile } from './write-text-file.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-text-file-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the text to a file in a folder it creates', async () => {
  const ctx = await setupTest();

  const path = join(ctx.directory, 'kettle/notes.md');

  await writeTextFile(path, '# Notes\n');

  const text = await readFile(path, 'utf8');

  expect(text).toBe('# Notes\n');
});
