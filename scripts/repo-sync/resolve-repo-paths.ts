import { basename, dirname, join, relative } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';

// git records a file under the real path of its folder, so a target written through a linked
// folder, such as a .claude/skills link to .agents/skills, shows in the branch's diff at that path.
export async function resolveRepoPaths(
  fileSystem: Pick<FileSystem, 'resolveRealPath'>,
  cwd: string,
  paths: readonly string[],
): Promise<string[]> {
  const root = await fileSystem.resolveRealPath(cwd);

  return Promise.all(
    paths.map(async (path) => {
      const folder = await fileSystem.resolveRealPath(join(cwd, dirname(path)));

      return relative(root, join(folder, basename(path)));
    }),
  );
}
