import { lstat, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

export interface PackChexOptions {
  // The package folder to pack, which `rig e2e` runs the build from.
  readonly packageDir: string;

  // A name no other build uses, for this build's own folder.
  readonly buildID: string;

  // The rig process that runs the tests against this build.
  readonly ownerPID: number;

  readonly isRunning: (pid: number) => boolean;
}

// The folder that rig.config.ts names, under the package, where the packed chex extracts.
export const chexPackDir = 'node_modules/.cache/chex-e2e';

// Each build extracts into its own folder and one rename moves the `package` link, so a build
// never deletes the files of a run that is still going. The pack sits in chex's node_modules,
// where the isolated linker puts chex's dependencies.
export async function runChexPack(options: PackChexOptions): Promise<string> {
  const packRoot = join(options.packageDir, chexPackDir);
  const buildDir = join(packRoot, 'builds', options.buildID);

  await mkdir(buildDir, { recursive: true });
  await writeFile(join(buildDir, 'owner'), String(options.ownerPID));

  await $`bun pm pack --filename ${join(buildDir, 'chex.tgz')} --quiet`
    .cwd(options.packageDir)
    .quiet();

  await $`tar -xzf ${join(buildDir, 'chex.tgz')} -C ${buildDir}`;

  const linkPath = join(packRoot, 'package');
  const pendingLink = join(packRoot, `package.${options.buildID}`);

  await removeUnlinkedPackage(linkPath);
  await symlink(join('builds', options.buildID, 'package'), pendingLink);
  await rename(pendingLink, linkPath);
  await removeOrphanBuilds(join(packRoot, 'builds'), options);

  return linkPath;
}

// An older build extracted the pack straight into `package`, and a rename can't replace a folder.
async function removeUnlinkedPackage(linkPath: string): Promise<void> {
  const info = await lstat(linkPath).catch(() => null);

  if (info !== null && !info.isSymbolicLink()) {
    await rm(linkPath, { recursive: true, force: true });
  }
}

// A build whose rig process has stopped serves no run, so its folder goes.
async function removeOrphanBuilds(buildsDir: string, options: PackChexOptions): Promise<void> {
  const builds = await readdir(buildsDir);

  for (const build of builds) {
    const ownerText = await readFile(join(buildsDir, build, 'owner'), 'utf8').catch(() => '');

    const ownerPID = Number(ownerText);
    const isOrphan = !Number.isInteger(ownerPID) || ownerPID <= 0 || !options.isRunning(ownerPID);

    if (build !== options.buildID && isOrphan) {
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
    buildID: `${ownerPID}-${Date.now()}`,
    ownerPID,
    isRunning: isProcessRunning,
  });
}
