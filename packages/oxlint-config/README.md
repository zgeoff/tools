# @zgeoff/oxlint-config

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments, awaits hidden inside a control-flow condition or a `&&`/`||`/`??` chain, every
`switch` statement, every JSDoc block, any run of more than three line comments, and a repo config
that loosens either comment rule.

The plugin's other rules each check one convention. `zgeoff/function-verb` bans the vague and
near-synonym verbs of the shared function-naming rules, `zgeoff/verb-contract` checks the promise
each role-table verb makes, `zgeoff/module-order` keeps a file in the shared module order,
`zgeoff/test-beside-module` keeps each test file beside the module it tests, `zgeoff/import-zones`
fails an import that crosses a module boundary the repo declares, `zgeoff/no-restricted-words` keeps
the words in its `words` option out of a path's text, `zgeoff/no-abbreviated-names` reports each
abbreviated value name it lists with its full word, `zgeoff/no-file-snapshot` bans file snapshots,
`zgeoff/setup-test-only` keeps a test file's module level to `setupTest()` and its tests, and
`zgeoff/no-class` bans every class but a custom error.

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

The rule reports a function, method, or function-valued variable or property whose name starts with
a banned verb, and it names the role-table verb to use instead (`fetchUser` → use `read`). It also
reports a bare template prefix, such as a function named `on`. A name that does not start with a
lowercase letter passes. The `exemptNames` option lists names that a library contract fixes:

```jsonc
{
  "rules": {
    "zgeoff/function-verb": ["error", { "exemptNames": ["execute"] }],
  },
}
```

## `zgeoff/verb-contract`

The rule reads each named function's verb and reports a body that breaks the verb's promise. It
reads declared return types, since it runs without type information. It runs three checks:

- **No I/O behind a no-I/O verb.** A function named with `is`, `has`, `can`, `should`, `build`,
  `parse`, `format`, `render`, `pick`, `find`, `get`, `collect` or `to` must not be async or await.
  It must not call `fs`, `child_process`, `Bun.spawn`, `Bun.file`, `Bun.write`, Bun's `$` shell
  under any import form, `fetch` or a Kysely `execute`, and must not read `process.env` or
  `Bun.env`. It must not call a function whose verb is on the rule's effectful list, such as
  `readConfig` or `ctx.writeText`. That check skips a callee imported from a package, a global, a
  bare method name such as `map.set`, and a method on a value the function declares itself. I/O
  inside an unnamed callback counts against the named function around it. A local alias of an I/O
  source, such as `const read = fs.readFileSync` or `const { spawn } = Bun`, counts as that source,
  and a local alias of a package's callee is skipped as the callee is.
- **Predicates return a boolean.** A function named with `is`, `has`, `can`, `should` or `probe`
  that declares a return type declares `boolean`, a type predicate, or a promise of one. A function
  that declares `boolean` and does no I/O starts with one of the four no-I/O predicate verbs. That
  check skips an effectful verb or `try`, whose function may return a success flag, and the
  framework prefixes `use`, `on` and `handle`.
- **`find` can miss, and `get` cannot.** A declared `find` return type holds `null`, `undefined`,
  `void`, `unknown` or `any`. A `get` function neither declares `null` or `undefined` nor returns
  either one as a literal or a bare `return`. Every check follows the file's own type aliases, and a
  type the rule cannot see, such as an import, a type parameter or an indexed access, never fails a
  check.

A test in this package reads the role table in the shared code-style skill and fails when the
skill's no-I/O verbs and the rule's differ in either direction.

## `zgeoff/module-order`

The rule checks the module order of the shared code-style skill in each file with a primary export.
The primary export is the default export, else the export whose name the file name kebab-cases, else
the file's only exported function or const. A file without one, such as a test file, passes. The
rule reports three breaks:

- **A helper first.** A private function sits above the primary export.
- **A helper out of composition order.** The helpers below the primary export follow it depth-first,
  each in the order its first reference appears.
- **A declaration away from its first use.** A const, type alias, interface or enum sits below its
  first use, or a helper sits between it and that use. A declaration the primary export uses may sit
  just above it.

The config's `import/first` rule reports an import after other code, so this rule leaves imports
alone. The rule leaves a const unchecked when a helper that runs as the module loads reads it,
because the const has to sit above the code that calls that helper.

`--fix` moves each declaration it can move without a change in behaviour, with the comments above
it, in one pass. A function declaration is hoisted and a type has no value, so both always move. A
const moves only when every use sits in a function body that runs after the module loads, and its
value is static. A static value runs no code and reads nothing that load-time code can change: a
literal, a function, or an array, object, operator, `new Set`, `new Map` or `new RegExp` over static
values, with an import only as a copied value. Any other const stays where it is, and the rule still
reports it. The fix makes no change when a move would put a statement that ends without a semicolon
before one that opens with a bracket or an operator.

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
`test.skipIf` or `test.if`, or a chain of them, with `test` under its local alias when the
`bun:test` import renames it. It reports every other statement: a `let`, a `var`, a class, an enum,
a second function, an export, and a call such as `beforeEach(...)`. The message holds the three ways
out of a helper: inline it, swap it for a registered matcher, or move it to the shared test utils
with tests of its own.

A module-level `const` passes only as a skip gate: a declarator that binds at least one name, each
binding read, and read only at collection time, inside an argument of the test runner's `skipIf` or
inside the initializer of another gate. The runner is `test` as `bun:test` exports it, under its
local alias if the import renames it, or a chain of its modifiers, so `matrix.skipIf(rows)` is not a
gate read. A file that imports no `test` uses the global one, unless an import or a module-level
declaration of its own takes the name `test`. A read inside a function never counts, so a `skipIf`
in `setupTest()` or a test body leaves its `const` reported. A gate derived from an awaited probe
passes beside the probe, in the same declaration or its own, but consts that only read each other
never reach a `skipIf` and report. A `const` that nothing reads reports too, and so does a
declarator that binds nothing, such as `const {} = registerHooks()`. The rule does not check the
comment that the skill asks a gate to carry.

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

## `zgeoff/no-class`

Objects come from factory functions, as the code-style skill requires, so the rule reports every
class declaration and class expression, in test files too. A custom error stays a class, because
`instanceof` checks and stack traces need one. The rule counts a class as a custom error when its
`extends` clause holds `Error` or another name that ends in `Error`, bare or as a member such as
`errors.BrewError`. It does not check the name of the class itself, and it reports a superclass
reached through a computed member, such as `errors['BrewError']`.

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
