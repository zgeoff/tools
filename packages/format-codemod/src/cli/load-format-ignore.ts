import fs from 'node:fs';
import path from 'node:path';

/**
 * Reads `.formatignore` from the given directory: one glob per line, blank
 * lines and `#`-prefixed comment lines skipped. Lines share --ignore's glob
 * semantics — this is not a gitignore dialect, so `!` negation and directory
 * anchoring don't apply. A missing file yields an empty list, so callers
 * merge unconditionally.
 */
export function loadFormatIgnore(dir: string): readonly string[] {
  const file = path.join(dir, '.formatignore');

  if (!fs.existsSync(file)) {
    return [];
  }

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
