# Changelog

## [0.2.11](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.10...@zgeoff/skill-gate@0.2.11) (2026-10-31)

### Features

- **agent-hooks:** run every agent hook behind one start-up stub
  ([#395](https://github.com/zgeoff/tools/issues/395))
  ([ef24054](https://github.com/zgeoff/tools/commit/ef240545b93a9e524a810596ded9183d1293f665))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/agent-hooks bumped to 0.1.1

## [0.2.10](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.9...@zgeoff/skill-gate@0.2.10) (2026-10-30)

### Bug Fixes

- **skill-gate:** block every call but a read-only list without the gate
  ([#396](https://github.com/zgeoff/tools/issues/396))
  ([5ce2b20](https://github.com/zgeoff/tools/commit/5ce2b201cc0e2a9f6b600eb4ebaaf6b36caab9b1))

## [0.2.9](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.8...@zgeoff/skill-gate@0.2.9) (2026-10-26)

### Bug Fixes

- **skill-gate:** run the hook with bun --no-install
  ([#341](https://github.com/zgeoff/tools/issues/341))
  ([1d22a8f](https://github.com/zgeoff/tools/commit/1d22a8f58929ede5906a3499eb9d62260e46c4f0))

## [0.2.8](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.7...@zgeoff/skill-gate@0.2.8) (2026-10-25)

### Features

- **skill-gate:** gate codex edits and tool calls
  ([#334](https://github.com/zgeoff/tools/issues/334))
  ([9021438](https://github.com/zgeoff/tools/commit/9021438245948172449ec9ed063656aa7872cb65))

## [0.2.7](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.6...@zgeoff/skill-gate@0.2.7) (2026-10-24)

### Features

- **docs-writing:** set readme limits by path and add the spike shape
  ([#329](https://github.com/zgeoff/tools/issues/329))
  ([cdc7a21](https://github.com/zgeoff/tools/commit/cdc7a2191fb5bb3ae0ce7317a3a57abb3dc00365))

## [0.2.6](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.5...@zgeoff/skill-gate@0.2.6) (2026-10-22)

### Bug Fixes

- **skill-gate:** read a workflow subagent's transcript
  ([#302](https://github.com/zgeoff/tools/issues/302))
  ([3e10712](https://github.com/zgeoff/tools/commit/3e10712176c95d0bf66e4f462cda13291e8017ae))

## [0.2.5](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.4...@zgeoff/skill-gate@0.2.5) (2026-10-22)

### Features

- **skill-gate:** gate a tool call on its skills and reference reads
  ([#291](https://github.com/zgeoff/tools/issues/291))
  ([41013e9](https://github.com/zgeoff/tools/commit/41013e9f6bc7854c604b4b0252082c6b50fb33f7))

## [0.2.4](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.3...@zgeoff/skill-gate@0.2.4) (2026-10-22)

### Features

- **skill-gate:** block a shell change to a gated file by its result
  ([#287](https://github.com/zgeoff/tools/issues/287))
  ([a58f381](https://github.com/zgeoff/tools/commit/a58f381d45f9683d731f0934277ee0ef5441cf41))

## [0.2.3](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.2...@zgeoff/skill-gate@0.2.3) (2026-10-20)

### Bug Fixes

- **geo-1533:** block a gated edit when the skill-gate hook cannot load
  ([#270](https://github.com/zgeoff/tools/issues/270))
  ([0841b27](https://github.com/zgeoff/tools/commit/0841b2751ac0880228d2598178843912740f747f))

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.1...@zgeoff/skill-gate@0.2.2) (2026-10-20)

### Bug Fixes

- **geo-1496:** bundle skill-gate with no runtime dependencies
  ([#253](https://github.com/zgeoff/tools/issues/253))
  ([d8712d7](https://github.com/zgeoff/tools/commit/d8712d7e16df1aaf274867d88f5378ee5caddd23))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.2.0...@zgeoff/skill-gate@0.2.1) (2026-10-20)

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/std bumped to 0.3.0

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.1.1...@zgeoff/skill-gate@0.2.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1437:** zgeoff/function-verb no longer accepts the verbs option, and the shipped config
  turns on zgeoff/verb-contract.

### Features

- **geo-1437:** name functions by the role table and add zgeoff/verb-contract
  ([#218](https://github.com/zgeoff/tools/issues/218))
  ([8b4e3fb](https://github.com/zgeoff/tools/commit/8b4e3fbd891cb4040f3325ed4734468ceab1d50a))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/std bumped to 0.2.0

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/skill-gate@0.1.0...@zgeoff/skill-gate@0.1.1) (2026-10-19)

### Features

- **geo-1322:** sync only the skill gate's entry point
  ([#209](https://github.com/zgeoff/tools/issues/209))
  ([1f5c6e9](https://github.com/zgeoff/tools/commit/1f5c6e9d8a3c846f2bbbe7aa2a9aba53a88f694a))

## 0.1.0 (2026-10-19)

### Features

- **geo-1322:** add the @zgeoff/skill-gate package
  ([#208](https://github.com/zgeoff/tools/issues/208))
  ([d23f675](https://github.com/zgeoff/tools/commit/d23f6756edc45c1ee43cb57a8e2e9d07946962c2))
