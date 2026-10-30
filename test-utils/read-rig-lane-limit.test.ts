import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRigConfigSource } from '../packages/oxlint-config/test-utils/build-rig-config-source.ts';
import { readRigLaneLimit } from './read-rig-lane-limit.ts';
import { writeTreeFiles } from './write-tree-files.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-lane-limit-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  return { repoRoot };
}

test('it reads the limit of a lane that rig.config.ts declares', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'rig.config.ts': buildRigConfigSource("{ lanes: { kiln: { limit: '15s' } } }"),
  });

  const limitMs = await readRigLaneLimit(ctx.repoRoot, 'kiln');

  expect(limitMs).toBe(15_000);
});

test('it fails for a lane the config does not hold', async () => {
  const ctx = await setupTest();

  await expect(readRigLaneLimit(ctx.repoRoot, 'kiln')).rejects.toThrow('has no lane kiln');
});
