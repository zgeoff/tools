import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import collectEntryTargets from './collect-entry-targets.js';
import readModulePaths from './read-module-paths.js';

export default function readLooseModules(sourcePackage) {
  const targets = collectEntryTargets(sourcePackage.directory, sourcePackage.manifest);
  const entries = readdirSync(join(sourcePackage.directory, 'src'), { withFileTypes: true });

  return readModulePaths(entries)
    .filter((path) => !targets.has(path) && isCountedModule(basename(path)))
    .map((path) => basename(path))
    .toSorted();
}

const declarationPattern = /\.d\.[cm]?ts$/u;
const testPattern = /\.(?:test|bench|spec)\.[cm]?[jt]sx?$/u;
const exemptPattern = /^(?:index|types|constants)\.[cm]?[jt]sx?$/u;

function isCountedModule(name) {
  return !declarationPattern.test(name) && !testPattern.test(name) && !exemptPattern.test(name);
}
