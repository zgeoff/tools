# @zgeoff/format-codemod

Machine-owned vertical spacing for TypeScript. Every gap between adjacent statements is normalized
to exactly one blank line where a spacing rule requires one, and zero where none does — a superset
of ESLint's `padding-line-between-statements` and `@stylistic/lines-between-class-members`, run as a
text-splice codemod. Each file is parsed once with [oxc-parser](https://oxc.rs) (native) and edited
by positional whitespace splices — no type-aware analysis — so a pass is fast enough for a
pre-commit hook or a `format` pipeline. Runs are idempotent: a pass over compliant code is a no-op.

## CLI

`format-codemod --help` lists the flags and exit codes. An unknown flag is a usage error, never a
silent no-op, because the default mode writes files and a mistyped `--check` must not fall through
to a rewrite.

```bash
format-codemod 'src/**/*.{ts,tsx}'           # rewrite in place
format-codemod --check 'src/**/*.{ts,tsx}'   # CI gate
format-codemod --dry path/to/file.ts         # preview diff, which patch(1) applies
format-codemod .                             # whole repo, in place
```

## Programmatic use

```ts
import { transform } from '@zgeoff/format-codemod';

const { output, edits, parseError } = transform(source, { filename: 'component.tsx' });
// edits: number of splices applied
// parseError: error message if the source could not be parsed; source returned untouched
```

`filename` is optional and only picks the dialect (default `'source.ts'` — plain TypeScript, no
JSX); nothing is read from disk.

## Documentation

- [The format-codemod rules doc](../../docs/architecture/format-codemod-rules.md) lists the spacing
  rules and the gaps the codemod leaves alone.
- [The format-codemod inputs doc](../../docs/architecture/format-codemod-inputs.md) describes how
  the CLI resolves its file, directory and glob arguments, and how it reads ignore globs.
