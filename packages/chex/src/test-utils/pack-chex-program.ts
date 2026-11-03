import { lstat, mkdir, readdir, rename, rm, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

export interface PackChexOptions {
  // The package folder to pack, which `rig e2e` runs the build from.
  readonly packageDir: string;

  // A name no other build uses, for this build's own folder.
  readonly buildID: string;

  readonly now: () => number;
}

// The folder that rig.config.ts names, under the package, where the packed chex extracts.
export const chexPackDir = 'node_modules/.cache/chex-e2e';

// A pack older than this belongs to no run that is still going.
const staleAfterMs = 60 * 60 * 1000;

// Each build extracts into its own folder and one rename moves the `package` link, so a build
// never deletes the files of a run that is still going. The pack sits in chex's node_modules,
// where the isolated linker puts chex's dependencies.
export async function runChexPack(options: PackChexOptions): Promise<string> {
  const packRoot = join(options.packageDir, chexPackDir);
  const buildDir = join(packRoot, 'builds', options.buildID);

  await mkdir(buildDir, { recursive: true });

  await $`bun pm pack --filename ${join(buildDir, 'chex.tgz')} --quiet`.cwd(options.packageDir);

  await $`tar -xzf ${join(buildDir, 'chex.tgz')} -C ${buildDir}`;

  const pendingLink = join(packRoot, `package.${options.buildID}`);
  const linkPath = join(packRoot, 'package');

  await removeUnlinkedPackage(linkPath);
  await symlink(join('builds', options.buildID, 'package'), pendingLink);
  await rename(pendingLink, linkPath);
  await removeStaleBuilds(join(packRoot, 'builds'), options);

  return linkPath;
}

// An older build extracted the pack straight into `package`, and a rename can't replace a folder.
async function removeUnlinkedPackage(linkPath: string): Promise<void> {
  const info = await lstat(linkPath).catch(() => null);

  if (info !== null && !info.isSymbolicLink()) {
    await rm(linkPath, { recursive: true, force: true });
  }
}

async function removeStaleBuilds(buildsDir: string, options: PackChexOptions): Promise<void> {
  const builds = await readdir(buildsDir);

  for (const build of builds) {
    const path = join(buildsDir, build);

    const info = await stat(path);

    if (build !== options.buildID && options.now() - info.mtimeMs > staleAfterMs) {
      await rm(path, { recursive: true, force: true });
    }
  }
}

if (import.meta.main) {
  await runChexPack({
    packageDir: process.cwd(),
    buildID: `${Date.now()}-${process.pid}`,
    now: () => Date.now(),
  });
}
