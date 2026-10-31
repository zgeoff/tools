import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { laneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { buildStubProcessProbe } from './build-stub-process-probe.ts';
import { removeExitedRigPacks } from './remove-exited-rig-packs.ts';

async function setupTest() {
  const runsDir = await mkdtemp(join(tmpdir(), 'rig-e2e-runs-'));

  onTestFinished(() => rm(runsDir, { recursive: true, force: true }));

  return { runsDir };
}

test("it removes an exited run's pack, and never removes a live run's pack", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.runsDir, '4417'));
  await writeFile(join(ctx.runsDir, '4417', 'rig.tgz'), 'the pack of an exited run');
  await mkdir(join(ctx.runsDir, '5120'));
  await writeFile(join(ctx.runsDir, '5120', 'rig.tgz'), 'the pack of a live run');

  await removeExitedRigPacks(ctx.runsDir, {
    files: laneFiles,
    probeProcess: buildStubProcessProbe([5120]),
  });

  const entries = await readdir(ctx.runsDir);

  expect(entries).toStrictEqual(['5120']);
});
