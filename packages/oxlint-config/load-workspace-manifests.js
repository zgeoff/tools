import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import makeGlobMatcher from './make-glob-matcher.js';

const loadedManifests = new Map();

// The manifest of every package directory the globs match, relative to the
// root. Each glob segment matches one directory level, as a workspaces
// field's globs do.
export default function loadWorkspaceManifests(root, globs) {
  const key = JSON.stringify([root, globs]);
  let manifests = loadedManifests.get(key);

  if (manifests === undefined) {
    manifests = globs
      .flatMap((glob) => readGlobDirs(root, splitGlob(glob), ''))
      .map((directory) => loadManifest(join(root, directory)))
      .filter((manifest) => typeof manifest?.name === 'string');

    loadedManifests.set(key, manifests);
  }

  return manifests;
}

// `./packages/*` and `packages/*/` name the directories `packages/*` names
function splitGlob(glob) {
  return glob.split('/').filter((segment) => segment !== '' && segment !== '.');
}

function readGlobDirs(root, segments, prefix) {
  const [segment, ...rest] = segments;

  if (segment === undefined) {
    return [prefix];
  }

  const isMatch = makeGlobMatcher([segment]);
  const parent = join(root, prefix);
  const names = existsSync(parent)
    ? readdirSync(parent, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
        .map((entry) => entry.name)
        .filter((name) => isMatch(name))
    : [];

  return names.flatMap((name) => readGlobDirs(root, rest, join(prefix, name)));
}

// `dir` is the field the resolver reads from every manifest it loads
function loadManifest(directory) {
  const path = join(directory, 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(path, 'utf8'));

  manifest.dir = directory;

  return manifest;
}
