import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// Returns a probe for a file under the repo root. A path whose folder below the root is a symbolic
// link reads as absent: git tracks no file beyond a link, so a deleted path there is no restored copy.
export function makeFileProbe(root: string): (path: string) => boolean {
  return (path) => {
    const folders = relative(root, dirname(path))
      .split(sep)
      .filter((part) => part !== '');

    const linked = folders.some(
      (_, index) =>
        lstatSync(join(root, ...folders.slice(0, index + 1)), {
          throwIfNoEntry: false,
        })?.isSymbolicLink() === true,
    );

    return !linked && existsSync(path);
  };
}
