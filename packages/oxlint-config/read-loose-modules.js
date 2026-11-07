import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import collectEntryTargets from './collect-entry-targets.js';

export default function readLooseModules(sourcePackage) {
  const targets = collectEntryTargets(sourcePackage.directory, sourcePackage.manifest);
  const source = join(sourcePackage.directory, 'src');

  return readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isCountedModule(entry.name))
    .map((entry) => entry.name)
    .filter((name) => !targets.has(join(source, name)))
    .toSorted();
}

const modulePattern = /\.[cm]?[jt]sx?$/u;
const declarationPattern = /\.d\.[cm]?ts$/u;
const testPattern = /\.(?:test|bench|spec)\.[cm]?[jt]sx?$/u;
const exemptPattern = /^(?:index|types|constants)\.[cm]?[jt]sx?$/u;

function isCountedModule(name) {
  return (
    modulePattern.test(name) &&
    !declarationPattern.test(name) &&
    !testPattern.test(name) &&
    !exemptPattern.test(name)
  );
}
