# @zgeoff/oxlint-config

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments, awaits hidden inside a control-flow condition or a `&&`/`||`/`??` chain, every
`switch` statement, every JSDoc block, any run of more than three line comments, and a repo config
that loosens either comment rule. `zgeoff/function-verb` enforces the function-naming taxonomy from
the shared agent guidelines, `zgeoff/test-beside-module` keeps each test file beside the module it
tests, `zgeoff/import-zones` fails an import that crosses a module boundary the repo declares,
`zgeoff/no-restricted-words` keeps the words in its `words` option out of a path's text,
`zgeoff/no-abbreviated-names` reports each abbreviated value name it lists with its full word,
`zgeoff/no-file-snapshot` bans file snapshots, and `zgeoff/setup-test-only` keeps a test file's
module level to `setupTest()` and its tests.

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

## `zgeoff/setup-test-only`

A `<name>.test.ts` or `<name>.test.tsx` file declares one function, `setupTest()`, and nothing else,
as the testing skill requires. At module level the rule allows imports, `type` and `interface`
declarations, one `setupTest` function declaration, and statements that call `test`, `test.each`,
`test.skipIf` or `test.if`, or a chain of them. It reports every other statement: a `let`, a `var`,
a class, an enum, a second function, an export, and a call such as `beforeEach(...)`. The message
holds the three ways out of a helper: inline it, swap it for a registered matcher, or move it to the
shared test utils with tests of its own.

A module-level `const` passes only as a skip gate: a `const` whose every binding is read, and read
only inside a `skipIf(...)` argument or inside the initializer of another gate. A gate derived from
an awaited probe therefore passes beside the probe, but consts that only read each other never reach
a `skipIf` and report. A `const` that a test body, `setupTest()` or another non-gate reads reports,
and so does one that nothing reads. The rule does not check the comment that the skill asks a gate
to carry.

## `zgeoff/no-restricted-words`

Off unless a repo configures it. The `words` option lists the words to keep out of the text of a
file: string literals, template text and comments. A word matches whole and without case, so `imp`
reports `'IMP daemon'` and `'imp-e2e'` but not `'impl'` or `'imp_name'`. Identifiers are code, not
text, and the rule never reads them. Scope the rule to a path with `overrides`, and turn it off for
the paths that may name the words:

```jsonc
{
  "rules": {
    "zgeoff/no-restricted-words": ["error", { "words": ["imp", "impd"] }],
  },
  "overrides": [
    { "files": ["packages/execution/**"], "rules": { "zgeoff/no-restricted-words": "off" } },
  ],
}
```

## `zgeoff/no-abbreviated-names`

The `names` option maps each abbreviation to the text that replaces it, and the rule reports every
value name that has one of those names. A value name is any name that a declaration, an import, an
export alias, a key or a member write binds, so function, class and method names count beside
variables and properties. A key counts in each of its spellings, so `src`, `'src'`, `['src']` and
`#src` all report. A name matches whole, so `ms` reports `ms` but not `timeoutMs`.

The rule leaves alone the names that hold no value of their own. A destructured key that an alias
renames belongs to the object being read, so the rule reports only the alias. A computed key that
reads a variable, such as `[src]`, names no property, and the rule checks the variable at its
declaration. Type names, type-only imports and exports, labels and quoted module names hold no
value, so the rule skips them.

The shipped config lists the abbreviations that the code-style skill bans and turns on `id-length`
beside the rule, so a one-letter name fails too, other than `x`, `y`, `z`, `$` and `_`.

## `zgeoff/no-file-snapshot`

Snapshots are inline only, so the golden value sits in the test that pins it. The rule reports every
`toMatchSnapshot` and `toThrowErrorMatchingSnapshot`, which write a `.snap` file;
`toMatchInlineSnapshot` and `toThrowErrorMatchingInlineSnapshot` stay allowed. It also reports a
linted file that has a `__snapshots__/<file name>.snap` beside it, at the first statement, so a
file-level disable comment covers it. oxlint never visits a `.snap` file, so a snapshot file whose
test file is gone is not reported.

## `zgeoff/import-zones`

Off unless a repo configures it. The options name zones (path globs, relative to the repo root) and
the boundaries between them. A file belongs to every zone its path matches, so zones may overlap.
Each entry has a `name`, which starts its report, an optional `reason`, which ends it, and optional
`from` zones and `ignore` globs that limit which importing files it judges.

- `edges` judge an import that resolves to a file: relative, with any bundler query such as `?url`
  dropped, or the package's own name resolved through its `exports` under `conditions` plus
  `default`. They also judge the name of each package whose directory a `workspaces` glob matches,
  such as `packages/*`, with one directory level per segment. That name maps to the package folder
  joined with the subpath, never to an export's target: `@demo/store/testing` is judged as
  `packages/store/testing`, so a zone names the folder path, such as `packages/store{,/**}`. A
  target in a `to` zone fails unless it is also in an `allow` zone; with `allow` alone, a target in
  none of the `allow` zones fails, a target in no zone included. `allowTypeOnly` exempts type-only
  imports (`true`, or globs the target must match), and `allowWithin: "src/*"` exempts an import
  inside the importer's own `src/<name>/`.
- `modules` restrict a package or builtin (`node:` prefix optional, subpaths included) to the
  `allow` zones; `allowTypeOnly: true` exempts type-only imports. A name that ends in `*` restricts
  every specifier that starts with the text before it, such as `@scope/*`, and `node:*` restricts
  every builtin.
- `globals` restrict a call to a global, bare or through `globalThis`, `self` or `window`.
- `unzoned` reports a file in a `from` zone that belongs to none of `zones`.
- `unresolved` reports a relative or self-referencing import that resolves to no file, a workspace
  import whose subpath no `exports` key lists, or one that a `null` key blocks, and a dynamic
  `import()`, `require()` or `import.meta.require()` whose specifier is computed. Bun's
  `import.meta.require` used as a value counts as computed too.
- `selfImports` reports an import of the importer's own package by name, which a relative path
  reaches without the `exports` map.

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
