# Changelog

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.2.1...@zgeoff/testing@0.3.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* **oxlint-config:** a repo whose packages break the cap, keep a synonym folder or import a feature from utils/ fails lint until it folds them or lists them in pending.

### Features

* **oxlint-config:** add zgeoff/feature-folders to cap src/ roots ([#548](https://github.com/zgeoff/tools/issues/548)) ([fd9589d](https://github.com/zgeoff/tools/commit/fd9589d623094edd0eed5b62ef3c94d8a50b27b6))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.2.0...@zgeoff/testing@0.2.1) (2026-11-05)


### Bug Fixes

* **sync:** ask a delivered import to name its file ([#518](https://github.com/zgeoff/tools/issues/518)) ([a0db58c](https://github.com/zgeoff/tools/commit/a0db58cc79f5778e12332e925ef17b215d6ca2e2))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.1.0...@zgeoff/testing@0.2.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **testing:** @zgeoff/std no longer exports ./test-utils/*; import the test helpers from @zgeoff/testing/helpers.

### Features

* **testing:** add the helpers subpath and move shared test helpers ([#490](https://github.com/zgeoff/tools/issues/490)) ([28ca2f3](https://github.com/zgeoff/tools/commit/28ca2f382ca48cefb3f393255c8d51a77606d44c))

## 0.1.0 (2026-11-03)

### Features

- **testing:** add the @zgeoff/testing package ([#473](https://github.com/zgeoff/tools/issues/473))
  ([5277195](https://github.com/zgeoff/tools/commit/527719528ee223b97babb8cd12bac7959a4d255a))
