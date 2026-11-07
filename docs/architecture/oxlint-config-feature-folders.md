# oxlint-config feature folders

`zgeoff/feature-folders` is the rule of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` that keeps
a package's `src/` in feature folders: one folder per thing the package does, with shared code in
`src/utils/`. The [config overview](./oxlint-config.md) covers the rest of the config.

## What the rule checks

The rule is on in the shared config. It judges each file under the `src/` of a package, the nearest
folder above the file that holds a `package.json`, and reports on that file, in a lint run and in an
editor through `oxlint --lsp`:

- **The cap.** When the root of `src/` holds more than 8 counted modules, each counted module
  reports. The first in sorted order gets the full error with an example tree, and the others get
  its first line, so a large root prints the tree once.
- **A shared folder under another name.** A file below `src/lib/`, `src/shared/`, `src/helpers/` or
  `src/common/` reports, with the fix "rename it to src/utils/". The rule checks these names only
  directly under `src/`, so `src/payments/lib/` passes.
- **`utils/` importing a feature.** An import in a file below `src/utils/` that resolves to a file
  in a feature folder reports. A feature folder is any folder under `src/` but `utils/`,
  `test-utils/` and `generated/`. `utils/` may import other `utils/` files, the loose root modules,
  `generated/` and packages.

A module is a file with a `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` or `.cjs` extension.
The cap does not count:

- `index`, `types` and `constants` modules, which have no main export;
- declaration files (`.d.ts`) and tests (`*.test.*`, `*.bench.*`, `*.spec.*`);
- each file that an exact target in the package's `package.json` names: `main`, `module`, a `bin`
  entry, any string in `exports`, or a word of a script, such as `src/serve.ts` in
  `bun run src/serve.ts`.

A target with a `*`, such as `"./*": "./src/*.ts"`, makes no file exempt, because it would exempt
the whole root.

## The `pending` option

A repo lists the package folders it has yet to fold in `pending`, as paths from the repo root. The
rule skips every check in a listed package:

```jsonc
{
  "rules": {
    "zgeoff/feature-folders": ["error", { "pending": ["packages/api", "packages/cli"] }],
  },
}
```

The rule reports an entry that names no `package.json`, and an entry whose package now passes all
three checks, with the fix "remove it from `pending`". An empty list means the repo has folded every
package.

oxlint runs a rule once per file, with no hook for the whole run. The rule reads the pending
packages from the first file it judges in each repo, and reports a stale entry on that file only.
For the `utils/` check there, it scans each `utils/` file's text for import specifiers in place of a
parse, so a specifier in a comment or a string keeps the entry listed.
