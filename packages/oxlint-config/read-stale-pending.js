import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import buildImportSettings from './build-import-settings.js';
import findFeatureFolder from './find-feature-folder.js';
import pickFolderKind from './pick-folder-kind.js';
import readLooseModules from './read-loose-modules.js';
import readModulePaths from './read-module-paths.js';
import readPackageManifest from './read-package-manifest.js';
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

  const manifest = readPackageManifest(directory);
  const synonyms = readdirSync(source, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory() && pickFolderKind(entry.name) === 'synonym',
  );

  return (
    readLooseModules({ directory, manifest }).length <= limit &&
    !synonyms.some((folder) => readFolderModules(join(source, folder.name)).length > 0) &&
    !probeUtilsFeatureImport(root, source)
  );
}

function readFolderModules(folder) {
  return existsSync(folder)
    ? readModulePaths(readdirSync(folder, { recursive: true, withFileTypes: true }))
    : [];
}

// a text scan stands in for the parse that only the linted file gets: comments go first, so a
// specifier that only a string holds is the one case that keeps the entry
const commentPattern =
  /(?<text>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\/\/[^\n]*|\/\*[\s\S]*?\*\//gu;
const specifierPattern =
  /(?:\bfrom|\bimport)\s*\(?\s*(?<quote>["'])(?<specifier>[^"'\n]+)\k<quote>/gu;

function probeUtilsFeatureImport(root, source) {
  const settings = buildImportSettings(root);

  return readFolderModules(join(source, 'utils')).some((filename) => {
    const text = readFileSync(filename, 'utf8').replaceAll(
      commentPattern,
      (...match) => match.at(-1).text ?? '',
    );

    return [...text.matchAll(specifierPattern)].some((match) => {
      const target = resolveImportTarget(filename, match.groups.specifier, settings);

      return target.kind === 'file' && findFeatureFolder(source, target.path) !== null;
    });
  });
}
