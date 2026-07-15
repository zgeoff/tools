# @zgeoff/oxlint-config

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments, awaits hidden inside a control-flow condition or a `&&`/`||`/`??` chain, and
single-line `/** … */` blocks (auto-fixed to multi-line; inline `@type`/`@lends` casts exempt).
`zgeoff/function-verb` enforces the function-naming taxonomy from the shared agent guidelines.

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

## Notes

- The config enables the `typescript`, `unicorn`, `oxc`, `import`, and `promise` plugins and loads
  `@stylistic/eslint-plugin` through `jsPlugins`. oxlint resolves `jsPlugins` specifiers from the
  project root, not from the config file that names them — so `@stylistic/eslint-plugin` must be a
  direct dependency of the consuming project. Hoisting package managers (bun's default linker, npm)
  resolve it transitively anyway, but isolated layouts (pnpm, `bun install --linker isolated`) fail
  with `Cannot find module '@stylistic/eslint-plugin'` unless it's installed directly.
- Type-aware rules activate under `oxlint --type-aware` (requires `oxlint-tsgolint`); the config
  works without it.
