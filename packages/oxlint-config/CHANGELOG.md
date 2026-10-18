# Changelog

## [0.2.9](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.8...@zgeoff/oxlint-config@0.2.9) (2026-10-18)


### Features

* **geo-1284:** extend zgeoff/import-zones for nixie and impz ([#184](https://github.com/zgeoff/tools/issues/184)) ([a6a08e2](https://github.com/zgeoff/tools/commit/a6a08e2a0da4ad050ab168653df348c6f7a4a17e))

## [0.2.8](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.7...@zgeoff/oxlint-config@0.2.8) (2026-10-18)

### Features

- **geo-1303:** add zgeoff/no-restricted-words to oxlint-config
  ([#186](https://github.com/zgeoff/tools/issues/186))
  ([46675b3](https://github.com/zgeoff/tools/commit/46675b3715b796f16962d993d2ffb7dfc48b12d8))

## [0.2.7](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.6...@zgeoff/oxlint-config@0.2.7) (2026-10-18)

### Features

- **oxlint-config:** ban file snapshots with zgeoff/no-file-snapshot
  ([#176](https://github.com/zgeoff/tools/issues/176))
  ([eae5e4f](https://github.com/zgeoff/tools/commit/eae5e4f101232c0fe4e9ea4654330e9c6d5bdffa))

## [0.2.6](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.5...@zgeoff/oxlint-config@0.2.6) (2026-10-17)

### Bug Fixes

- **geo-1241:** settle one-var, sort-vars and switch in the shared oxlint config
  ([#162](https://github.com/zgeoff/tools/issues/162))
  ([a90759f](https://github.com/zgeoff/tools/commit/a90759f0c5cb258c1c41a2da70a2cfcee187aff3))

## [0.2.5](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.4...@zgeoff/oxlint-config@0.2.5) (2026-10-17)

### Bug Fixes

- **geo-1222:** exempt .claude-check.ts mod checks from max-lines
  ([#158](https://github.com/zgeoff/tools/issues/158))
  ([68253fd](https://github.com/zgeoff/tools/commit/68253fdb548be77faa7ab66053cf4bc536a2a551))

## [0.2.4](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.3...@zgeoff/oxlint-config@0.2.4) (2026-10-17)

### Bug Fixes

- **oxlint-config:** exempt .test.tsx suites from max-lines too
  ([#144](https://github.com/zgeoff/tools/issues/144))
  ([b29ad08](https://github.com/zgeoff/tools/commit/b29ad08ff8a1464ee544e919216206ca6eebaaeb))

## [0.2.3](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.2...@zgeoff/oxlint-config@0.2.3) (2026-10-17)

### Features

- **oxlint-config:** share common verbs and refuse comment rule overrides
  ([#138](https://github.com/zgeoff/tools/issues/138))
  ([cfee9c0](https://github.com/zgeoff/tools/commit/cfee9c02d39296e6966256bbcf0869ac522612bc))

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.1...@zgeoff/oxlint-config@0.2.2) (2026-10-17)

### Features

- **oxlint-config:** set the decided size limits and turn off the rules repos switched off by hand
  ([#136](https://github.com/zgeoff/tools/issues/136))
  ([5e2abc8](https://github.com/zgeoff/tools/commit/5e2abc83913cdda3336d82d83fb8ae1b857b8cb3))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.0...@zgeoff/oxlint-config@0.2.1) (2026-10-11)

### Features

- **oxlint-config:** add zgeoff/import-zones for module boundaries
  ([#116](https://github.com/zgeoff/tools/issues/116))
  ([4d1dac8](https://github.com/zgeoff/tools/commit/4d1dac8718f0083534207e5059826ab1590d1021))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.1.0...@zgeoff/oxlint-config@0.2.0) (2026-10-11)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/test-beside-module reports every test file with no module beside it.
  Move the test, or add a file-level disable comment with a reason.

### Features

- **oxlint-config:** require each test file to sit beside its module
  ([#111](https://github.com/zgeoff/tools/issues/111))
  ([e71dd72](https://github.com/zgeoff/tools/commit/e71dd72c4f2ba61e4f7d463909d63059638da7f5))

## [0.1.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.6...@zgeoff/oxlint-config@0.1.0) (2026-09-02)

### ⚠ BREAKING CHANGES

- **oxlint-config:** zgeoff/no-single-line-jsdoc no longer exists; a consumer that names it must
  drop the entry.

### Features

- **oxlint-config:** ban JSDoc blocks and cap line-comment runs
  ([#78](https://github.com/zgeoff/tools/issues/78))
  ([98319f3](https://github.com/zgeoff/tools/commit/98319f3a93e6f3991cb82bf74524effd5adb0fad))

## [0.0.6](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.5...@zgeoff/oxlint-config@0.0.6) (2026-07-15)

### Bug Fixes

- **oxlint-config:** treat a digit as a camelCase boundary after a verb
  ([#72](https://github.com/zgeoff/tools/issues/72))
  ([f803bfa](https://github.com/zgeoff/tools/commit/f803bfa2e60375d000e23d8877c417480b7c9f9c))

## [0.0.5](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.4...@zgeoff/oxlint-config@0.0.5) (2026-07-15)

### Features

- **oxlint-config:** add function-verb rule enforcing the naming taxonomy
  ([#70](https://github.com/zgeoff/tools/issues/70))
  ([c51c848](https://github.com/zgeoff/tools/commit/c51c8482bd92eaa26d621cce620a06f222abe010))

## [0.0.4](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.3...@zgeoff/oxlint-config@0.0.4) (2026-07-10)

### Features

- **oxlint-config:** add no-single-line-jsdoc rule with autofix
  ([#57](https://github.com/zgeoff/tools/issues/57))
  ([fca1eab](https://github.com/zgeoff/tools/commit/fca1eab39083b54aacf7de4e27e48c1f7dcc0954))

## [0.0.3](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.2...@zgeoff/oxlint-config@0.0.3) (2026-07-09)

### Features

- **oxlint-config:** ban awaits hidden in conditions and logical chains
  ([#48](https://github.com/zgeoff/tools/issues/48))
  ([46ea0d8](https://github.com/zgeoff/tools/commit/46ea0d85fa6ab377472cbc52b6f13a3a8f500f5e))

## [0.0.2](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.0.1...@zgeoff/oxlint-config@0.0.2) (2026-07-07)

### Features

- **oxlint-config:** publish shareable lint config as @zgeoff/oxlint-config
  ([#38](https://github.com/zgeoff/tools/issues/38))
  ([daf3d91](https://github.com/zgeoff/tools/commit/daf3d91befa10bcc1cd12e7ce8168b7530fed588))
