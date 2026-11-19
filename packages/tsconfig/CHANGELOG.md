# Changelog

## [2.0.1](https://github.com/zgeoff/tools/compare/@zgeoff/tsconfig@2.0.0...@zgeoff/tsconfig@2.0.1) (2026-11-19)


### Bug Fixes

* run type-aware lint and typecheck on tsrs 0.25 fast mode ([#682](https://github.com/zgeoff/tools/issues/682)) ([cbdb98c](https://github.com/zgeoff/tools/commit/cbdb98c015528632b10456a5fdad787cef38e850))

## [2.0.0](https://github.com/zgeoff/tools/compare/@zgeoff/tsconfig@1.0.0...@zgeoff/tsconfig@2.0.0) (2026-10-11)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/test-beside-module reports every test file with no module beside it.
  Move the test, or add a file-level disable comment with a reason.

### Features

- **oxlint-config:** require each test file to sit beside its module
  ([#111](https://github.com/zgeoff/tools/issues/111))
  ([e71dd72](https://github.com/zgeoff/tools/commit/e71dd72c4f2ba61e4f7d463909d63059638da7f5))

## 1.0.0 (2026-09-25)

### Features

- **tsconfig:** add shared base and react TypeScript configs
  ([#81](https://github.com/zgeoff/tools/issues/81))
  ([894ecf2](https://github.com/zgeoff/tools/commit/894ecf2cdb3fec5e0637098e4720800061c48b3e))
