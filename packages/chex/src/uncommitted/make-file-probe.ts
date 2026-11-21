import { lstatSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// Returns a probe for a file under the repo root. A path reads as absent when a folder below the root
// is a link (git tracks no file beyond a link) or when it is a folder itself (a deleted path comes
// back only as a file or a link). Neither is a restored copy.
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

    if (linked) {
      return false;
    }

    const entry = lstatSync(path, { throwIfNoEntry: false });

    return entry !== undefined && !entry.isDirectory();
  };
}
