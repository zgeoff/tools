# Changelog

## [0.2.6](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.5...@zgeoff/agent-hooks@0.2.6) (2026-11-05)


### Bug Fixes

* read each repo's skills through a .claude/skills folder link ([#513](https://github.com/zgeoff/tools/issues/513)) ([654f469](https://github.com/zgeoff/tools/commit/654f4696b168d72c156b7785028b5d2af6b4ee76))

## [0.2.5](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.4...@zgeoff/agent-hooks@0.2.5) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.5

## [0.2.4](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.3...@zgeoff/agent-hooks@0.2.4) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.4
    * @zgeoff/std bumped to 0.4.2
    * @zgeoff/testing bumped to 0.2.1

## [0.2.3](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.2...@zgeoff/agent-hooks@0.2.3) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.3
    * @zgeoff/std bumped to 0.4.1

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.1...@zgeoff/agent-hooks@0.2.2) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.2

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.2.0...@zgeoff/agent-hooks@0.2.1) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.1

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.5...@zgeoff/agent-hooks@0.2.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **testing:** @zgeoff/std no longer exports ./test-utils/*; import the test helpers from @zgeoff/testing/helpers.

### Features

* **testing:** add the helpers subpath and move shared test helpers ([#490](https://github.com/zgeoff/tools/issues/490)) ([28ca2f3](https://github.com/zgeoff/tools/commit/28ca2f382ca48cefb3f393255c8d51a77606d44c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.0
    * @zgeoff/std bumped to 0.4.0
    * @zgeoff/testing bumped to 0.2.0

## [0.1.5](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.4...@zgeoff/agent-hooks@0.1.5) (2026-11-03)

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/rig bumped to 0.0.6

## [0.1.4](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.3...@zgeoff/agent-hooks@0.1.4) (2026-11-02)

### Features

- **sync:** take the shared skill text from zgeoff/skills
  ([#427](https://github.com/zgeoff/tools/issues/427))
  ([94cb4b5](https://github.com/zgeoff/tools/commit/94cb4b531c6018c099d251e7bf7ded846416d910))

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/std bumped to 0.3.2

## [0.1.3](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.2...@zgeoff/agent-hooks@0.1.3) (2026-10-31)

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - @zgeoff/std bumped to 0.3.1

## [0.1.2](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.1...@zgeoff/agent-hooks@0.1.2) (2026-10-31)

### Bug Fixes

- **agent-hooks:** deny every gated call when the rules can't be read
  ([#420](https://github.com/zgeoff/tools/issues/420))
  ([4058e44](https://github.com/zgeoff/tools/commit/4058e44011211674a5fea8ab3a7bcdb91fd876a2))

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/agent-hooks@0.1.0...@zgeoff/agent-hooks@0.1.1) (2026-10-31)

### Features

- **agent-hooks:** run every agent hook behind one start-up stub
  ([#395](https://github.com/zgeoff/tools/issues/395))
  ([ef24054](https://github.com/zgeoff/tools/commit/ef240545b93a9e524a810596ded9183d1293f665))
