<div align="center">
  <h1>@zgeoff/oxlint-config</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/oxlint-config"><img src="https://img.shields.io/npm/v/@zgeoff/oxlint-config" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/architecture/oxlint-config.md">Documentation</a>
  </p>
</div>

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments, awaits hidden inside a control-flow condition or a `&&`/`||`/`??` chain, every
`switch` statement, every JSDoc block, any run of more than three line comments, a type claim with
no `as`, and a repo config that loosens a comment rule or a type-assertion rule.

## Install

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

## Plugins and type-aware rules

- The config enables the `typescript`, `unicorn`, `oxc`, `import`, and `promise` plugins and loads
  `@stylistic/eslint-plugin` through `jsPlugins`. oxlint resolves `jsPlugins` specifiers from the
  project root, not from the config file that names them — so `@stylistic/eslint-plugin` must be a
  direct dependency of the consuming project. Hoisting package managers (bun's default linker, npm)
  resolve it transitively anyway, but isolated layouts (pnpm, `bun install --linker isolated`) fail
  with `Cannot find module '@stylistic/eslint-plugin'` unless it's installed directly.
- Type-aware rules activate under `oxlint --type-aware`, which needs a type-aware backend: install
  `oxlint-tsgolint`, or install `@maschwenk/tsrslint` and set `OXLINT_TSGOLINT_PATH` to the path
  that its `tsrslint-path` command prints. The config works without a backend.

## Rules

- Type assertions: every `as` other than `as const` fails, and `zgeoff/no-hidden-cast` reports a
  type claim with no `as`. See
  [type assertions](../../docs/architecture/oxlint-config.md#type-assertions).
- Comments: `zgeoff/no-jsdoc` and `zgeoff/max-consecutive-line-comments` keep comments to the reason
  for a line. See
  [the comment rules](../../docs/architecture/oxlint-config.md#zgeoffno-jsdoc-and-zgeoffmax-consecutive-line-comments).
- Code style: function verbs, verb contracts, module order, abbreviated names and classes. See
  [code-style rules](../../docs/architecture/oxlint-config-code-style.md).
- Test files: a test sits beside its module, holds only `setupTest()` and its tests, uses inline
  snapshots, keeps each timeout within its lane's limit, and waits on a condition, never a sleep.
  See [test-file rules](../../docs/architecture/oxlint-config-tests.md).
- Import boundaries: `zgeoff/import-zones` fails an import that crosses a declared zone boundary.
  See [import zones](../../docs/architecture/oxlint-config-import-zones.md).

## Configuration

Every rule runs as the config ships it, and `zgeoff/no-comment-rule-override` keeps a repo from
loosening the comment and type-assertion rules. `zgeoff/no-restricted-words` and
`zgeoff/import-zones` stay off until a repo configures them;
[the config overview](../../docs/architecture/oxlint-config.md) and
[import zones](../../docs/architecture/oxlint-config-import-zones.md) hold their options.

## Documentation

The [oxlint-config docs](../../docs/architecture/oxlint-config.md) explain each rule.
