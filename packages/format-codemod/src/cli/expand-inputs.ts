import fs from 'node:fs';
import path from 'node:path';

export async function expandInputs(
  patterns: readonly string[],
  ignore: readonly string[] = [],
): Promise<string[]> {
  const lists = await Promise.all(patterns.map((pattern) => expandPattern(pattern)));

  return [...new Set(lists.flat())].filter((file) => !isIgnored(file, ignore));
}

function expandPattern(input: string): Promise<string[]> {
  // A literal path is checked before the glob heuristic so bracketed names
  // (Next.js routes like `[slug]/page.tsx`) are treated as files, not as glob
  // character classes that match nothing and silently drop the file.
  if (fs.existsSync(input)) {
    if (fs.statSync(input).isDirectory()) {
      const pattern = path.join(input, '**/*.{ts,tsx}');

      return Array.fromAsync(fs.promises.glob(pattern, { exclude: isExcluded }));
    }

    return Promise.resolve([input]);
  }

  if (/[*?[{]/u.test(input)) {
    return Array.fromAsync(fs.promises.glob(input, { exclude: isExcluded }));
  }

  return Promise.resolve([input]);
}

// Node passes directories to `exclude` (pruning descent) while Bun filters
// final matches, so the check matches a segment and accepts a Dirent
function isExcluded(
  entry: string | { readonly name: string; readonly parentPath?: string },
): boolean {
  const entryPath =
    typeof entry === 'string' ? entry : path.join(entry.parentPath ?? '', entry.name);

  return entryPath
    .split(/[\\/]/u)
    .some((segment) => segment === 'node_modules' || segment === '.git');
}

function isIgnored(file: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const relative = path.relative(process.cwd(), file);

  return patterns.some(
    (pattern) => path.matchesGlob(file, pattern) || path.matchesGlob(relative, pattern),
  );
}
