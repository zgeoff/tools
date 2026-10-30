import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import type { LaneContext, LaneStart } from '@zgeoff/rig';
import { $ } from 'bun';
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

  for (const attempt of ['1', '2']) {
    const startedMs = Date.now();
    const probeCode = `const view = new Bun.WebView({ backend: { type: 'chrome', url: false, argv: ['--no-sandbox', '--disable-dev-shm-usage'] }, dataStore: { directory: ${JSON.stringify(join(run.runDir, `warm-${attempt}`))} } }); await view.navigate('about:blank'); view.close();`;

    await $`${process.execPath} -e ${probeCode}`;

    console.error(`WARM chrome launch ${attempt}: ${Date.now() - startedMs} ms`);
  }

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
