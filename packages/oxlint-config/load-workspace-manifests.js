import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import makeGlobMatcher from './make-glob-matcher.js';

export default function loadWorkspaceManifests(root, globs) {
  return withManifestCache(JSON.stringify([root, globs]), () =>
    globs
      .flatMap((glob) => readGlobDirectories(root, splitGlob(glob), ''))
      .map((directory) => loadManifest(join(root, directory)))
      .filter((manifest) => typeof manifest?.name === 'string'),
  );
}

const loadedManifests = new Map();

// each linted file asks again, so the manifests load once per root and globs
function withManifestCache(key, load) {
  if (!loadedManifests.has(key)) {
    loadedManifests.set(key, load());
  }

  return loadedManifests.get(key);
}

function readGlobDirectories(root, segments, prefix) {
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

  return names.flatMap((name) => readGlobDirectories(root, rest, join(prefix, name)));
}

function splitGlob(glob) {
  return glob.split('/').filter((segment) => segment !== '' && segment !== '.');
}

function loadManifest(directory) {
  const path = join(directory, 'package.json');

  if (!existsSync(path)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(path, 'utf8'));

  manifest.directory = directory;

  return manifest;
}
