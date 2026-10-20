# Changelog

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/std@0.2.0...@zgeoff/std@0.3.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* **geo-1467:** a repo on this config fails lint on each type assertion other than as const until it removes the assertion or adds an approved disable comment. The kysely-bun-sqlite driver throws on a parameter that bun:sqlite would bind as NULL.

### Features

* **geo-1467:** add the typed helpers that hold the approved casts ([#247](https://github.com/zgeoff/tools/issues/247)) ([a9e17a4](https://github.com/zgeoff/tools/commit/a9e17a467df7ac6f2c85bda66c9609a99becaaf0))
* **geo-1467:** ban every type assertion other than as const ([#246](https://github.com/zgeoff/tools/issues/246)) ([50bde87](https://github.com/zgeoff/tools/commit/50bde87bdf36327f5b2e1b4f4183faae9cd5e1ac))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/std@0.1.1...@zgeoff/std@0.2.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1437:** zgeoff/function-verb no longer accepts the verbs option, and the shipped config
  turns on zgeoff/verb-contract.

### Features

- **geo-1437:** name functions by the role table and add zgeoff/verb-contract
  ([#218](https://github.com/zgeoff/tools/issues/218))
  ([8b4e3fb](https://github.com/zgeoff/tools/commit/8b4e3fbd891cb4040f3325ed4734468ceab1d50a))

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/std@0.1.0...@zgeoff/std@0.1.1) (2026-10-18)

### Bug Fixes

- **geo-1381:** follow shell sources across batches and run check on PRs
  ([#201](https://github.com/zgeoff/tools/issues/201))
  ([587e31d](https://github.com/zgeoff/tools/commit/587e31d4b3cdc3ba04f75b7b1cd0b4b66a8ca2c8))

## 0.1.0 (2026-10-17)

### Features

- **exact-optional:** add toExactOptional for exactOptionalPropertyTypes
  ([#141](https://github.com/zgeoff/tools/issues/141))
  ([06bc2ee](https://github.com/zgeoff/tools/commit/06bc2ee79fc893ce070ccbefb04e8af9b8480f0d))
