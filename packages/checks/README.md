# @zgeoff/checks

Deprecated: tools no longer builds or publishes this package, and its last release on npm is 0.2.4.

The checks that its `zgeoff-check` runner ran are each a step of their own:

- In CI, the [shared pull-request checks](../../.github/workflows/bun-checks.yml) run them as the
  `Check shell`, `Check docs`, `Check workflows`, `Check commits` and `Check local paths` steps.
- Before a push, the [pre-push baseline](../../docs/architecture/pre-push-baseline.md) runs them as
  the `shell`, `docs`, `workflows`, `commits` and `local-paths` jobs.

A repo that takes both drops its `check` script and its `@zgeoff/checks` devDependency.
