import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// a `.js` specifier in TypeScript source names the `.ts` file beside it
const sourceExtensions = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

// `module` with the specifier for a package or builtin, `file` with the
// absolute path when the import resolves, `missing` otherwise. The package's
// own name resolves through its `exports`, and `#` names through its `imports`.
export default function resolveImportTarget(filename, specifier, settings) {
  if (isPathSpecifier(specifier)) {
    return toTarget(findImportedFile(filename, specifier, settings.extensions));
  }

  const manifest = findPackageManifest(dirname(filename), settings.root);

  return resolveManifestTarget(manifest, specifier, settings.conditions);
}

function resolveManifestTarget(manifest, specifier, conditions) {
  const name = manifest?.name;

  if (specifier.startsWith('#')) {
    const mapped = findMappedTarget(manifest?.imports, specifier, conditions);

    return mapped !== null && !isPathSpecifier(mapped)
      ? { kind: 'module', specifier: mapped }
      : toMappedTarget(manifest, mapped);
  }

  if (typeof name === 'string' && (specifier === name || specifier.startsWith(`${name}/`))) {
    const subpath = `.${specifier.slice(name.length)}`;

    return toMappedTarget(
      manifest,
      findMappedTarget(toSubpathMap(manifest.exports), subpath, conditions),
    );
  }

  return { kind: 'module', specifier };
}

function toTarget(path) {
  return path === null ? { kind: 'missing' } : { kind: 'file', path };
}

function toMappedTarget(manifest, mapped) {
  return mapped === null
    ? { kind: 'missing' }
    : { kind: 'file', path: resolve(manifest.dir, mapped) };
}

function isPathSpecifier(specifier) {
  return /^[./]/u.test(specifier);
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

// `exports` without `.` keys is the target of the package's own name alone
function toSubpathMap(exports) {
  const isSubpathMap =
    typeof exports === 'object' &&
    exports !== null &&
    !Array.isArray(exports) &&
    Object.keys(exports).some((key) => key.startsWith('.'));

  return isSubpathMap || exports === undefined ? exports : { '.': exports };
}

// an exact key wins; otherwise the `*` pattern with the longest prefix, then
// the longest key, as node picks it, its match substituted into the target
function findMappedTarget(map, key, conditions) {
  if (typeof map !== 'object' || map === null) {
    return null;
  }

  if (Object.hasOwn(map, key)) {
    return findConditionTarget(map[key], conditions);
  }

  const [pattern] = Object.keys(map)
    .filter((candidate) => isPatternMatch(candidate, key))
    .toSorted((left, right) => {
      const byPrefix = right.indexOf('*') - left.indexOf('*');

      return byPrefix === 0 ? right.length - left.length : byPrefix;
    });

  return pattern === undefined ? null : findPatternTarget(map, pattern, { key, conditions });
}

function findPatternTarget(map, pattern, lookup) {
  const star = pattern.indexOf('*');
  const match = lookup.key.slice(star, lookup.key.length - (pattern.length - star - 1));
  const target = findConditionTarget(map[pattern], lookup.conditions);

  return target === null ? null : target.replaceAll('*', match);
}

function isPatternMatch(pattern, key) {
  const star = pattern.indexOf('*');

  if (star === -1 || pattern.includes('*', star + 1)) {
    return false;
  }

  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);

  return key.length >= pattern.length && key.startsWith(prefix) && key.endsWith(suffix);
}

// node's rule: the first key, in object order, that names an active
// condition; in an array, the first entry that yields a target
function findConditionTarget(value, conditions) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidates = Array.isArray(value)
    ? value
    : Object.keys(value)
        .filter((condition) => conditions.has(condition))
        .map((condition) => value[condition]);

  return (
    candidates
      .map((candidate) => findConditionTarget(candidate, conditions))
      .find((target) => target !== null) ?? null
  );
}

function findImportedFile(filename, specifier, extensions) {
  const base = resolve(dirname(filename), specifier);
  const swapped = Object.keys(sourceExtensions).flatMap((ext) =>
    base.endsWith(ext)
      ? sourceExtensions[ext].map((other) => `${base.slice(0, -ext.length)}${other}`)
      : [],
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
