import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const hashLength = 16;

// A hash of the template's name and of the relative path and content of each file that the globs
// match under root. The hash stays the same while those stay the same.
export async function readInputsHash(
  name: string,
  root: string,
  inputs: readonly string[],
): Promise<string> {
  const paths = new Set<string>();

  for (const pattern of inputs) {
    for await (const path of new Bun.Glob(pattern).scan({
      cwd: root,
      onlyFiles: true,
      dot: true,
    })) {
      paths.add(path);
    }
  }

  const hash = createHash('sha256').update(`${name}\0`);

  for (const path of [...paths].toSorted()) {
    const content = await readFile(join(root, path));

    hash.update(`${path}\0${content.byteLength}\0`).update(content);
  }

  return hash.digest('hex').slice(0, hashLength);
}
