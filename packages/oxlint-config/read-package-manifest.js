import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// a manifest that does not parse to an object names no entry files, and lint goes on; the package
// manager reports the broken file itself
export default function readPackageManifest(directory) {
  try {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));

    return typeof manifest === 'object' && manifest !== null ? manifest : {};
  } catch {
    return {};
  }
}
