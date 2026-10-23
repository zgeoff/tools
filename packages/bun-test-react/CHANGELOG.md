# Changelog

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-react@0.2.1...@zgeoff/bun-test-react@0.2.2) (2026-10-23)


### Bug Fixes

* **bun-test-react:** move to happy-dom 21.0.4 for a code-execution fix ([#322](https://github.com/zgeoff/tools/issues/322)) ([cb45e85](https://github.com/zgeoff/tools/commit/cb45e8567a4475510e63f00eddbcc7e0c3177d4e))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-react@0.2.0...@zgeoff/bun-test-react@0.2.1) (2026-10-17)

### Features

- **oxlint-config:** set the decided size limits and turn off the rules repos switched off by hand
  ([#136](https://github.com/zgeoff/tools/issues/136))
  ([5e2abc8](https://github.com/zgeoff/tools/commit/5e2abc83913cdda3336d82d83fb8ae1b857b8cb3))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/bun-test-react@0.1.0...@zgeoff/bun-test-react@0.2.0) (2026-10-11)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/test-beside-module reports every test file with no module beside it.
  Move the test, or add a file-level disable comment with a reason.

### Features

- **oxlint-config:** require each test file to sit beside its module
  ([#111](https://github.com/zgeoff/tools/issues/111))
  ([e71dd72](https://github.com/zgeoff/tools/commit/e71dd72c4f2ba61e4f7d463909d63059638da7f5))

## 0.1.0 (2026-09-25)

### Features

- **bun-test-react:** add bun test preloads for react client code
  ([#89](https://github.com/zgeoff/tools/issues/89))
  ([530003b](https://github.com/zgeoff/tools/commit/530003bcb72ff5c7623b277dd25b09f983cef162))
