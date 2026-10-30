# Changelog

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.2.1...@zgeoff/bun-test-extended@0.2.2) (2026-10-30)


### Features

* **oxlint-config:** add the test-shape rule for bun:test files ([#384](https://github.com/zgeoff/tools/issues/384)) ([c35150f](https://github.com/zgeoff/tools/commit/c35150ff41183949dcfd24eb1c3145d2bef3c4f7))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.2.0...@zgeoff/bun-test-extended@0.2.1) (2026-10-20)

### Features

- **geo-1467:** type bun's core asymmetric matchers as never
  ([#248](https://github.com/zgeoff/tools/issues/248))
  ([ebd22cf](https://github.com/zgeoff/tools/commit/ebd22cf65d638a14a728398f20a3e0e008d00cb0))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.1.0...@zgeoff/bun-test-extended@0.2.0) (2026-10-11)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/test-beside-module reports every test file with no module beside it.
  Move the test, or add a file-level disable comment with a reason.

### Features

- **oxlint-config:** require each test file to sit beside its module
  ([#111](https://github.com/zgeoff/tools/issues/111))
  ([e71dd72](https://github.com/zgeoff/tools/commit/e71dd72c4f2ba61e4f7d463909d63059638da7f5))

## [0.1.0](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.0.4...@zgeoff/bun-test-extended@0.1.0) (2026-09-02)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/no-single-line-jsdoc no longer exists; a consumer that names it must
  drop the entry.

### Features

- **oxlint-config:** ban JSDoc blocks and cap line-comment runs
  ([#78](https://github.com/zgeoff/tools/issues/78))
  ([98319f3](https://github.com/zgeoff/tools/commit/98319f3a93e6f3991cb82bf74524effd5adb0fad))

## [0.0.4](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.0.3...@zgeoff/bun-test-extended@0.0.4) (2026-07-21)

### Features

- **format-codemod:** give expect statements their own padding kind
  ([#74](https://github.com/zgeoff/tools/issues/74))
  ([b68662f](https://github.com/zgeoff/tools/commit/b68662f4a367cb89d3d45350d863a0d1f2560d88))

## [0.0.3](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.0.2...@zgeoff/bun-test-extended@0.0.3) (2026-07-09)

### Bug Fixes

- **bun-test-extended:** ship a declaration so the types entry resolves
  ([#50](https://github.com/zgeoff/tools/issues/50))
  ([eb5115e](https://github.com/zgeoff/tools/commit/eb5115e5950bfc83ab4092cddc0d027f09c589cc))

## [0.0.2](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-extended@0.0.1...@zgeoff/bun-test-extended@0.0.2) (2026-07-04)

### Features

- make bun-test-extended publishable ([#19](https://github.com/zgeoff/tools/issues/19))
  ([15d4f74](https://github.com/zgeoff/tools/commit/15d4f74e5ccde9a56dc3a15ff2adb86807fcd1ad))
