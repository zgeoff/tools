# Changelog

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/checks@0.2.1...@zgeoff/checks@0.2.2) (2026-10-20)

### Features

- **geo-1310:** add a docs check that runs the docs-writing scripts
  ([#243](https://github.com/zgeoff/tools/issues/243))
  ([9202181](https://github.com/zgeoff/tools/commit/9202181bb5d85323c21e6c8bb1bc4ecced5b6147))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/checks@0.2.0...@zgeoff/checks@0.2.1) (2026-10-20)

### Features

- **geo-1311:** add a workflows check that runs actionlint
  ([#238](https://github.com/zgeoff/tools/issues/238))
  ([4e90068](https://github.com/zgeoff/tools/commit/4e90068397b1e2b11969fc1cd8e7dfb40211c6e8))
- **geo-1312:** add a commits check that runs commitlint
  ([#239](https://github.com/zgeoff/tools/issues/239))
  ([9329ed7](https://github.com/zgeoff/tools/commit/9329ed727023214e9885fbd6d237987d3ca7a7fc))
- **geo-1313:** add a local-paths check for home and host leaks
  ([#241](https://github.com/zgeoff/tools/issues/241))
  ([13a0010](https://github.com/zgeoff/tools/commit/13a00106a17031a89cfa3701e7630263ef50ba4a))

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/checks@0.1.1...@zgeoff/checks@0.2.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1437:** zgeoff/function-verb no longer accepts the verbs option, and the shipped config
  turns on zgeoff/verb-contract.

### Features

- **geo-1437:** name functions by the role table and add zgeoff/verb-contract
  ([#218](https://github.com/zgeoff/tools/issues/218))
  ([8b4e3fb](https://github.com/zgeoff/tools/commit/8b4e3fbd891cb4040f3325ed4734468ceab1d50a))

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/std bumped to 0.2.0

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/checks@0.1.0...@zgeoff/checks@0.1.1) (2026-10-18)

### Bug Fixes

- **geo-1381:** follow shell sources across batches and run check on PRs
  ([#201](https://github.com/zgeoff/tools/issues/201))
  ([587e31d](https://github.com/zgeoff/tools/commit/587e31d4b3cdc3ba04f75b7b1cd0b4b66a8ca2c8))

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/std bumped to 0.1.1

## 0.1.0 (2026-10-18)

### Features

- **geo-1309:** add the zgeoff-check runner and its shell check
  ([#188](https://github.com/zgeoff/tools/issues/188))
  ([a6909f7](https://github.com/zgeoff/tools/commit/a6909f714f5aaa189e47bc06b2cd2d03b0fbf91e))
