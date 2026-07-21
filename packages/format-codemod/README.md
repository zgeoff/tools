# @zgeoff/format-codemod

Machine-owned vertical spacing for TypeScript. Every gap between adjacent statements is normalized
to exactly one blank line where a rule below requires one, and zero where none does — a superset of
ESLint's `padding-line-between-statements` and `@stylistic/lines-between-class-members`, run as a
text-splice codemod. Each file is parsed once with [oxc-parser](https://oxc.rs) (native) and edited
by positional whitespace splices — no type-aware analysis — so a pass is fast enough for a
pre-commit hook or a `format` pipeline. Runs are idempotent: a pass over compliant code is a no-op.

Three kinds of gap are left alone:

- A gap holding any comment is never collapsed, only grown — prose between statements marks
  intentional grouping the rules can't see.
- The interior of an import block is never touched — it belongs to the import sorter. The boundary
  after the last import is still padded.
- Two statements sharing a physical line (a leading-semicolon `;(expr)` guard) are skipped — a
  blank-only edit can't separate them without orphaning a token.

## Rules

**Padded on both sides** — the statement is its own paragraph:

- a control-flow block: `if`, `for`, `for…in`, `for…of`, `while`, `switch`, `try`
- any statement that spans multiple lines
- a type alias or interface declaration — runs of them are padded apart, not glued. This is the one
  rule that looks through `export`: `export type X = …` pads like `type X = …`.

**Padded on one side:**

- before every `return`
- after a `function` or `class` declaration
- after a directive prologue (`'use strict'`, `'use client'`); runs of directives stay glued
- after the last import of a block

**Kind boundaries** — statements classify into kinds; a run of one kind sits flush, and the boundary
between two kinds takes a blank line:

- `const`/`let`/`var` declarations
- `using`/`await using` declarations
- bare calls and method calls — two distinct kinds, split by the first call in reading order:
  `use(x).report()` opens with a bare function, `fs.writeFileSync(…)` opens with a member, and a
  member call chained onto a bare call's result is still a bare call
- `expect` assertions — a statement whose first call in reading order is `expect` or an `expect.*`
  helper (`expect(x).toBe(y)`, `expect.assertions(1)`) is its own kind, so a run of assertions stays
  glued while the boundary with any acting statement is padded
- assignments and increments

Two axes overlay the kinds and pad their own boundaries:

- instantiation — a statement headed by `new` (`new X(…)`, `new X(…).method()`) is separated from
  any non-instantiation statement; `new` in argument position doesn't count, and runs of
  instantiations stay glued
- awaitedness — an awaited statement (`await using`, or an `await` in the head of the statement's
  value chain: `await f()`, `const x = await f()`) is separated from non-awaited ones; an `await` in
  argument position (`use(await f())`) or under a non-chain head (`flag ? await f() : g()`) doesn't
  count, and runs of awaited statements stay glued

**Class members** — one blank line between members.

Only bare declarations match the declaration rules: `export const`, `export function`, and
`export class` are not declarations to the classifier (type aliases and interfaces are the one
exception, above).

Comment positions come from the parser, not lexical scanning, so comment-lookalike text can't
mislead the classification. A trailing same-line comment stays attached to the statement before it —
the blank line goes after the comment; a comment on its own line attaches to the statement after it
— the blank line goes before. The next statement's indentation is preserved.

## CLI

```bash
format-codemod [options] <file|dir|glob> ...

  --check            exit 1 if any file would change; do not write
  --dry              print unified diff to stdout; do not write
  --bench            print parse stats as JSON to stderr
  --quiet            only print files that would change
  --ignore <glob>    skip files matching the glob (repeatable)
  --version
  --help
```

Flags are strict: an unknown flag is a usage error, never a silent no-op — the default mode writes
files, so a typo'd `--check` must not fall through to a rewrite. Exit codes: `0` clean, `1` files
would change (`--check`), `2` usage error or one or more files failed (parse error, unreadable,
unwritable).

```bash
format-codemod 'src/**/*.{ts,tsx}'           # rewrite in place
format-codemod --check 'src/**/*.{ts,tsx}'   # CI gate
format-codemod --dry path/to/file.ts         # preview diff; applies cleanly with patch(1)
format-codemod .                             # whole repo, in place
```

### Inputs

Globs use Node's built-in `fs.glob`. A literal path is resolved as a file before the glob heuristic
runs, so bracketed names (Next.js routes like `[slug]/page.tsx`) are read as files, not glob
character classes. A directory expands to `**/*.{ts,tsx}` beneath it; `node_modules` and `.git` are
never descended into, and overlapping patterns are deduped so each file is processed once. `.d.ts`
files are skipped. The extension picks the parse dialect: `.tsx` enables JSX, everything else parses
as plain TypeScript — so `.ts`-only syntax (`<string>value` assertions, un-comma'd generic arrows
`<T>(a: T) => a`) parses correctly instead of being misread as JSX.

### Ignoring files

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

## Programmatic use

```ts
import { transform } from '@zgeoff/format-codemod';

const { output, edits, parseError } = transform(source, { filename: 'component.tsx' });
// edits: number of splices applied
// parseError: error message if the source could not be parsed; source returned untouched
```

`filename` is optional and only picks the dialect (default `'source.ts'` — plain TypeScript, no
JSX); nothing is read from disk.
