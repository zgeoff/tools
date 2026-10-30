import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createListingStubKit } from './create-listing-stub-kit.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'listing-stub-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it lists the folder, sorted, at each call, records the arguments, and exits 0', async () => {
  const ctx = await setupTest();

  const kit = createListingStubKit(ctx.directory);

  await writeFile(join(ctx.directory, 'pending-tests'), '');
  await writeFile(join(ctx.directory, 'pending-build'), '');

  const firstExitCode = await kit.stub(['bun', 'run', 'build']);

  await rm(join(ctx.directory, 'pending-build'));

  const secondExitCode = await kit.stub(['bun', 'test']);

  expect(firstExitCode).toBe(0);
  expect(secondExitCode).toBe(0);
  expect(kit.listings).toStrictEqual([['pending-build', 'pending-tests'], ['pending-tests']]);
  expect(kit.stub.mock.calls).toStrictEqual([[['bun', 'run', 'build']], [['bun', 'test']]]);
});
