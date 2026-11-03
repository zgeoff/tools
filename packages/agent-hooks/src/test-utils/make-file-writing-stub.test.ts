import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import { makeFileWritingStub } from './make-file-writing-stub.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('file-writing-stub-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes the file into the folder it gets, and records the call', async () => {
  const ctx = await setupTest();

  const writeTemplate = makeFileWritingStub('bundle.js', 'built\n');

  await writeTemplate(ctx.directory);

  const bundle = await readFile(join(ctx.directory, 'bundle.js'), 'utf8');

  expect(bundle).toBe('built\n');
  expect(writeTemplate).toHaveBeenCalledExactlyOnceWith(ctx.directory);
});
