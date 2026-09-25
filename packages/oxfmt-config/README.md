# @zgeoff/oxfmt-config

Shared [oxfmt](https://oxc.rs/docs/guide/usage/formatter) config: the house formatting options, the
import-sort groups (test libraries first, then builtins, packages, and relative imports), and
ignores for `agents/shared.md` and `AGENTS.md`, the files repo-sync delivers from zgeoff/tools.

## Usage

```sh
bun add -d @zgeoff/oxfmt-config oxfmt
```

oxfmt's JSON config has no `extends`, so the config ships as a JS module. Create `oxfmt.config.ts`
at the repo root, and keep the repo's own ignores there:

```ts
import config from '@zgeoff/oxfmt-config';
import { defineConfig } from 'oxfmt';

export default defineConfig({
  ...config,
  ignorePatterns: [...config.ignorePatterns, 'src/routeTree.gen.ts'],
});
```
