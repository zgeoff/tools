import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTreeFiles } from '../../../test-utils/write-tree-files.ts';
import { defineRig } from './define-rig.ts';
import { readRigConfig } from './read-rig-config.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-config-test-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  return { repoRoot, indexPath: join(import.meta.dir, 'index.ts') };
}

test('it reads the built-in lanes from a repo with no rig.config.ts', async () => {
  const ctx = await setupTest();
  const config = await readRigConfig(ctx.repoRoot);

  expect(config).toStrictEqual(defineRig({}));
});

test('it reads the lanes that a rig.config.ts declares', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'rig.config.ts': `import { defineRig } from ${JSON.stringify(ctx.indexPath)};\n\nexport default defineRig({ lanes: { kiln: { limit: '15s' } } });\n`,
  });

  const config = await readRigConfig(ctx.repoRoot);

  expect(config).toStrictEqual(defineRig({ lanes: { kiln: { limit: '15s' } } }));
});

test("it refuses a rig.config.ts whose default export is no rig config, with the parser's reason", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, { 'rig.config.ts': 'export default { lanes: 3 };\n' });

  const failure = await readRigConfig(ctx.repoRoot).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(Error);

  expect(failure).toHaveProperty(
    'message',
    `${join(ctx.repoRoot, 'rig.config.ts')} must default-export the result of defineRig: its lanes are no list`,
  );
});
