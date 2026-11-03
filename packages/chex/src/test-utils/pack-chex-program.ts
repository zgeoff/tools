import { lstat, mkdir, readdir, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

export interface PackChexOptions {
  // The package folder to pack, which `rig e2e` runs the build from.
  readonly packageDir: string;

  // The rig process that runs the tests against this build.
  readonly ownerPID: number;

  // Tells this build's folder apart from another build for the same rig process.
  readonly stamp: string;

  readonly isRunning: (pid: number) => boolean;
}

// The folder that rig.config.ts names, under the package, where the packed chex extracts.
export const chexPackDir = 'node_modules/.cache/chex-e2e';

// Each build extracts into its own folder and one rename moves the `package` link, so a build
// never deletes the files of a run that is still going. The pack sits in chex's node_modules,
// where the isolated linker puts chex's dependencies.
export async function runChexPack(options: PackChexOptions): Promise<string> {
  const packRoot = join(options.packageDir, chexPackDir);
  const buildID = `${options.ownerPID}-${options.stamp}`;
  const buildDir = join(packRoot, 'builds', buildID);

  await mkdir(buildDir, { recursive: true });

  await $`bun pm pack --filename ${join(buildDir, 'chex.tgz')} --quiet`
    .cwd(options.packageDir)
    .quiet();

  await $`tar -xzf ${join(buildDir, 'chex.tgz')} -C ${buildDir}`;

  const linkPath = join(packRoot, 'package');
  const pendingLink = join(packRoot, `package.${buildID}`);

  await removeUnlinkedPackage(linkPath);
  await symlink(join('builds', buildID, 'package'), pendingLink);
  await rename(pendingLink, linkPath);
  await removeOrphanBuilds(join(packRoot, 'builds'), buildID, options.isRunning);

  return linkPath;
}

// An older build extracted the pack straight into `package`, and a rename can't replace a folder.
async function removeUnlinkedPackage(linkPath: string): Promise<void> {
  const info = await lstat(linkPath).catch(() => null);

  if (info !== null && !info.isSymbolicLink()) {
    await rm(linkPath, { recursive: true, force: true });
  }
}

// A build whose rig process has stopped serves no run, so its folder goes. The folder name starts
// with that process id, so a folder names its owner from the moment it exists.
async function removeOrphanBuilds(
  buildsDir: string,
  buildID: string,
  isRunning: (pid: number) => boolean,
): Promise<void> {
  const builds = await readdir(buildsDir);

  for (const build of builds) {
    const ownerPID = Number(build.split('-')[0]);
    const isOrphan = !Number.isInteger(ownerPID) || ownerPID <= 0 || !isRunning(ownerPID);

    if (build !== buildID && isOrphan) {
      await rm(join(buildsDir, build), { recursive: true, force: true });
    }
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}

if (import.meta.main) {
  const ownerPID = Number(process.argv[2]);

  if (!Number.isInteger(ownerPID) || ownerPID <= 0) {
    throw new Error(`pack-chex-program: pass the rig process id, not "${process.argv[2]}"`);
  }

  await runChexPack({
    packageDir: process.cwd(),
    ownerPID,
    stamp: String(Date.now()),
    isRunning: isProcessRunning,
  });
}
