import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const sourcePattern = /\.[cm]?[jt]sx?$/u;
const skippedPattern = /\.test\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/u;

export default function readFolderSources(directory) {
  return readdirSync(directory)
    .filter((name) => sourcePattern.test(name) && !skippedPattern.test(name))
    .filter((name) => statSync(join(directory, name), { throwIfNoEntry: false })?.isFile() ?? false)
    .map((name) => ({ name, text: readFileSync(join(directory, name), 'utf8') }));
}
