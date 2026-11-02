import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { buildChexPackRun } from './build-chex-pack-run.ts';
import type { E2EPackDependencies } from './e2e-pack-dependencies.ts';
import { chexE2EBinVariable, chexE2EPackageVariable } from './get-chex-e2e-pack.ts';
import { readPackedBin } from './read-packed-bin.ts';
import { removeExitedRigPacks } from './remove-exited-rig-packs.ts';

// chex ships its source, so the tarball, shaped by the files list and the rewritten dependency
// ranges, is the product a user installs, and the journeys run its bin. chex has no build, so
// each run packs its own tarball.
export async function createChexPack(
  context: LaneContext,
  dependencies: E2EPackDependencies,
): Promise<LaneStart> {
  const run = buildChexPackRun(context.repoRoot, dependencies.hostName, context.runID);

  await removeExitedRigPacks(run.runsDir, dependencies);

  await dependencies.files.createDirs(run.runDir);

  await dependencies.runCommand(
    [process.execPath, 'pm', 'pack', '--filename', run.tarballPath, '--quiet'],
    join(context.repoRoot, 'packages', 'chex'),
  );

  await dependencies.runCommand(['tar', '-xzf', run.tarballPath, '-C', run.runDir], run.runDir);

  const binPath = await readPackedBin(run.packageDir, 'chex', dependencies.packedFiles);

  return {
    environment: { [chexE2EPackageVariable]: run.packageDir, [chexE2EBinVariable]: binPath },
  };
}
