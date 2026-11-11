# Changelog

## [0.3.2](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.3.1...@zgeoff/chex@0.3.2) (2026-11-11)


### Bug Fixes

* **chex:** accept rig's terms in the coined-term check ([#611](https://github.com/zgeoff/tools/issues/611)) ([395245d](https://github.com/zgeoff/tools/commit/395245dbe7e528ee731303840987865ceb8690cc))

## [0.3.1](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.3.0...@zgeoff/chex@0.3.1) (2026-11-09)


### Bug Fixes

* **chex:** lint the workflow callers under sync/src/workflow-callers ([#596](https://github.com/zgeoff/tools/issues/596)) ([80b7339](https://github.com/zgeoff/tools/commit/80b7339b4a485d2641825de8b987d8702dc3aa3c))

## [0.3.0](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.6...@zgeoff/chex@0.3.0) (2026-11-09)


### ⚠ BREAKING CHANGES

* **chex:** chex skill fails a skill that holds one of these terms, so a repo whose skills use them fails the check until it rewrites them.

### Features

* **chex:** fail a skill that uses a coined term ([#583](https://github.com/zgeoff/tools/issues/583)) ([0f0e4ea](https://github.com/zgeoff/tools/commit/0f0e4ea6a20fa262d4c2d8d778c80dc30f1a7883))

## [0.2.6](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.5...@zgeoff/chex@0.2.6) (2026-11-09)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.2.3

## [0.2.5](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.4...@zgeoff/chex@0.2.5) (2026-11-07)


### Features

* **oxlint-config:** lint file names for kebab-case and the main export ([#574](https://github.com/zgeoff/tools/issues/574)) ([52b8bc5](https://github.com/zgeoff/tools/commit/52b8bc573699b6c5f8c04f76463aa0d7ac02e33c))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.2.2

## [0.2.4](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.3...@zgeoff/chex@0.2.4) (2026-11-07)


### Bug Fixes

* **chex:** count gradle builds as package manifests in readmes ([#569](https://github.com/zgeoff/tools/issues/569)) ([bdf3cc5](https://github.com/zgeoff/tools/commit/bdf3cc557f49002e19e3d6c04dc2cd3ab3951258))

## [0.2.3](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.2...@zgeoff/chex@0.2.3) (2026-11-07)


### Bug Fixes

* **chex:** match nested override keys in dependency-gates ([#566](https://github.com/zgeoff/tools/issues/566)) ([6222891](https://github.com/zgeoff/tools/commit/6222891bd1dde10bc381da39c1b65d2dbf153cd0))

## [0.2.2](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.1...@zgeoff/chex@0.2.2) (2026-11-07)


### Bug Fixes

* **chex:** add readmes to the check:docs script that init writes ([#563](https://github.com/zgeoff/tools/issues/563)) ([fe2d536](https://github.com/zgeoff/tools/commit/fe2d5368bf2e7acd2d8e4de44d0c8a51bce8b4c8))

## [0.2.1](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.2.0...@zgeoff/chex@0.2.1) (2026-11-07)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zgeoff/std bumped to 0.4.3
  * devDependencies
    * @zgeoff/rig bumped to 0.2.1
    * @zgeoff/std bumped to 0.4.3
    * @zgeoff/testing bumped to 0.3.0

## [0.2.0](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.10...@zgeoff/chex@0.2.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* run unit tests under their package's bunfig, prefix chex jobs ([#542](https://github.com/zgeoff/tools/issues/542))

### Bug Fixes

* run unit tests under their package's bunfig, prefix chex jobs ([#542](https://github.com/zgeoff/tools/issues/542)) ([f4c4152](https://github.com/zgeoff/tools/commit/f4c4152f8d28e6605a2dd54c11b25ceb0727a8b2))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.2.0

## [0.1.10](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.9...@zgeoff/chex@0.1.10) (2026-11-07)


### Bug Fixes

* **chex:** read the lane limits from rig.config.ts when the repo has one ([#546](https://github.com/zgeoff/tools/issues/546)) ([d6a9ebd](https://github.com/zgeoff/tools/commit/d6a9ebd453de42a6c0af525ccf9118a765ef618f))

## [0.1.9](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.8...@zgeoff/chex@0.1.9) (2026-11-07)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.6

## [0.1.8](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.7...@zgeoff/chex@0.1.8) (2026-11-05)


### Bug Fixes

* read each repo's skills through a .claude/skills folder link ([#513](https://github.com/zgeoff/tools/issues/513)) ([654f469](https://github.com/zgeoff/tools/commit/654f4696b168d72c156b7785028b5d2af6b4ee76))

## [0.1.7](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.6...@zgeoff/chex@0.1.7) (2026-11-05)


### Bug Fixes

* **chex:** name the line where skill frontmatter stops parsing ([#527](https://github.com/zgeoff/tools/issues/527)) ([446022c](https://github.com/zgeoff/tools/commit/446022c7aab057ff2dddf84ef8114942860e4d19))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.5

## [0.1.6](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.5...@zgeoff/chex@0.1.6) (2026-11-05)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zgeoff/std bumped to 0.4.2
  * devDependencies
    * @zgeoff/rig bumped to 0.1.4
    * @zgeoff/std bumped to 0.4.2
    * @zgeoff/testing bumped to 0.2.1

## [0.1.5](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.4...@zgeoff/chex@0.1.5) (2026-11-05)


### Features

* **chex:** accept dispatch groups and release queues in workflow lint ([#516](https://github.com/zgeoff/tools/issues/516)) ([e38c3a8](https://github.com/zgeoff/tools/commit/e38c3a83284350933ab5b8a9b3314f684c88db1b))

## [0.1.4](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.3...@zgeoff/chex@0.1.4) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zgeoff/std bumped to 0.4.1
  * devDependencies
    * @zgeoff/rig bumped to 0.1.3
    * @zgeoff/std bumped to 0.4.1

## [0.1.3](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.2...@zgeoff/chex@0.1.3) (2026-11-04)


### Features

* **oxlint-config:** report a branch in the test setup function ([#508](https://github.com/zgeoff/tools/issues/508)) ([7795bd8](https://github.com/zgeoff/tools/commit/7795bd8e07da1a8fc54589a020b2ee6433e7a458))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.2

## [0.1.2](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.1...@zgeoff/chex@0.1.2) (2026-11-04)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zgeoff/rig bumped to 0.1.1

## [0.1.1](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.1.0...@zgeoff/chex@0.1.1) (2026-11-04)


### Bug Fixes

* **chex:** drop the crash lane, which no repo or lane config defines ([#500](https://github.com/zgeoff/tools/issues/500)) ([9ada3e3](https://github.com/zgeoff/tools/commit/9ada3e36981da01ef401b427cc9490b65d8648c4))

## [0.1.0](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.14...@zgeoff/chex@0.1.0) (2026-11-04)


### ⚠ BREAKING CHANGES

* **testing:** @zgeoff/std no longer exports ./test-utils/*; import the test helpers from @zgeoff/testing/helpers.

### Features

* **testing:** add the helpers subpath and move shared test helpers ([#490](https://github.com/zgeoff/tools/issues/490)) ([28ca2f3](https://github.com/zgeoff/tools/commit/28ca2f382ca48cefb3f393255c8d51a77606d44c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zgeoff/std bumped to 0.4.0
  * devDependencies
    * @zgeoff/rig bumped to 0.1.0
    * @zgeoff/std bumped to 0.4.0
    * @zgeoff/testing bumped to 0.2.0

## [0.0.14](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.13...@zgeoff/chex@0.0.14) (2026-11-04)

### Features

- **chex:** add the ci-plan command that plans a bun-checks run
  ([#482](https://github.com/zgeoff/tools/issues/482))
  ([3645438](https://github.com/zgeoff/tools/commit/36454384d251a17e30991fa4baa677957794c8e3))

## [0.0.13](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.12...@zgeoff/chex@0.0.13) (2026-11-04)

### Features

- **chex:** fail a skill whose frontmatter a strict parser refuses
  ([#480](https://github.com/zgeoff/tools/issues/480))
  ([e0acbfb](https://github.com/zgeoff/tools/commit/e0acbfbb461b9b5d60e53e1c91ff8a46753e07fe))

## [0.0.12](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.11...@zgeoff/chex@0.0.12) (2026-11-03)

### Bug Fixes

- **chex:** make the pack build-folder test independent of test order
  ([#476](https://github.com/zgeoff/tools/issues/476))
  ([79082f9](https://github.com/zgeoff/tools/commit/79082f9c6cd66def609e7884c004ce9175b8993c))

## [0.0.11](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.10...@zgeoff/chex@0.0.11) (2026-11-03)

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
    - @zgeoff/rig bumped to 0.0.6
    - @zgeoff/testing bumped to 0.1.0

## [0.0.10](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.9...@zgeoff/chex@0.0.10) (2026-11-02)

### Bug Fixes

- **chex:** run the baseline hook jobs without git's repository variables
  ([#459](https://github.com/zgeoff/tools/issues/459))
  ([cd6d675](https://github.com/zgeoff/tools/commit/cd6d67541a554bb4c0a29ae24cbd2b633075a7fb))

## [0.0.9](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.8...@zgeoff/chex@0.0.9) (2026-11-02)

### Bug Fixes

- **sync:** keep synced code free of packages a repo does not list
  ([#455](https://github.com/zgeoff/tools/issues/455))
  ([470d99b](https://github.com/zgeoff/tools/commit/470d99ba12d17cb4ea460433dd4771272e32b09d))

## [0.0.8](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.7...@zgeoff/chex@0.0.8) (2026-11-02)

### Features

- **chex:** one word limit for every skill, and check rule-set bullets
  ([#443](https://github.com/zgeoff/tools/issues/443))
  ([560622d](https://github.com/zgeoff/tools/commit/560622d52584a4881af9454f241eca7c6932ca27))

## [0.0.7](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.6...@zgeoff/chex@0.0.7) (2026-11-02)

### Features

- **sync:** take the shared skill text from zgeoff/skills
  ([#427](https://github.com/zgeoff/tools/issues/427))
  ([94cb4b5](https://github.com/zgeoff/tools/commit/94cb4b531c6018c099d251e7bf7ded846416d910))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/std bumped to 0.3.2

## [0.0.6](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.5...@zgeoff/chex@0.0.6) (2026-11-02)

### Features

- **chex:** treat [@heynixie](https://github.com/heynixie) packages as first party
  ([#441](https://github.com/zgeoff/tools/issues/441))
  ([bafbfb0](https://github.com/zgeoff/tools/commit/bafbfb087ef4495ace20b448775beb6f55486a4c))

## [0.0.5](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.4...@zgeoff/chex@0.0.5) (2026-11-02)

### Features

- **chex:** fail on a first-party package with no age-gate exclude
  ([#438](https://github.com/zgeoff/tools/issues/438))
  ([d056cc1](https://github.com/zgeoff/tools/commit/d056cc1a67bf12d9179059dfde434a7914908206))

## [0.0.4](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.3...@zgeoff/chex@0.0.4) (2026-11-02)

### Bug Fixes

- **chex:** fail a commit or push when the chex baseline file is missing
  ([#429](https://github.com/zgeoff/tools/issues/429))
  ([26cadb8](https://github.com/zgeoff/tools/commit/26cadb80bf7a2d203d03ff4d4c753b62be786ae3))

## [0.0.3](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.2...@zgeoff/chex@0.0.3) (2026-10-31)

### Bug Fixes

- **chex:** read the repo's visibility for the workflow lint in a hook
  ([#423](https://github.com/zgeoff/tools/issues/423))
  ([2dcc64b](https://github.com/zgeoff/tools/commit/2dcc64b65afeea2023dc8dcf028e7c5e8592871f))

## [0.0.2](https://github.com/zgeoff/tools/compare/@zgeoff/chex@0.0.1...@zgeoff/chex@0.0.2) (2026-10-31)

### Features

- **chex:** run each shared check as one chex subcommand
  ([#409](https://github.com/zgeoff/tools/issues/409))
  ([c7c4839](https://github.com/zgeoff/tools/commit/c7c4839335774b7c5ea1aeefaad844de218166a5))
- **ci:** run each shared check through chex in the workflows and hooks
  ([#410](https://github.com/zgeoff/tools/issues/410))
  ([f360681](https://github.com/zgeoff/tools/commit/f3606814df341a1062b436f2f2dfc98dd3b9be1f))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @zgeoff/std bumped to 0.3.1

## 0.0.1 (2026-10-31)

### Features

- add stub packages for rig and chex ([#405](https://github.com/zgeoff/tools/issues/405))
  ([4225aa7](https://github.com/zgeoff/tools/commit/4225aa7989ddd6f7551116435e705b621a74ee19))
