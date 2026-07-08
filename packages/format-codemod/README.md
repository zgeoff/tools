# @zgeoff/format-codemod

Enforce a small set of blank-line padding conventions in TypeScript via a fast text-splice codemod.
It parses each file once with [oxc-parser](https://oxc.rs) (native, so parsing is effectively free),
plans positional whitespace splices from node and comment spans, and skips type-aware analysis, so
it runs far faster than a full lint pass — fast enough to sit in a pre-commit hook or a `format`
pipeline without being noticed.

## Rules implemented

Mirrors a subset of ESLint's `padding-line-between-statements` plus
`@stylistic/lines-between-class-members`. Every rule is "always exactly one blank line"; there are
no "never" rules.

**`padding-line-between-statements`** — insert one blank line:

- after a `const`/`let`/`var` block, before any non-var statement
- before any `return`
- after a `function` or `class` declaration
- on both sides of a control-flow block: `if`, `for`, `for…in`, `for…of`, `while`, `switch`, `try`
- on both sides of any statement that spans multiple lines
- at the boundary between statement kinds — a `const`/`let`/`var` declaration, a
  `using`/`await using` declaration, a call statement, an assignment/increment statement — in any
  order; runs of one kind stay tight
- after a `using`/`await using` block, before any statement of another kind
- at the boundary between an instantiation-headed statement (`new` at the head of its expression
  chain, as in `new X(…)` or `new X(…).method()`) and any other statement kind — `new` in argument
  position doesn't count, and runs of instantiations stay glued
- at the boundary between an awaited and a non-awaited statement — awaited means an `await using`
  declaration, or an `await` in the head of the statement's value chain (`await f()`,
  `const x = await f()`, `x = (await f()).prop`); an `await` in argument position (`use(await f())`)
  or under a non-chain head (`flag ? await f() : g()`) doesn't count, and runs of awaited statements
  stay glued

**`@stylistic/lines-between-class-members`** — one blank line between class members.

### Notes

- **Consecutive single-line `const`/`let`/`var` declarations stay glued** (no blank between them); a
  multiline declaration is separated like any other multiline statement.
- **Bare declarations only.** `export const`, `export function`, and `export class` are not matched
  — ESLint's selectors do not look through `export`, and neither does this. `using`/`await using`
  declarations are not var declarations; they form their own statement kind.
- **The `using` and awaited-boundary rules go beyond ESLint** — `padding-line-between-statements`
  cannot express either, so on these the codemod is the spec.
- **`.d.ts` files are skipped.**

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

Flags are strict: an unknown flag is a usage error (exit 2), never a silent no-op — the default mode
writes files, so a typo'd `--check` must not fall through to a rewrite.

### Examples

```bash
format-codemod 'src/**/*.{ts,tsx}'           # rewrite in place
format-codemod --check 'src/**/*.{ts,tsx}'   # CI gate
format-codemod --dry path/to/file.ts         # preview diff
format-codemod .                             # whole repo, in place
```

Globs use Node 22's built-in `fs.glob`. A literal path is resolved as a file before the glob
heuristic runs, so bracketed names (Next.js routes like `[slug]/page.tsx`) are handled correctly
rather than read as glob character classes. A directory argument expands to `**/*.{ts,tsx}` beneath
it; `node_modules` and `.git` are never descended into, and overlapping patterns are deduped so a
file is processed once.

`--dry` prints a real unified diff — `@@` hunk headers with three lines of context — that applies
cleanly with `patch(1)`.

### Ignoring files

A `.formatignore` file in the working directory supplies ignore globs without bloating the command
line — one per line, with blank lines and `#`-prefixed comment lines skipped:

```gitignore
# committed codegen
src/generated/**

# build output
dist/**
```

Each line uses the same glob semantics as `--ignore` (Node's `path.matchesGlob`, tried against both
the expanded path and the path relative to the working directory). It is not a gitignore dialect:
`!` negation and directory-anchoring rules are not supported. `--ignore` flags remain available and
merge additively with the file's globs.

## Dialect handling

The filename picks the parse dialect: `.tsx` enables JSX, everything else parses as plain
TypeScript. That means `.ts`-only syntax — old-style type assertions (`<string>value`), un-comma'd
generic arrows (`<T>(a: T) => a`) — parses correctly instead of being misread as JSX.

## Trivia handling

Comment positions come from the parser, not lexical scanning:

- Trailing same-line comments stay attached to the previous statement: `const X = 1; // note` keeps
  the blank line _after_ the comment (several same-line comments all stay together).
- Leading comments stay attached to the next statement: the blank line goes _before_ the comment.
- Indentation of the next statement is preserved.
- Two statements that share a physical line are left untouched — for example a leading-semicolon
  `;(expr)` whose `;` terminates the previous statement. A blank-only edit cannot separate them
  without orphaning a token, so the codemod skips the pair.

## Idempotent

Running the codemod twice produces the same output as running it once. A run on already-compliant
code is a no-op.

## Programmatic use

```ts
import { transform } from '@zgeoff/format-codemod';

const { output, edits, parseError } = transform(source, { filename: 'component.tsx' });
// edits: number of splices applied
// parseError: error message if the source could not be parsed; source returned untouched
```

`filename` is optional and only drives dialect selection (default `'source.ts'` — plain TypeScript,
no JSX); nothing is read from disk.
