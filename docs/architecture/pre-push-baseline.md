# The pre-push baseline

The pre-push baseline is the set of lefthook jobs that a repo runs before a push.
[`@zgeoff/chex`](../../packages/chex/README.md) ships it as
[`lefthook.yml`](../../packages/chex/lefthook.yml), which a repo's own `lefthook.yml` extends from
`node_modules/@zgeoff/chex/lefthook.yml`, and this repo's `lefthook.yml` extends it too. The opt-in
`pre-push-baseline` entry of repo-sync delivers the same jobs in a form that calls package scripts,
to the repos that do not install chex, as [The delivered baseline](#the-delivered-baseline)
describes. The baseline runs its jobs one at a time, so a push fits a host with little memory or a
machine shared by parallel agents. CI keeps every whole-tree check required.

## What the baseline runs

The baseline runs `format:check`, `typecheck` and the
[dependency gates check](./dependency-updates.md#the-dependency-gates-check) over the whole tree,
and plain `oxlint`, the shell, docs and workflows checks and the sibling tests over the files the
branch changes. The lint, shell, docs, workflows and test jobs run only when the branch changes a
file that matches their glob, and the other jobs run on every push:

| Job              | Runs                                     | Reads                        |
| ---------------- | ---------------------------------------- | ---------------------------- |
| uncommitted      | `chex uncommitted`                       | the files the branch changes |
| format:check     | the repo's `format:check` script         | the whole tree               |
| lint             | `oxlint --no-error-on-unmatched-pattern` | the changed code files       |
| shell            | `shellcheck` and `shfmt -d`              | the changed shell files      |
| docs             | the repo's `check:docs` script           | the docs each check picks    |
| workflows        | `actionlint`, then `chex workflows`      | the changed workflows        |
| commits          | `chex commits --pushed-refs`             | the pushed commits           |
| local-paths      | `chex local-paths --pushed-refs`         | the pushed commits           |
| test-timeouts    | `chex test-timeouts`                     | the files `HEAD` holds       |
| dependency-gates | `chex dependency-gates`                  | the working tree             |
| typecheck        | the repo's `typecheck` script            | the whole tree               |
| test             | `rig related`                            | the changed code files       |

The repo's `check:docs` script names the docs checks it takes, such as `chex prose length links`,
which `chex init` writes. A repo with no `check:docs` script fails the docs job, because the job
never picks checks by the files a repo has. The baseline also runs `typecheck` before a commit that
stages a code or JSON file, after the repo's own pre-commit jobs, so the type check sees what the
fixers wrote.

The uncommitted check runs first. It fails the push when a file the branch changes or deletes
differs from the pushed commit on disk or in the index, such as a staged change or a deleted file
back on disk, and it names each such file. The checks after it read the files on disk, so a fixed
copy on disk would hide a fault in the commit that the push sends. A change to a file the branch
leaves unchanged passes.

A check whose program the machine lacks, such as `shfmt` or `actionlint`, prints a notice and
passes, because CI installs the program and runs the check. The commits and local-paths checks read
the commits that each pushed ref sends, from the ref lines that git hands the hook on stdin. A ref
that the push creates sends the commits that origin's default branch lacks, a ref that it updates
leaves out the remote ref's commit too, and a ref that it deletes sends none. Run outside a push, as
in CI, the two checks read the branch's commits.

The workflows check ignores one actionlint error, on the `queue` key of `concurrency`: GitHub
documents the key, and the pinned actionlint rejects it. The ignore lapses on an expiry date that
the hook shares with the workflows check in CI. After that date the check reports the key again,
until an actionlint release that knows the key replaces the ignore.

The workflow lint checks the rules that the ci-design skill's
[Step scripts](https://github.com/zgeoff/skills/blob/main/skills/ci-design/SKILL.md#step-scripts)
section lists, over the changed files under `.github/workflows/` and `sync/workflow-callers/`. It
runs when the machine lacks actionlint or actionlint fails, and it prints each fault as a warning
and passes the push.

Each job runs its command under [`diet`](./memory-caps.md), so in a
[mode](./memory-caps.md#the-modes) that caps, a job that outgrows the host fails alone, and every
job prints its peak memory. The jobs call `bun x --no-install` for chex, rig and diet, so a repo
that lacks one of them fails the job, and bun never downloads a package of that name from npm. A
repo that takes the baseline installs `@zgeoff/chex`, `@zgeoff/rig` and `@zgeoff/diet`, and
`chex init` refuses to write the `extends` line until it does. The commits job lints with
`@commitlint/cli` and `@zgeoff/commitlint-config`, and in a repo that lacks either one it prints a
notice and passes.

## The related tests

The test job runs unit tests only, through `rig related`, which leaves out the lane files that
[rig's lane table](./rig.md#the-lane-table) names. It skips, and passes with a notice that CI runs
the full suite, in two cases:

- The branch changes a shared test input, a file under a `test-utils/` folder or a `bunfig.toml`,
  which reaches tests beyond the siblings of the files it changes.
- The branch has more than 50 related unit test files.

The job passes `bun test` the [worker count](./memory-caps.md#the-worker-count) as `--parallel`.
With one worker it also raises the per-test timeout, because a host with one worker runs each file
slower than CI does. The runner holds that timeout as one constant, the only place a run may raise
the timeout.

## The delivered baseline

The `pre-push-baseline` entry delivers the baseline to a repo that does not install chex, as
`.lefthook/pre-push-baseline.yml`, from
[`sync/pre-push/lefthook-pre-push.yml`](../../sync/pre-push/lefthook-pre-push.yml). Its jobs match
the table above, with these differences:

- Each job calls a package script that the entry's build adds to `package.json` when the repo lacks
  it: `files:branch`, `lint:files`, `test:related`, `check:commits`, `check:local-paths`,
  `check:test-timeouts`, `check:dependency-gates`, `check:workflows`, `check:uncommitted` and
  `memory-capped`. The build also moves a `files:branch` that runs the old
  `scripts/collect-branch-files.ts` to `scripts/read-branch-files.ts`.
- Each job runs through the `memory-capped` script, which the build points at the
  [memory-cap script](./memory-caps.md) with the host's memory budget as the cap.
- The docs job runs the docs-writing skill's `check-prose.sh`, `check-length.sh` and
  `check-links.sh`, then `check-vision.sh` when the `docs-vision-check` entry put it beside them and
  the skill-writing skill's `check-skill.sh` when the repo takes that skill. In a repo without
  `.claude/skills/docs-writing/scripts/` it prints a notice and passes.
- The test job runs `scripts/run-related-tests.ts`, which takes the lane suffixes from the `lanes`
  option of `zgeoff/max-test-timeout` in the root `.oxlintrc.json`, as
  [the test timeout check](./oxlint-config-tests.md#the-test-timeout-check) reads it. It also drops
  each test that the `[test]` `pathIgnorePatterns` of the root `bunfig.toml` cover, because
  `bun test` exits 1 when every path it is given is ignored.

The entry delivers the check scripts from [`packages/chex/src/`](../../packages/chex/src/), under
the same names in `scripts/`, so a delivered check runs the code that `chex <check>` runs. The
related-tests runner, `scripts/read-worker-count.ts` and `scripts/read-memory-budget.ts` come from
[`sync/pre-push/`](../../sync/pre-push/). The check scripts exit 0 when clean or skipped, 1 with a
problem, and 2 when they cannot run, such as in a clone without origin's default branch. One
exception: the workflow lint exits 0 with a problem, because it only warns. A repo opts in with
three changes, which
[Opting in to the pre-push baseline](../runbooks/downstream-repo-setup.md#opting-in-to-the-pre-push-baseline)
lists.

## Limits of the baseline

The file list comes from the checked-out branch. `git push origin <other-branch>` lints and tests
the checked-out branch's files, not the pushed branch's, and CI catches what the hook skips.

A job that a repo adds in its `lefthook.yml` runs before the uncommitted check, so it can read an
uncommitted copy of a file the branch changes.

A repo changes what the `format:check`, `typecheck` and docs jobs run through the package script
that each job calls. The other jobs call their programs directly, so a repo cannot change them. A
job of the same name in `lefthook.yml` does not override a baseline job, because lefthook merges the
extended file over the repo's own.
