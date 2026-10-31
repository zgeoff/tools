import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';

// Links the commitlint CLI and the shared config from the tools checkout into a repo, as an install
// of @zgeoff/commitlint-config leaves them, so the commits check runs commitlint for real.
export async function linkCommitlint(root: string, toolsRoot: string): Promise<void> {
  await mkdir(join(root, 'node_modules/.bin'), { recursive: true });
  await mkdir(join(root, 'node_modules/@zgeoff'), { recursive: true });
  await mkdir(join(root, 'node_modules/@commitlint'), { recursive: true });

  await Promise.all(
    [
      'node_modules/.bin/commitlint',
      'node_modules/@zgeoff/commitlint-config',
      'node_modules/@commitlint/cli',
    ].map((path) => symlink(join(toolsRoot, path), join(root, path))),
  );
}
