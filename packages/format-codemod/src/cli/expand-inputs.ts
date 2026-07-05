import fs from 'node:fs';
import path from 'node:path';

/**
 * Deduped: overlapping patterns (a `src/**` glob plus a file inside src/) must
 * not process — or report — the same file twice. Ignore globs filter the final
 * list uniformly, so a file is skipped whether it arrived via a directory,
 * a glob, or an explicit path argument.
 */
export async function expandInputs(
  patterns: readonly string[],
  ignore: readonly string[] = [],
): Promise<string[]> {
  const lists = await Promise.all(patterns.map((p) => expandPattern(p)));

  return [...new Set(lists.flat())].filter((file) => !isIgnored(file, ignore));
}

function expandPattern(p: string): Promise<string[]> {
  // A literal path is checked before the glob heuristic so bracketed names
  // (Next.js routes like `[slug]/page.tsx`) are treated as files, not as glob
  // character classes that match nothing and silently drop the file.
  if (fs.existsSync(p)) {
    if (fs.statSync(p).isDirectory()) {
      const pattern = path.join(p, '**/*.{ts,tsx}');

      return Array.fromAsync(fs.promises.glob(pattern, { exclude: isExcluded }));
    }

    return Promise.resolve([p]);
  }

  if (/[*?[{]/u.test(p)) {
    return Array.fromAsync(fs.promises.glob(p, { exclude: isExcluded }));
  }

  return Promise.resolve([p]);
}

/**
 * Keeps directory expansion out of dependency trees and nested git dirs — a bare
 * `format-codemod .` at a repo root must not descend into installed packages.
 * Node passes directories to `exclude` (pruning descent); Bun filters final
 * matches — segment matching handles both, and Dirents in case withFileTypes
 * semantics ever leak through.
 */
function isExcluded(
  entry: string | { readonly name: string; readonly parentPath?: string },
): boolean {
  const p = typeof entry === 'string' ? entry : path.join(entry.parentPath ?? '', entry.name);

  return p.split(/[\\/]/u).some((seg) => seg === 'node_modules' || seg === '.git');
}

/**
 * A pattern is tried against the path both as expanded and relative to the
 * working directory, so `dist/**` ignores dist/ files whether the caller
 * passed a relative or an absolute input.
 */
function isIgnored(file: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const relative = path.relative(process.cwd(), file);

  return patterns.some(
    (pattern) => path.matchesGlob(file, pattern) || path.matchesGlob(relative, pattern),
  );
}
