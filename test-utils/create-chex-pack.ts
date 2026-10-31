import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { $ } from 'bun';
import { laneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { buildChexPackRun } from './build-chex-pack-run.ts';
import { chexE2EBinVariable, chexE2EPackageVariable } from './get-chex-e2e-pack.ts';
import { probeProcess } from './probe-process.ts';
import { readPackedBin } from './read-packed-bin.ts';
import { removeExitedRigPacks } from './remove-exited-rig-packs.ts';

// chex ships its source, so the tarball, shaped by the files list and the rewritten dependency
// ranges, is the product a user installs, and the journeys run its bin. chex has no build, so
// each run packs its own tarball.
export async function createChexPack(context: LaneContext): Promise<LaneStart> {
  const run = buildChexPackRun(context.repoRoot, hostname(), context.runID);

  await removeExitedRigPacks(run.runsDir, { files: laneFiles, probeProcess });
  await mkdir(run.runDir, { recursive: true });

  await $`${process.execPath} pm pack --filename ${run.tarballPath} --quiet`
    .cwd(join(context.repoRoot, 'packages', 'chex'))
    .quiet();

  await $`tar -xzf ${run.tarballPath} -C ${run.runDir}`;

  const binPath = await readPackedBin(run.packageDir, 'chex');

  return {
    environment: { [chexE2EPackageVariable]: run.packageDir, [chexE2EBinVariable]: binPath },
  };
}
