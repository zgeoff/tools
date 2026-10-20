# Changelog

## [0.3.1](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.3.0...@zgeoff/format-codemod@0.3.1) (2026-10-20)


### Bug Fixes

* **deps:** update oxc-parser to v0.154.0 ([#259](https://github.com/zgeoff/tools/issues/259)) ([2b4e200](https://github.com/zgeoff/tools/commit/2b4e2002e6fa28ac6022278f6be0450a32995927))

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.2.0...@zgeoff/format-codemod@0.3.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1437:** zgeoff/function-verb no longer accepts the verbs option, and the shipped config
  turns on zgeoff/verb-contract.

### Features

- **geo-1437:** name functions by the role table and add zgeoff/verb-contract
  ([#218](https://github.com/zgeoff/tools/issues/218))
  ([8b4e3fb](https://github.com/zgeoff/tools/commit/8b4e3fbd891cb4040f3325ed4734468ceab1d50a))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.1.1...@zgeoff/format-codemod@0.2.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1275:** @zgeoff/kysely-bun-sqlite exports buildBunSQLiteDriver(sqlite) in place of the
  BunSQLiteDriver class.

### Features

- **geo-1275:** add zgeoff/no-class and build tools' classes with factories
  ([#213](https://github.com/zgeoff/tools/issues/213))
  ([d186a0f](https://github.com/zgeoff/tools/commit/d186a0fd1d6c0544f36b19d3d87c0f3c8d34fd27))

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.1.0...@zgeoff/format-codemod@0.1.1) (2026-10-18)

### Bug Fixes

- **deps:** update oxc-parser to v0.153.0 ([#172](https://github.com/zgeoff/tools/issues/172))
  ([a5c68e9](https://github.com/zgeoff/tools/commit/a5c68e937330cc66983e1295b45b4b51df6d6d76))

## [0.1.0](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.8...@zgeoff/format-codemod@0.1.0) (2026-09-02)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/no-single-line-jsdoc no longer exists; a consumer that names it must
  drop the entry.

### Features

- **oxlint-config:** ban JSDoc blocks and cap line-comment runs
  ([#78](https://github.com/zgeoff/tools/issues/78))
  ([98319f3](https://github.com/zgeoff/tools/commit/98319f3a93e6f3991cb82bf74524effd5adb0fad))

## [0.0.8](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.7...@zgeoff/format-codemod@0.0.8) (2026-07-21)

### Features

- **format-codemod:** give expect statements their own padding kind
  ([#74](https://github.com/zgeoff/tools/issues/74))
  ([b68662f](https://github.com/zgeoff/tools/commit/b68662f4a367cb89d3d45350d863a0d1f2560d88))

## [0.0.7](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.6...@zgeoff/format-codemod@0.0.7) (2026-07-15)

### Features

- **oxlint-config:** add function-verb rule enforcing the naming taxonomy
  ([#70](https://github.com/zgeoff/tools/issues/70))
  ([c51c848](https://github.com/zgeoff/tools/commit/c51c8482bd92eaa26d621cce620a06f222abe010))

## [0.0.6](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.5...@zgeoff/format-codemod@0.0.6) (2026-07-09)

### Features

- **format-codemod:** collapse blank lines no padding rule requires
  ([#45](https://github.com/zgeoff/tools/issues/45))
  ([6da9013](https://github.com/zgeoff/tools/commit/6da90139cf4fb3b29d6215d06493b8ce5e0ce6a7))

## [0.0.5](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.4...@zgeoff/format-codemod@0.0.5) (2026-07-08)

### Features

- **format-codemod:** read ignore globs from a .formatignore file
  ([#43](https://github.com/zgeoff/tools/issues/43))
  ([b453ffc](https://github.com/zgeoff/tools/commit/b453ffcdb8d143cd27198fbaebd3c0cd2b411a87))

## [0.0.4](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.3...@zgeoff/format-codemod@0.0.4) (2026-07-07)

### Features

- **lint:** replace prefer-destructuring with house destructuring policy
  ([#36](https://github.com/zgeoff/tools/issues/36))
  ([893e8ce](https://github.com/zgeoff/tools/commit/893e8ce17151fa87817278b8f1a67158012d9911))

## [0.0.3](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.2...@zgeoff/format-codemod@0.0.3) (2026-07-07)

### Features

- **format-codemod:** pad using-declaration and awaitedness boundaries
  ([#33](https://github.com/zgeoff/tools/issues/33))
  ([1b8ff92](https://github.com/zgeoff/tools/commit/1b8ff920af639976df9094a2a61335105ee800f5))

## [0.0.2](https://github.com/zgeoff/tools/compare/@zgeoff/format-codemod@0.0.1...@zgeoff/format-codemod@0.0.2) (2026-07-05)

### Features

- **format-codemod:** add repeatable --ignore flag
  ([#31](https://github.com/zgeoff/tools/issues/31))
  ([699d27d](https://github.com/zgeoff/tools/commit/699d27d8826f5d48b5bea702d85ae08a1ad494ba))

### Bug Fixes

- **format-codemod:** never pad between adjacent import declarations
  ([#28](https://github.com/zgeoff/tools/issues/28))
  ([480fbcf](https://github.com/zgeoff/tools/commit/480fbcf983b2f9fa014f1b9dc36179d791a95735))
