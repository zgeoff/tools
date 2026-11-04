# Changelog

## [0.1.0](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.6...@zgeoff/rig@0.1.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **testing:** @zgeoff/std no longer exports ./test-utils/*; import the test helpers from @zgeoff/testing/helpers.
* **rig:** rig exits 2 on an --isolate argument and runs nothing, where rig unit used to drop its --no-isolate for it.

### Features

* **rig:** run every lane in one global per process, in random order ([#479](https://github.com/zgeoff/tools/issues/479)) ([251cc1a](https://github.com/zgeoff/tools/commit/251cc1a3ee30b7e70a9619f57e1a74d5463b4572))
* **testing:** add the helpers subpath and move shared test helpers ([#490](https://github.com/zgeoff/tools/issues/490)) ([28ca2f3](https://github.com/zgeoff/tools/commit/28ca2f382ca48cefb3f393255c8d51a77606d44c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zgeoff/diet bumped to 0.2.0
    * @zgeoff/std bumped to 0.4.0
  * devDependencies
    * @zgeoff/std bumped to 0.4.0
    * @zgeoff/testing bumped to 0.2.0

## [0.0.6](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.5...@zgeoff/rig@0.0.6) (2026-11-03)

### Features

- **rig:** add programs, bench and eval, and the chex test-layout check
  ([#470](https://github.com/zgeoff/tools/issues/470))
  ([20cee2e](https://github.com/zgeoff/tools/commit/20cee2eb9d8951ef40b5e7cd507082a4b1fda853))
- **testing:** add the @zgeoff/testing package ([#473](https://github.com/zgeoff/tools/issues/473))
  ([5277195](https://github.com/zgeoff/tools/commit/527719528ee223b97babb8cd12bac7959a4d255a))

### Bug Fixes

- **rig:** break the rig and chex dependency cycle that stops releases
  ([#474](https://github.com/zgeoff/tools/issues/474))
  ([43229b1](https://github.com/zgeoff/tools/commit/43229b1e34950e07a0e6f116f8052bf2a40b95a4))

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/testing bumped to 0.1.0

## [0.0.5](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.4...@zgeoff/rig@0.0.5) (2026-11-02)

### Features

- **sync:** take the shared skill text from zgeoff/skills
  ([#427](https://github.com/zgeoff/tools/issues/427))
  ([94cb4b5](https://github.com/zgeoff/tools/commit/94cb4b531c6018c099d251e7bf7ded846416d910))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/std bumped to 0.3.2

## [0.0.4](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.3...@zgeoff/rig@0.0.4) (2026-10-31)

### Features

- **chex:** run each shared check as one chex subcommand
  ([#409](https://github.com/zgeoff/tools/issues/409))
  ([c7c4839](https://github.com/zgeoff/tools/commit/c7c4839335774b7c5ea1aeefaad844de218166a5))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/diet bumped to 0.1.4
    - @zgeoff/std bumped to 0.3.1

## [0.0.3](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.2...@zgeoff/rig@0.0.3) (2026-10-31)

### Bug Fixes

- **repo-sync:** run every dispatch of a distinct tools commit
  ([#413](https://github.com/zgeoff/tools/issues/413))
  ([5c06d5e](https://github.com/zgeoff/tools/commit/5c06d5e8aa28802e7f9711cebf716d2f567e1121))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/diet bumped to 0.1.3

## [0.0.2](https://github.com/zgeoff/tools/compare/@zgeoff/rig@0.0.1...@zgeoff/rig@0.0.2) (2026-10-31)

### Features

- **rig:** add the rig test orchestrator with a built-in browser lane
  ([#398](https://github.com/zgeoff/tools/issues/398))
  ([b0f498d](https://github.com/zgeoff/tools/commit/b0f498d007242cc41f7658a460105a9982633360))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/diet bumped to 0.1.2

## 0.0.1 (2026-10-31)

### Features

- add stub packages for rig and chex ([#405](https://github.com/zgeoff/tools/issues/405))
  ([4225aa7](https://github.com/zgeoff/tools/commit/4225aa7989ddd6f7551116435e705b621a74ee19))
