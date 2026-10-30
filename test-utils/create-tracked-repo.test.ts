import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTrackedFiles } from '../packages/rig/src/read-tracked-files.ts';
import { createTrackedRepo } from './create-tracked-repo.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'create-tracked-repo-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { repoRoot: join(directory, 'notes-app') };
}

test('it writes the files into a new git repo that tracks each of them', async () => {
  const ctx = await setupTest();

  await createTrackedRepo(ctx.repoRoot, {
    'package.json': '{}',
    'src/notes.browser.test.ts': "import { test } from 'bun:test';\n",
  });

  const tracked = await readTrackedFiles(ctx.repoRoot);
  const testSource = await readFile(join(ctx.repoRoot, 'src/notes.browser.test.ts'), 'utf8');

  expect(tracked).toIncludeSameMembers(['package.json', 'src/notes.browser.test.ts']);
  expect(testSource).toBe("import { test } from 'bun:test';\n");
});
