import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourcePattern = /\.[cm]?[jt]sx?$/u;
const skippedPattern = /\.test\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/u;

// the text of each module in the folder, test files and declaration files left out
export default function readFolderSources(directory) {
  return readdirSync(directory)
    .filter((name) => sourcePattern.test(name) && !skippedPattern.test(name))
    .map((name) => join(directory, name))
    .filter((path) => statSync(path, { throwIfNoEntry: false })?.isFile() ?? false)
    .map((path) => readFileSync(path, 'utf8'));
}
