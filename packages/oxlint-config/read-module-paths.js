import { statSync } from 'node:fs';
import { join } from 'node:path';

const modulePattern = /\.[cm]?[jt]sx?$/u;
const declarationPattern = /\.d\.[cm]?ts$/u;

// takes readdir entries and follows a symlink, so a linked module counts as the file it points at
export default function readModulePaths(entries) {
  return entries
    .filter((entry) => modulePattern.test(entry.name) && !declarationPattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false);
}
