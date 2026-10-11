import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// a `.js` specifier in TypeScript source names the `.ts` file beside it
const sourceExtensions = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

// `module` for a bare specifier that is not the package's own name, `file`
// with the absolute path when the import resolves, `missing` otherwise
export default function resolveImportTarget(filename, specifier, settings) {
  const manifest = findPackageManifest(dirname(filename), settings.root);
  const name = manifest?.name;
  const isSelfReference =
    typeof name === 'string' && (specifier === name || specifier.startsWith(`${name}/`));

  if (!isSelfReference && !isPathSpecifier(specifier)) {
    return { kind: 'module' };
  }

  const path = isSelfReference
    ? findExportedFile(manifest, `.${specifier.slice(name.length)}`, settings.conditions)
    : findImportedFile(filename, specifier, settings.extensions);

  return path === null ? { kind: 'missing' } : { kind: 'file', path };
}

function isPathSpecifier(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

const manifests = new Map();

function findPackageManifest(dir, root) {
  if (manifests.has(dir)) {
    return manifests.get(dir);
  }

  const path = join(dir, 'package.json');
  const parent = dirname(dir);
  let manifest = null;

  if (existsSync(path)) {
    manifest = { dir, ...JSON.parse(readFileSync(path, 'utf8')) };
  } else if (dir !== root && parent !== dir) {
    manifest = findPackageManifest(parent, root);
  }

  manifests.set(dir, manifest);

  return manifest;
}

function findExportedFile(manifest, subpath, conditions) {
  const exports = manifest.exports;
  const isSubpathMap =
    typeof exports === 'object' &&
    exports !== null &&
    Object.keys(exports).some((key) => key.startsWith('.'));
  let value = null;

  if (isSubpathMap) {
    value = exports[subpath] ?? null;
  } else if (subpath === '.') {
    value = exports ?? null;
  }

  const target = findExportTarget(value, conditions);

  return target === null ? null : resolve(manifest.dir, target);
}

// node's rule: the first key, in object order, that names an active condition
function findExportTarget(value, conditions) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  for (const [condition, nested] of Object.entries(value)) {
    const target = conditions.has(condition) ? findExportTarget(nested, conditions) : null;

    if (target !== null) {
      return target;
    }
  }

  return null;
}

function findImportedFile(filename, specifier, extensions) {
  const base = resolve(dirname(filename), specifier);
  const swapped = Object.entries(sourceExtensions).flatMap(([ext, replacements]) =>
    base.endsWith(ext) ? replacements.map((other) => `${base.slice(0, -ext.length)}${other}`) : [],
  );

  const candidates = [
    base,
    ...swapped,
    ...extensions.map((ext) => `${base}${ext}`),
    ...extensions.map((ext) => join(base, `index${ext}`)),
  ];

  return candidates.find((candidate) => isFile(candidate)) ?? null;
}

function isFile(path) {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false;
}
