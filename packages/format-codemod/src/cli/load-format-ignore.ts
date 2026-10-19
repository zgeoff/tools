import fs from 'node:fs';
import path from 'node:path';

export function loadFormatIgnore(directory: string): readonly string[] {
  const file = path.join(directory, '.formatignore');

  if (!fs.existsSync(file)) {
    return [];
  }

  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
