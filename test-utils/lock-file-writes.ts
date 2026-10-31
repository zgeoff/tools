import { chmod } from 'node:fs/promises';
import { $ } from 'bun';

// Root writes past a file's mode bits, so as root the file takes ext4's immutable flag instead.
// Returns the call that makes the file writable again.
export async function lockFileWrites(path: string): Promise<() => Promise<void>> {
  if (process.getuid?.() === 0) {
    await $`chattr +i ${path}`.quiet();

    return async () => {
      await $`chattr -i ${path}`.quiet();
    };
  }

  await chmod(path, 0o444);

  return () => chmod(path, 0o644);
}
