# @zgeoff/oxlint-config

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments, awaits hidden inside a control-flow condition or a `&&`/`||`/`??` chain, every
JSDoc block, any run of more than three line comments, and a repo config that loosens either comment
rule. `zgeoff/function-verb` enforces the function-naming taxonomy from the shared agent guidelines,
`zgeoff/test-beside-module` keeps each test file beside the module it tests, and
`zgeoff/import-zones` fails an import that crosses a module boundary the repo declares.

## Usage

```sh
bun add -d @zgeoff/oxlint-config oxlint @stylistic/eslint-plugin
```

Extend it from `.oxlintrc.json` — `extends` resolves file paths only, so point at the file inside
`node_modules`:

```jsonc
{
  "extends": ["./node_modules/@zgeoff/oxlint-config/oxlintrc.json"],
  // ignorePatterns don't propagate through extends — each consumer declares
  // its own (oxlint also honors .gitignore)
  "ignorePatterns": ["**/node_modules/**", "**/dist/**", "**/*.json"],
}
```

Or import the config object in `oxlint.config.ts`:

```ts
import config from '@zgeoff/oxlint-config';
```

The plugin is addressable on its own at `@zgeoff/oxlint-config/plugin` for configs that want the
`zgeoff/*` rules without the rest.

## `zgeoff/function-verb`

Every function declaration, function-valued variable, and class method must start with a verb from
the function-naming taxonomy. Banned verbs report their taxonomy replacement (`fetchUser` → use
`read`). Object-literal properties are exempt — they overwhelmingly implement externally-defined
shapes whose names the author doesn't choose — as are names not starting with a lowercase letter.
Exempt an algorithm-native name (`walk`, `backtrack`) with a disable comment in the module
implementing that algorithm.

Options extend the shipped set per repo:

```jsonc
{
  "rules": {
    "zgeoff/function-verb": ["error", { "verbs": ["walk"], "exemptNames": ["main"] }],
  },
}
```

## `zgeoff/no-jsdoc` and `zgeoff/max-consecutive-line-comments`

A comment holds only what neither the code, a type, a test name, nor the subsystem doc can hold: the
reason a line does the non-obvious thing. `no-jsdoc` reports every `/** … */` block (inline
`@type`/`@lends` casts exempt). `max-consecutive-line-comments` reports a run of own-line `//`
comments longer than `max` (default 3); tool directives (`oxlint-`, `eslint-`, `@ts-`, …) neither
count nor join the prose around them. Neither rule fixes: a deleted comment is a decision, not a
whitespace change.

Every repo runs both rules as this config ships them. `zgeoff/no-comment-rule-override` reports a
repo-root `.oxlintrc*.json` that sets either rule, once per lint run, so a repo cannot turn them off
or loosen `max`.

## `zgeoff/test-beside-module`

A `<name>.test.ts` or `<name>.test.tsx` file needs a non-test file `<name>.<ext>` in the same
directory — `.ts`, `.tsx`, `.sh`, `.json`, or any other single extension, so `install.test.ts` may
test `install.sh`. Files under an `e2e/` or `evals/` directory at the repo root (the nearest
ancestor holding `.git`, else oxlint's working directory) are exempt; no other directory is. Exempt
any other test with a file-level disable comment that states the reason. The rule reports at the
first statement, so put the comment above it:

```ts
// oxlint-disable zgeoff/test-beside-module -- tests base.json and react.json together
```

A second test file for a module (`<name>.host.test.ts`) needs its own `<name>.host.<ext>`, so the
rule reports it beside only `<name>.ts`.

## `zgeoff/import-zones`

Off unless a repo configures it. The options name zones (path globs, relative to the repo root) and
the boundaries between them. A file belongs to every zone its path matches, so zones may overlap.
Each entry has a `name`, which starts its report, an optional `reason`, which ends it, and optional
`from` zones and `ignore` globs that limit which importing files it judges.

- `edges` judge an import that resolves to a file: relative, or the package's own name resolved
  through its `exports` under `conditions` plus `default`. A target in a `to` zone fails unless it
  is also in an `allow` zone; with `allow` alone, a target in none of the `allow` zones fails, a
  target in no zone included. `allowTypeOnly` exempts type-only imports (`true`, or globs the target
  must match), and `allowWithin: "src/*"` exempts an import inside the importer's own `src/<name>/`.
- `modules` restrict a package or builtin (`node:` prefix optional, subpaths included) to the
  `allow` zones; `allowTypeOnly: true` exempts type-only imports.
- `globals` restrict a call to a global, bare or through `globalThis`, `self` or `window`.
- `unzoned` reports a file in a `from` zone that belongs to none of `zones`.
- `unresolved` reports a relative or self-referencing import that resolves to no file, and a dynamic
  `import()` or `require()` whose specifier is computed.

```jsonc
{
  "rules": {
    "zgeoff/import-zones": [
      "error",
      {
        "zones": {
          "core": ["src/**"],
          "support": ["src/{config,state}/**"],
          "process": ["src/process/**"],
          "tooling": ["scripts/**"],
        },
        "edges": [
          { "name": "core-no-tooling", "from": ["core"], "to": ["tooling"] },
          {
            "name": "support",
            "from": ["support"],
            "allow": ["support"],
            "allowTypeOnly": ["**/types.ts"],
            "reason": "support modules sit below the stages",
          },
        ],
        "modules": [
          {
            "name": "child-process",
            "modules": ["node:child_process"],
            "from": ["core"],
            "allow": ["process"],
            "allowTypeOnly": true,
          },
        ],
        "unresolved": [{ "name": "unresolved", "from": ["core"] }],
      },
    ],
  },
}
```

Exempt a known violation with a next-line disable comment that names the ticket that removes it. An
unzoned report sits on the first statement, so its comment goes above that. Run lint with
`--report-unused-disable-directives-severity error` so a comment outlives no import.

## Notes

- The config enables the `typescript`, `unicorn`, `oxc`, `import`, and `promise` plugins and loads
  `@stylistic/eslint-plugin` through `jsPlugins`. oxlint resolves `jsPlugins` specifiers from the
  project root, not from the config file that names them — so `@stylistic/eslint-plugin` must be a
  direct dependency of the consuming project. Hoisting package managers (bun's default linker, npm)
  resolve it transitively anyway, but isolated layouts (pnpm, `bun install --linker isolated`) fail
  with `Cannot find module '@stylistic/eslint-plugin'` unless it's installed directly.
- Type-aware rules activate under `oxlint --type-aware` (requires `oxlint-tsgolint`); the config
  works without it.
