# @zgeoff/oxlint-config

Shareable [oxlint](https://oxc.rs/docs/guide/usage/linter.html) config: every category at `error`,
restriction-rule cherry-picks, comment-style enforcement via `@stylistic`, and a bundled JS plugin
(`zgeoff/*` rules) banning AST shapes no native oxlint rule can express — top-level arrows, nested
function declarations, bare named exports, destructured and inline-typed parameters, ternary and
await arguments.

## Usage

```sh
bun add -d @zgeoff/oxlint-config oxlint
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

## Notes

- The config enables the `typescript`, `unicorn`, `oxc`, `import`, and `promise` plugins and loads
  `@stylistic/eslint-plugin` (a dependency of this package) through `jsPlugins`.
- Type-aware rules activate under `oxlint --type-aware` (requires `oxlint-tsgolint`); the config
  works without it.
