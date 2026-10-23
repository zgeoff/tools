# oxlint-config import zones

`zgeoff/import-zones` is the rule of the `zgeoff/*` plugin in `@zgeoff/oxlint-config` that fails an
import that crosses a module boundary the repo declares. The [config overview](./oxlint-config.md)
covers the rest of the config.

## Zones and boundaries

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

## Reuse outside lint

The rule judges only the imports that a file holds. A repo check that judges something else, such as
a dependency that a manifest declares, imports the rule's own reading from
`@zgeoff/oxlint-config/import-zones`. That entry exports `importZonesSchema`, the JSON schema of the
options, with an `ImportZonesOptions` type, and
`collectRefusingEdges(options, { from, to, typeOnly })`. The function returns each edge in `options`
that refuses an import of `to` from `from`, both paths relative to the repo root. It skips module
resolution, so `to` is the path that the rule would resolve the specifier to. The rule judges each
edge through the same function.
