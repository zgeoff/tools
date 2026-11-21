import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerTestCleanup } from '../core/register-test-cleanup.ts';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';
import { removeFolder } from './remove-folder.ts';
import type { CleanupMode, TempDir } from './types.ts';

// Makes a folder under the OS temp folder. Its name holds this process's ID and PID namespace, so
// a sweep of stale folders can tell a crashed run's folder from a live run's. After the test, the
// kit removes it, unless cleanup is 'manual'. Call it inside a test or a beforeEach.
export function createTempDir(
  name: string,
  options: { readonly cleanup?: CleanupMode } = {},
): TempDir {
  const path = mkdtempSync(join(tmpdir(), readRunFolderPrefix(name)));

  const removePath = (): void => {
    removeFolder(path);
  };

  return {
    path,
    remove: options.cleanup === 'manual' ? removePath : registerTestCleanup(removePath),
  };
}
