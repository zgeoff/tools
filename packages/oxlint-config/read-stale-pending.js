import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import buildImportSettings from './build-import-settings.js';
import findFeatureFolder from './find-feature-folder.js';
import pickFolderKind from './pick-folder-kind.js';
import readLooseModules from './read-loose-modules.js';
import resolveImportTarget from './resolve-import-target.js';

export default function readStalePending(root, pending, limit) {
  return pending.flatMap((entry) => {
    const directory = join(root, entry);

    if (!existsSync(join(directory, 'package.json'))) {
      return [{ entry, messageId: 'pendingMissing' }];
    }

    return probePackagePassing(root, directory, limit)
      ? [{ entry, messageId: 'pendingPasses' }]
      : [];
  });
}

function probePackagePassing(root, directory, limit) {
  const source = join(directory, 'src');

  if (!existsSync(source)) {
    return true;
  }

  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const folders = readdirSync(source, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );

  return (
    readLooseModules({ directory, manifest }).length <= limit &&
    !folders.some((folder) => pickFolderKind(folder.name) === 'synonym') &&
    !probeUtilsFeatureImport(root, source)
  );
}

const modulePattern = /\.[cm]?[jt]sx?$/u;

// a whole-file scan stands in for the parse that only the linted file gets, so a specifier in a
// comment or a string counts too, and keeps the entry
const specifierPattern =
  /(?:\bfrom|\bimport)\s*\(?\s*(?<quote>["'])(?<specifier>[^"'\n]+)\k<quote>/gu;

function probeUtilsFeatureImport(root, source) {
  const utils = join(source, 'utils');

  if (!existsSync(utils)) {
    return false;
  }

  const settings = buildImportSettings(root);
  const files = readdirSync(utils, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && modulePattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));

  return files.some((filename) =>
    [...readFileSync(filename, 'utf8').matchAll(specifierPattern)].some((match) => {
      const target = resolveImportTarget(filename, match.groups.specifier, settings);

      return target.kind === 'file' && findFeatureFolder(source, target.path) !== null;
    }),
  );
}
