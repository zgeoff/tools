import { mkdir, writeFile } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { $ } from 'bun';
import { buildBrowserRun } from '../packages/rig/src/browser/build-browser-run.ts';
import { pickChromeDirs } from '../packages/rig/src/browser/pick-chrome-dirs.ts';
import { readDirNames } from '../packages/rig/src/browser/read-dir-names.ts';
import { removeExitedRunDirs } from '../packages/rig/src/browser/remove-exited-run-dirs.ts';
import { removePath } from '../packages/rig/src/browser/remove-path.ts';
import { buildRigPackRun } from './build-rig-pack-run.ts';
import { rigE2EBinVariable } from './get-rig-e2e-bin.ts';
import { parsePackageBin } from './parse-package-bin.ts';
import { probeProcess } from './probe-process.ts';

// rig's bin runs from its source, so the tarball, shaped by the files list and the rewritten
// dependency ranges, is the product a user installs, and the journeys run its bin.
export default async function createRigPack(context: LaneContext): Promise<LaneStart> {
  const sourceDir = join(context.repoRoot, 'packages', 'rig');
  const run = buildRigPackRun(context.repoRoot, hostname(), context.runID);

  await removeExitedRunDirs(run.runsDir, { readDirNames, removePath }, (runID) =>
    Promise.resolve(probeProcess(Number(runID))),
  );

  await mkdir(run.runDir, { recursive: true });

  await $`${process.execPath} run build`.cwd(sourceDir);
  await $`${process.execPath} pm pack --filename ${run.tarballPath} --quiet`.cwd(sourceDir).quiet();

  await $`tar -xzf ${run.tarballPath} -C ${run.runDir}`;

  const binPath = await readPackedBin(run.packageDir);

  await runBrowserWarmUp(binPath, join(run.runDir, 'warm-up'));

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

// A fresh CI runner's first Chrome start took 0.9 to 13 s and its second 0.3 s, so a journey
// that started the runner's first Chrome ran past the e2e limit.
async function runBrowserWarmUp(binPath: string, repoRoot: string): Promise<void> {
  // rig removes its run's Chrome folder and keeps the repo's folder above it, which can sit in the
  // /tmp that every user shares.
  const chromeRunsDir = pickChromeDirs(
    tmpdir(),
    userInfo().uid,
    buildBrowserRun(repoRoot, hostname(), '0'),
  ).runsDir;

  await mkdir(repoRoot, { recursive: true });
  await writeFile(join(repoRoot, 'package.json'), '{}\n');

  await writeFile(
    join(repoRoot, 'warm-up.browser.test.ts'),
    "import { test } from 'bun:test';\n\ntest('it starts Chrome', () => {});\n",
  );

  try {
    await $`${binPath} browser`.cwd(repoRoot).quiet();
  } finally {
    await removePath(chromeRunsDir);
  }
}
