# Changelog

## [0.7.1](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.7.0...@zgeoff/oxlint-config@0.7.1) (2026-10-28)

### Features

- **pre-push:** add the shared dependency gates check
  ([#360](https://github.com/zgeoff/tools/issues/360))
  ([4d1ffad](https://github.com/zgeoff/tools/commit/4d1ffad9e9029322e110e9bce1395e069f1d6233))

## [0.7.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.6.4...@zgeoff/oxlint-config@0.7.0) (2026-10-24)

### ⚠ BREAKING CHANGES

- **oxlint-config:** lane files that the rule skipped are now checked against their lane's limit,
  and the lint rule zgeoff/test-timeout-exception-ticket is on as an error. To migrate: a lanes
  array still works and gives each listed lane the 15 s default; list a raised limit in the lanes
  map, such as { "lanes": { "kvm": 60000 } }; evals/ is no longer a lane, so a test there that calls
  a live model takes the .model-api suffix and the test:evals script becomes test:model-api; add the
  measured time and a ticket, or floor: with its evidence, after -- on each disable of
  zgeoff/max-test-timeout; and give any config setting that turns either rule off or to warn a
  comment that names a ticket or a floor:.

### Features

- **oxlint-config:** check each lane file against its lane's limit
  ([#327](https://github.com/zgeoff/tools/issues/327))
  ([f346095](https://github.com/zgeoff/tools/commit/f3460953b00b3f8f48d44474264616828f114154))

## [0.6.4](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.6.3...@zgeoff/oxlint-config@0.6.4) (2026-10-23)

### Features

- **oxlint-config:** refuse long test timeouts and sleeps in tests
  ([#308](https://github.com/zgeoff/tools/issues/308))
  ([9c89ca6](https://github.com/zgeoff/tools/commit/9c89ca664c19f881ea61a49789c000d11356643a))

## [0.6.3](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.6.2...@zgeoff/oxlint-config@0.6.3) (2026-10-22)

### Bug Fixes

- **oxlint-config:** accept claude-code/testing in setup-test-only
  ([#300](https://github.com/zgeoff/tools/issues/300))
  ([9b6eac7](https://github.com/zgeoff/tools/commit/9b6eac79dd77a2ef01fafa6b1e3015a60a264e92))

## [0.6.2](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.6.1...@zgeoff/oxlint-config@0.6.2) (2026-10-22)

### Features

- **oxlint-config:** accept configured test lanes in test-beside-module
  ([#289](https://github.com/zgeoff/tools/issues/289))
  ([ed5f9af](https://github.com/zgeoff/tools/commit/ed5f9af650b47f22c1dc43d5d75b1c3374d0c9b2))

## [0.6.1](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.6.0...@zgeoff/oxlint-config@0.6.1) (2026-10-20)

### Bug Fixes

- **geo-1507:** read verb-contract's callee name from the called member
  ([#252](https://github.com/zgeoff/tools/issues/252))
  ([b89124d](https://github.com/zgeoff/tools/commit/b89124d2a73cd139ff4d897bcca1fc7c8b7b3c57))

## [0.6.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.5.2...@zgeoff/oxlint-config@0.6.0) (2026-10-20)

### ⚠ BREAKING CHANGES

- **geo-1467:** a repo on this config fails lint on each type assertion other than as const until it
  removes the assertion or adds an approved disable comment. The kysely-bun-sqlite driver throws on
  a parameter that bun:sqlite would bind as NULL.

### Features

- **geo-1467:** add no-hidden-cast and lock both type-assertion rules
  ([#249](https://github.com/zgeoff/tools/issues/249))
  ([2213b88](https://github.com/zgeoff/tools/commit/2213b8805bf121778b90d560a67fa2cb349d1f44))
- **geo-1467:** ban every type assertion other than as const
  ([#246](https://github.com/zgeoff/tools/issues/246))
  ([50bde87](https://github.com/zgeoff/tools/commit/50bde87bdf36327f5b2e1b4f4183faae9cd5e1ac))

## [0.5.2](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.5.1...@zgeoff/oxlint-config@0.5.2) (2026-10-19)

### Features

- **geo-1413:** export the import-zones schema and edge evaluator
  ([#231](https://github.com/zgeoff/tools/issues/231))
  ([d7f3960](https://github.com/zgeoff/tools/commit/d7f3960fab15e09d116442536275a03fa994a19d))

## [0.5.1](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.5.0...@zgeoff/oxlint-config@0.5.1) (2026-10-19)

### Features

- **oxlint-config:** pair a browser suite with its module
  ([#225](https://github.com/zgeoff/tools/issues/225))
  ([37188ba](https://github.com/zgeoff/tools/commit/37188baab2308c467bbd2c8743dd6dfe118c48ce))

## [0.5.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.4.0...@zgeoff/oxlint-config@0.5.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1434:** the shared config turns zgeoff/module-order on as an error, so a repo that bumps the
  package fails lint until it runs oxlint --fix and moves the rest by hand.

### Features

- **geo-1434:** enforce the code-style module order with zgeoff/module-order
  ([#222](https://github.com/zgeoff/tools/issues/222))
  ([a10caf0](https://github.com/zgeoff/tools/commit/a10caf0879440c16bbc2e6113ef5e8d6f76a53df))

## [0.4.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.3.0...@zgeoff/oxlint-config@0.4.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1437:** zgeoff/function-verb no longer accepts the verbs option, and the shipped config
  turns on zgeoff/verb-contract.

### Features

- **geo-1437:** name functions by the role table and add zgeoff/verb-contract
  ([#218](https://github.com/zgeoff/tools/issues/218))
  ([8b4e3fb](https://github.com/zgeoff/tools/commit/8b4e3fbd891cb4040f3325ed4734468ceab1d50a))

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.13...@zgeoff/oxlint-config@0.3.0) (2026-10-19)

### ⚠ BREAKING CHANGES

- **geo-1275:** @zgeoff/kysely-bun-sqlite exports buildBunSQLiteDriver(sqlite) in place of the
  BunSQLiteDriver class.

### Features

- **geo-1275:** add zgeoff/no-class and build tools' classes with factories
  ([#213](https://github.com/zgeoff/tools/issues/213))
  ([d186a0f](https://github.com/zgeoff/tools/commit/d186a0fd1d6c0544f36b19d3d87c0f3c8d34fd27))

## [0.2.13](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.12...@zgeoff/oxlint-config@0.2.13) (2026-10-19)

### Features

- **geo-1274:** add zgeoff/setup-test-only to keep test files to setupTest and tests
  ([#205](https://github.com/zgeoff/tools/issues/205))
  ([fbb3697](https://github.com/zgeoff/tools/commit/fbb369773bbd8acb8a55f474ec441cc57f20d7dc))

## [0.2.12](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.11...@zgeoff/oxlint-config@0.2.12) (2026-10-19)

### Features

- **geo-1282:** resolve workspace package names and flag self imports in zgeoff/import-zones
  ([#200](https://github.com/zgeoff/tools/issues/200))
  ([e90e786](https://github.com/zgeoff/tools/commit/e90e786acc83e2d3a79fbce4d77c9d2b5a332e91))

## [0.2.11](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.10...@zgeoff/oxlint-config@0.2.11) (2026-10-18)

### Features

- **geo-1373:** check every name-binding form in no-abbreviated-names
  ([#198](https://github.com/zgeoff/tools/issues/198))
  ([511050b](https://github.com/zgeoff/tools/commit/511050b3fac0b3bb7d4ef5d895d5ef9ce73e3047))

## [0.2.10](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.9...@zgeoff/oxlint-config@0.2.10) (2026-10-18)

### Features

- **geo-1277:** lint short and abbreviated value names in oxlint-config
  ([#193](https://github.com/zgeoff/tools/issues/193))
  ([5f83011](https://github.com/zgeoff/tools/commit/5f83011754f2c1613a9738fc4273bca4cc0f7d39))

## [0.2.9](https://github.com/zgeoff/tools/compare/@zgeoff/oxlint-config@0.2.8...@zgeoff/oxlint-config@0.2.9) (2026-10-18)

### Features

- **geo-1284:** extend zgeoff/import-zones for nixie and impz
  ([#184](https://github.com/zgeoff/tools/issues/184))
  ([a6a08e2](https://github.com/zgeoff/tools/commit/a6a08e2a0da4ad050ab168653df348c6f7a4a17e))

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
