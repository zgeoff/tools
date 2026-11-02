import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeStubToolsURLReader } from './make-stub-tools-url-reader.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const checkout = await mkdtemp(join(tmpdir(), 'make-stub-tools-url-reader-'));

  onTestFinished(() => rm(checkout, { recursive: true, force: true }));

  return { checkout };
}

test('it serves the file at the path under the tools URL from the checkout', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.checkout, { 'scripts/kettle/boil.ts': '// boil\n' });

  const readURL = makeStubToolsURLReader('https://raw.example/acme/tools/cafe12', ctx.checkout);

  const outcome = await readURL('https://raw.example/acme/tools/cafe12/scripts/kettle/boil.ts');

  expect(outcome).toStrictEqual({ kind: 'read', text: '// boil\n' });
});
