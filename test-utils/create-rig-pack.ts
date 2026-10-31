import { mkdir } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { $ } from 'bun';
import { buildBrowserRun } from '../packages/rig/src/browser/build-browser-run.ts';
import { laneFiles } from '../packages/rig/src/browser/lane-files.ts';
import { pickChromeDirs } from '../packages/rig/src/browser/pick-chrome-dirs.ts';
import { buildRigPackRun } from './build-rig-pack-run.ts';
import { createRigTarball } from './create-rig-tarball.ts';
import { fileLocks } from './file-locks.ts';
import { rigE2EBinVariable } from './get-rig-e2e-bin.ts';
import { parsePackageBin } from './parse-package-bin.ts';
import { probeProcess } from './probe-process.ts';
import { removeExitedRigPacks } from './remove-exited-rig-packs.ts';
import { runBrowserWarmUp } from './run-browser-warm-up.ts';
import { systemClock } from './system-clock.ts';

// rig's bin runs from its source, so the tarball, shaped by the files list and the rewritten
// dependency ranges, is the product a user installs, and the journeys run its bin.
export default async function createRigPack(context: LaneContext): Promise<LaneStart> {
  const sourceDir = join(context.repoRoot, 'packages', 'rig');
  const run = buildRigPackRun(context.repoRoot, hostname(), context.runID);

  await removeExitedRigPacks(run.runsDir, { files: laneFiles, probeProcess });
  await mkdir(run.runDir, { recursive: true });

  await createRigTarball(run.lockPath, {
    locks: fileLocks,
    clock: systemClock,
    runBuild: async () => {
      await $`${process.execPath} run build`.cwd(sourceDir);
    },
    runPack: async () => {
      await $`${process.execPath} pm pack --filename ${run.tarballPath} --quiet`
        .cwd(sourceDir)
        .quiet();
    },
  });

  await $`tar -xzf ${run.tarballPath} -C ${run.runDir}`;

  const binPath = await readPackedBin(run.packageDir);

  const warmUpRoot = join(run.runDir, 'warm-up');

  // rig removes its run's Chrome folder and keeps the repo's folder above it, which can sit in the
  // /tmp that every user shares.
  const chromeRunsDir = pickChromeDirs(
    tmpdir(),
    userInfo().uid,
    buildBrowserRun(warmUpRoot, hostname(), '0'),
  ).runsDir;

  await runBrowserWarmUp(warmUpRoot, chromeRunsDir, {
    runRigBrowser: (repoRoot) => $`${binPath} browser`.cwd(repoRoot).quiet(),
  });

  return { environment: { [rigE2EBinVariable]: binPath } };
}

async function readPackedBin(packageDir: string): Promise<string> {
  const manifestPath = join(packageDir, 'package.json');

  const manifest: unknown = await Bun.file(manifestPath).json();

  const binPath = parsePackageBin(manifest, 'rig');

  if (binPath === null) {
    throw new Error(`the packed ${manifestPath} declares no bin named rig`);
  }

  const absolutePath = join(packageDir, binPath);

  if (!(await Bun.file(absolutePath).exists())) {
    throw new Error(`the packed rig declares the bin ${binPath}, which its tarball lacks`);
  }

  return absolutePath;
}
