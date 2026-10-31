import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { buildBrowserRun } from '../packages/rig/src/browser/build-browser-run.ts';
import { pickChromeDirs } from '../packages/rig/src/browser/pick-chrome-dirs.ts';
import { buildRigPackRun } from './build-rig-pack-run.ts';
import { createRigTarball } from './create-rig-tarball.ts';
import type { E2EPackDependencies } from './e2e-pack-dependencies.ts';
import { fileLocks } from './file-locks.ts';
import { rigE2EBinVariable } from './get-rig-e2e-bin.ts';
import { readPackedBin } from './read-packed-bin.ts';
import { removeExitedRigPacks } from './remove-exited-rig-packs.ts';
import { runBrowserWarmUp } from './run-browser-warm-up.ts';
import { systemClock } from './system-clock.ts';

// rig's bin runs from its source, so the tarball, shaped by the files list and the rewritten
// dependency ranges, is the product a user installs, and the journeys run its bin.
export default async function createRigPack(
  context: LaneContext,
  dependencies: E2EPackDependencies,
): Promise<LaneStart> {
  const sourceDir = join(context.repoRoot, 'packages', 'rig');
  const run = buildRigPackRun(context.repoRoot, dependencies.hostName, context.runID);

  await removeExitedRigPacks(run.runsDir, dependencies);

  await dependencies.files.createDirs(run.runDir);

  await createRigTarball(run.lockPath, {
    locks: fileLocks,
    clock: systemClock,
    runBuild: () => dependencies.runCommand([process.execPath, 'run', 'build'], sourceDir),
    runPack: () =>
      dependencies.runCommand(
        [process.execPath, 'pm', 'pack', '--filename', run.tarballPath, '--quiet'],
        sourceDir,
      ),
  });

  await dependencies.runCommand(['tar', '-xzf', run.tarballPath, '-C', run.runDir], run.runDir);

  const binPath = await readPackedBin(run.packageDir, 'rig', dependencies.packedFiles);

  const warmUpRoot = join(run.runDir, 'warm-up');

  // rig removes its run's Chrome folder and keeps the repo's folder above it, which can sit in the
  // /tmp that every user shares.
  const chromeRunsDir = pickChromeDirs(
    dependencies.tempDir,
    dependencies.userID,
    buildBrowserRun(warmUpRoot, dependencies.hostName, '0'),
  ).runsDir;

  await runBrowserWarmUp(warmUpRoot, chromeRunsDir, {
    runRigBrowser: (repoRoot) => dependencies.runCommand([binPath, 'browser'], repoRoot),
  });

  return { environment: { [rigE2EBinVariable]: binPath } };
}
