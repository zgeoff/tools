# Changelog

## [0.4.3](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.4.2...@zgeoff/testing@0.4.3) (2026-11-28)


### Bug Fixes

* **testing:** prune stale templates from the template cache ([#779](https://github.com/zgeoff/tools/issues/779)) ([416a435](https://github.com/zgeoff/tools/commit/416a43535962128bcd51a5d1b036824c1cf76b9e))

## [0.4.2](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.4.1...@zgeoff/testing@0.4.2) (2026-11-21)


### Features

* **testing:** add a step size option to the clock runner ([#738](https://github.com/zgeoff/tools/issues/738)) ([f4ba87b](https://github.com/zgeoff/tools/commit/f4ba87b57776756120b82acd4e52c1b2d2309ae4))

## [0.4.1](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.4.0...@zgeoff/testing@0.4.1) (2026-11-21)


### Features

* **testing:** wait out real io in the clock and forward stub signals ([#736](https://github.com/zgeoff/tools/issues/736)) ([acfb92c](https://github.com/zgeoff/tools/commit/acfb92ca3acdb33cfe0f850e1522319dcca68a4f))

## [0.4.0](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.3.3...@zgeoff/testing@0.4.0) (2026-11-21)


### ⚠ BREAKING CHANGES

* **testing:** @zgeoff/testing/helpers no longer exists. Import each helper from its subpath: fs, git, mocks, process, bin, or the package root for waitFor, updateEnv and removeEnvOverrides.

### Code Refactoring

* **testing:** move tools onto the kit's subpaths and remove helpers ([#720](https://github.com/zgeoff/tools/issues/720)) ([bd1dbd3](https://github.com/zgeoff/tools/commit/bd1dbd315d99fca612d167851bc48b7f6c60ff31))

## [0.3.3](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.3.2...@zgeoff/testing@0.3.3) (2026-11-21)


### Features

* **testing:** add clock, server and fetch subpaths ([#718](https://github.com/zgeoff/tools/issues/718)) ([0a4f758](https://github.com/zgeoff/tools/commit/0a4f758f640778f3f848ca353df649b901e8f5ff))

## [0.3.2](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.3.1...@zgeoff/testing@0.3.2) (2026-11-21)


### Features

* **testing:** add the kit's core subpaths ([#716](https://github.com/zgeoff/tools/issues/716)) ([3155e30](https://github.com/zgeoff/tools/commit/3155e305969adb921bbe7fde2b6e2b72e154b865))

## [0.3.1](https://github.com/zgeoff/tools/compare/@zgeoff/testing@0.3.0...@zgeoff/testing@0.3.1) (2026-11-19)


### Bug Fixes

* run type-aware lint and typecheck on tsrs 0.25 fast mode ([#682](https://github.com/zgeoff/tools/issues/682)) ([cbdb98c](https://github.com/zgeoff/tools/commit/cbdb98c015528632b10456a5fdad787cef38e850))

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
