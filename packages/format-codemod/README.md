# @zgeoff/format-codemod

Enforce a small set of blank-line padding conventions in TypeScript via a fast text-splice codemod.
It parses each file once with `@babel/parser`, applies only positional whitespace edits, and skips
type-aware analysis, so it runs far faster than a full lint pass (sub-second over ~2,000 files).

## Rules implemented

Mirrors a subset of ESLint's `padding-line-between-statements` plus
`@stylistic/lines-between-class-members`. Every rule is "always exactly one blank line"; there are
no "never" rules.

**`padding-line-between-statements`** — insert one blank line:

- after a `const`/`let`/`var` block, before any non-var statement
- before any `return`
- after a `function` or `class` declaration
- before a control-flow block: `if`, `for`, `for…in`, `for…of`, `while`, `switch`, `try`

**`@stylistic/lines-between-class-members`** — one blank line between class members.

### Notes

- **Consecutive `const`/`let`/`var` declarations stay glued** (no blank between them).
- **Bare declarations only.** `export const`, `export function`, and `export class` are not matched
  — ESLint's selectors do not look through `export`, and neither does this. `await using` is
  likewise not a var declaration.
- **Control-flow padding keys on the _next_ statement only**, so a guard clause stays tight after
  the block above it (no blank inserted _after_ a control-flow block).
- **`.d.ts` files are skipped.**

## CLI

```bash
format-codemod [options] <file|dir|glob> ...

  --check     exit 1 if any file would change; do not write
  --dry       print unified diff to stdout; do not write
  --bench     print parse stats as JSON to stderr
  --quiet     only print files that would change
  --version
  --help
```

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
it; `node_modules` and `.git` are never descended into.

## Trivia handling

- Trailing same-line comments stay attached to the previous statement: `const X = 1; // note` keeps
  the blank line _after_ the comment.
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

const { output, edits, parseError } = transform(source);
// edits: number of splices applied
// parseError: error message if the source could not be parsed; source returned untouched
```
