## Type checking

Type errors are checked by two engines on purpose: `lint:type-aware` includes tsgolint's
experimental `--type-check` (fast, run it locally), while `typecheck` runs real `tsc` per package
(ground truth). CI runs both until tsgolint earns trust; if they ever disagree, believe `tsc`.

## Workspace dependencies

- Shared versions live in the root catalog; workspace packages reference them via `catalog:`.
