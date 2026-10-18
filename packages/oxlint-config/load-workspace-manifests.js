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
      .map((dir) => loadManifest(join(root, dir)))
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

function loadManifest(dir) {
  const path = join(dir, 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(path, 'utf8'));

  manifest.dir = dir;

  return manifest;
}
