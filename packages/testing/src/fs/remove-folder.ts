import { existsSync, rmSync } from 'node:fs';

const maxRemovals = 10;

export interface FolderIO {
  readonly exists: (path: string) => boolean;
  readonly removeTree: (path: string) => void;
}

const hostIO: FolderIO = {
  exists: existsSync,
  removeTree: (path) => {
    rmSync(path, { recursive: true, force: true });
  },
};

// Bun's recursive rm can return without an error and leave the folder when another process deletes
// an entry during its walk, so the removal runs again while the folder is still there.
export function removeFolder(path: string, io: FolderIO = hostIO): void {
  for (let removals = 0; removals < maxRemovals; removals += 1) {
    io.removeTree(path);

    if (!io.exists(path)) {
      return;
    }
  }

  throw new Error(`${path} was still there after ${maxRemovals} removals`);
}
