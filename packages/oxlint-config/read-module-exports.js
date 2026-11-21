import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const blockComment = /\/\*[\s\S]*?\*\//gu;
const lineComment = /\/\/[^\n]*/gu;
const namedExport =
  /\bexport\s+(?<type>type\s+)?\{(?<names>[^}]*)\}(?:\s*from\s*['"](?<source>[^'"]+)['"])?/gu;
const declaredExport =
  /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var)\s+(?<name>\w+)/gu;
const namespaceExport =
  /\bexport\s+\*(?:\s+as\s+(?<alias>\w+))?\s+from\s*['"](?<source>[^'"]+)['"]/gu;

// reads the value exports of one module with no TypeScript compiler: it matches the export
// forms a barrel or a module uses and follows `export *` into relative files; a type export is
// skipped, so only names a caller can call or read remain
export default function readModuleExports(file, visited = new Set()) {
  if (visited.has(file) || !existsSync(file)) {
    return new Set();
  }

  visited.add(file);

  const text = readFileSync(file, 'utf8').replaceAll(blockComment, '').replaceAll(lineComment, '');
  const names = new Set();

  for (const match of text.matchAll(namedExport)) {
    if (match.groups.type === undefined) {
      for (const name of readSpecifierNames(match.groups.names)) {
        names.add(name);
      }
    }
  }

  for (const match of text.matchAll(declaredExport)) {
    names.add(match.groups.name);
  }

  for (const match of text.matchAll(namespaceExport)) {
    for (const name of readNamespaceNames(file, match.groups, visited)) {
      names.add(name);
    }
  }

  return names;
}

function readSpecifierNames(list) {
  return list
    .split(',')
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier !== '' && !/^type\s/u.test(specifier))
    .map((specifier) =>
      specifier
        .split(/\s+as\s+/u)
        .at(-1)
        .trim(),
    );
}

function readNamespaceNames(file, groups, visited) {
  if (groups.alias !== undefined) {
    return [groups.alias];
  }

  const target = resolveRelative(file, groups.source);

  return target === null ? [] : readModuleExports(target, visited);
}

const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.js'];

function resolveRelative(file, source) {
  if (!source.startsWith('.')) {
    return null;
  }

  const base = join(dirname(file), source);

  return (
    extensions.map((extension) => `${base}${extension}`).find((path) => existsSync(path)) ?? null
  );
}
