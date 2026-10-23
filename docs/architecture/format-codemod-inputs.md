# format-codemod inputs

The [format-codemod](../../packages/format-codemod/README.md) CLI turns its arguments into a list of
TypeScript files, then skips each file that an ignore glob matches. A literal path, a directory and
a glob each resolve differently, and each file's extension picks how the codemod parses it. Ignore
globs come from `--ignore` flags and from a `.formatignore` file.

## Paths, directories and globs

Globs use Node's built-in `fs.glob`. A literal path is resolved as a file before the glob heuristic
runs, so bracketed names (Next.js routes like `[slug]/page.tsx`) are read as files, not glob
character classes. A directory expands to `**/*.{ts,tsx}` beneath it; `node_modules` and `.git` are
never descended into, and overlapping patterns are deduped so each file is processed once. `.d.ts`
files are skipped. The extension picks the parse dialect: `.tsx` enables JSX, everything else parses
as plain TypeScript — so `.ts`-only syntax (`<string>value` assertions, un-comma'd generic arrows
`<T>(a: T) => a`) parses correctly instead of being misread as JSX.

## Ignoring files

A `.formatignore` file in the working directory supplies ignore globs — one per line, blank lines
and `#`-prefixed comment lines skipped:

```gitignore
# committed codegen
src/generated/**
dist/**
```

Each line uses the same semantics as `--ignore` (Node's `path.matchesGlob`, tried against both the
expanded path and the path relative to the working directory). It is not a gitignore dialect: `!`
negation and directory-anchoring rules are not supported. `--ignore` flags merge additively with the
file's globs.
