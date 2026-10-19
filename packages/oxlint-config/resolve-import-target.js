import { existsSync, readFileSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import resolvePackageTarget from './resolve-package-target.js';

// a `.js` specifier in TypeScript source names the `.ts` file beside it
const sourceExtensions = { '.js': ['.ts', '.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

// `module` for a package or builtin, `file` with the absolute path, or
// `missing`. A workspace package's name and the importer's own, which `self`
// marks, resolve through `exports`, and `#` names through `imports`.
export default function resolveImportTarget(filename, specifier, settings) {
  if (isPathSpecifier(specifier)) {
    return toTarget(findImportedFile(filename, toFileSpecifier(specifier), settings.extensions));
  }

  const manifest = findPackageManifest(dirname(filename), settings.root);

  return resolveManifestTarget(manifest, specifier, settings);
}

function resolveManifestTarget(manifest, specifier, settings) {
  const conditions = settings.conditions;
  const name = manifest?.name;

  if (specifier.startsWith('#')) {
    const mapped = findMappedTarget(manifest?.imports, specifier, { conditions, isImports: true });

    // a package the alias names resolves as that name would; a `#` target is
    // not a valid mapping, so it stays a module
    if (mapped !== null && !isPathSpecifier(mapped)) {
      return mapped.startsWith('#')
        ? { kind: 'module', specifier: mapped }
        : { ...resolveManifestTarget(manifest, mapped, settings), self: false };
    }

    return toMappedTarget(manifest, mapped);
  }

  // a builtin keeps its name even when the own or a workspace package shares it
  if (isBuiltin(specifier)) {
    return { kind: 'module', specifier };
  }

  if (isPackageSpecifier(name, specifier)) {
    return { ...resolveExportTarget(manifest, specifier, conditions), self: true };
  }

  const workspace = settings.workspaces.find((candidate) =>
    isPackageSpecifier(candidate.name, specifier),
  );

  if (workspace === undefined) {
    return { kind: 'module', specifier };
  }

  const target = resolveExportTarget(workspace, specifier, conditions);

  return target.kind === 'file' && !isFile(target.path) ? { kind: 'missing' } : target;
}

function isPackageSpecifier(name, specifier) {
  return typeof name === 'string' && (specifier === name || specifier.startsWith(`${name}/`));
}

function resolveExportTarget(manifest, specifier, conditions) {
  const subpath = `.${specifier.slice(manifest.name.length)}`;

  return toMappedTarget(
    manifest,
    findMappedTarget(toSubpathMap(manifest.exports), subpath, { conditions, isImports: false }),
  );
}

// a bundler query such as Vite's `./styles.css?url` names the file before it
function toFileSpecifier(specifier) {
  const query = specifier.indexOf('?');

  return query === -1 ? specifier : specifier.slice(0, query);
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
function findMappedTarget(map, key, lookup) {
  if (typeof map !== 'object' || map === null) {
    return null;
  }

  if (Object.hasOwn(map, key)) {
    return toTargetString(resolvePackageTarget(map[key], null, lookup));
  }

  const [pattern] = Object.keys(map)
    .filter((candidate) => isPatternMatch(candidate, key))
    .toSorted((left, right) => {
      const byPrefix = right.indexOf('*') - left.indexOf('*');

      return byPrefix === 0 ? right.length - left.length : byPrefix;
    });

  if (pattern === undefined) {
    return null;
  }

  const star = pattern.indexOf('*');
  const match = key.slice(star, key.length - (pattern.length - star - 1));

  return toTargetString(resolvePackageTarget(map[pattern], match, lookup));
}

// a blocked, unmatched or invalid target leaves the import unresolved
function toTargetString(resolved) {
  return typeof resolved === 'string' ? resolved : null;
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
