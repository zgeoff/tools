# Changelog

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/kysely-bun-sqlite@0.2.0...@zgeoff/kysely-bun-sqlite@0.3.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* **geo-1467:** a repo on this config fails lint on each type assertion other than as const until it removes the assertion or adds an approved disable comment. The kysely-bun-sqlite driver throws on a parameter that bun:sqlite would bind as NULL.

### Features

* **geo-1467:** add the typed helpers that hold the approved casts ([#247](https://github.com/zgeoff/tools/issues/247)) ([a9e17a4](https://github.com/zgeoff/tools/commit/a9e17a467df7ac6f2c85bda66c9609a99becaaf0))
* **geo-1467:** ban every type assertion other than as const ([#246](https://github.com/zgeoff/tools/issues/246)) ([50bde87](https://github.com/zgeoff/tools/commit/50bde87bdf36327f5b2e1b4f4183faae9cd5e1ac))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/kysely-bun-sqlite@0.1.0...@zgeoff/kysely-bun-sqlite@0.2.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1275:** @zgeoff/kysely-bun-sqlite exports buildBunSQLiteDriver(sqlite) in place of the
  BunSQLiteDriver class.

### Features

- **geo-1275:** add zgeoff/no-class and build tools' classes with factories
  ([#213](https://github.com/zgeoff/tools/issues/213))
  ([d186a0f](https://github.com/zgeoff/tools/commit/d186a0fd1d6c0544f36b19d3d87c0f3c8d34fd27))

## 0.1.0 (2026-10-17)

### Features

- **geo-393:** add @zgeoff/kysely-bun-sqlite, a Kysely dialect for bun:sqlite
  ([#163](https://github.com/zgeoff/tools/issues/163))
  ([877f58d](https://github.com/zgeoff/tools/commit/877f58d342c154936c50ac37ded70cc83a7fac77))
