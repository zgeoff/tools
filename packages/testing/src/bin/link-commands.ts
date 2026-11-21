import { rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

// Symlinks the real command of each name into the folder, for a test that sets PATH to the folder
// alone. Throws on a name that PATH lacks.
export function linkCommands(directory: string, names: readonly string[]): void {
  for (const name of names) {
    const target = Bun.which(name, { PATH: process.env['PATH'] ?? '' });

    if (target === null) {
      throw new Error(`${name} is not on PATH, so it cannot be linked into ${directory}`);
    }

    rmSync(join(directory, name), { force: true });
    symlinkSync(target, join(directory, name));
  }
}
