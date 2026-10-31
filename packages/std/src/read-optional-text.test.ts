import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOptionalText } from './read-optional-text.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'read-optional-text-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text of a file that exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'notes.md'), '# Notes\n');

  const text = await readOptionalText(join(ctx.directory, 'notes.md'));

  expect(text).toBe('# Notes\n');
});

test('it reads no text from a file that does not exist', async () => {
  const ctx = await setupTest();
  const text = await readOptionalText(join(ctx.directory, 'notes.md'));

  expect(text).toBeUndefined();
});

test('it reads no text from a path whose folder is a file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'notes.md'), '# Notes\n');

  const text = await readOptionalText(join(ctx.directory, 'notes.md', 'draft.md'));

  expect(text).toBeUndefined();
});

test('it throws for a path that names a folder', () => {
  expect(readOptionalText(tmpdir())).rejects.toThrow('EISDIR');
});
