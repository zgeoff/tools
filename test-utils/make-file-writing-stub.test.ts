import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeFileWritingStub } from './make-file-writing-stub.ts';

test('it writes the file into the folder it gets, and records the call', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'file-writing-stub-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const writeTemplate = makeFileWritingStub('bundle.js', 'built\n');

  await writeTemplate(directory);

  const bundle = await readFile(join(directory, 'bundle.js'), 'utf8');

  expect(bundle).toBe('built\n');
  expect(writeTemplate).toHaveBeenCalledExactlyOnceWith(directory);
});
