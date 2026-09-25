# @zgeoff/tsconfig

Shared strict TypeScript configs for Bun repos. Both configs extend
[`@tsconfig/strictest`](https://github.com/tsconfig/bases) and type-check only (`noEmit`): Bun or a
bundler runs the TypeScript, so `module` is `Preserve` and `moduleResolution` is `bundler`.

| Config       | For                  | Adds to the base                           |
| ------------ | -------------------- | ------------------------------------------ |
| `base.json`  | CLIs, services, libs | —                                          |
| `react.json` | React apps and libs  | the DOM libs and the automatic JSX runtime |

## Usage

```sh
bun add -d @zgeoff/tsconfig typescript
```

```jsonc
{
  "extends": "@zgeoff/tsconfig/base.json",
  "compilerOptions": {
    "types": ["bun"],
  },
  "include": ["src/**/*.ts"],
}
```

Keep `include`, `exclude`, `rootDir` and `types` in the repo's own config: TypeScript resolves those
paths relative to the file that sets them, so a shared config cannot set them for you.
