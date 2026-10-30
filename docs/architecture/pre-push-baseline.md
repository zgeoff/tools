# The pre-push baseline

The pre-push baseline is the set of lefthook jobs that a downstream repo runs before a push. Files
under [`sync/pre-push/`](../../sync/pre-push/) are the baseline, delivered by the opt-in
`pre-push-baseline` entry, except the [memory-cap script](./memory-caps.md), which every repo takes,
and this repo's own `lefthook.yml` extends it too. The baseline runs its jobs one at a time, so a
push fits a host with little memory or a machine shared by parallel agents. CI keeps every
whole-tree check required.

## What the baseline runs

The baseline runs `format:check`, `typecheck` and the
[dependency gates check](./dependency-updates.md#the-dependency-gates-check) over the whole tree,
and plain `oxlint`, the shell, docs and workflows checks and the sibling tests over the files the
branch changes. The shell check runs `shellcheck` and `shfmt -d`, the docs check runs the
docs-writing skill's `check-length.sh` and `check-links.sh`, and the workflows check runs
`actionlint` and then the workflow lint. Each runs only when the branch changes a file that matches
its glob.

The uncommitted check runs first. It fails the push when a file the branch changes or deletes
differs from the pushed commit on disk or in the index, such as a staged change or a deleted file
back on disk, and it names each such file. The checks after it read the files on disk, so a fixed
copy on disk would hide a fault in the commit that the push sends. A change to a file the branch
leaves unchanged passes.

A check whose program the machine lacks prints a notice and passes, because CI installs the program
and runs the check. The docs check prints a notice and passes in a repo without
`.claude/skills/docs-writing/scripts/`. The commits and local-paths checks read the commits that
each pushed ref sends, from the ref lines that git hands the hook on stdin. A ref that the push
creates sends the commits that origin's default branch lacks, a ref that it updates leaves out the
remote ref's commit too, and a ref that it deletes sends none. Run outside a push, as in CI, the two
checks read the branch's commits. The test-timeouts check reads the files that `HEAD` holds. The
dependency gates check reads the working tree, as `bun audit` does. The baseline also runs
`typecheck` before a commit that stages a code or JSON file, after the repo's own pre-commit jobs,
so the type check sees what the fixers wrote.

The workflows check ignores one actionlint error, on the `queue` key of `concurrency`: GitHub
documents the key, and the pinned actionlint rejects it. The ignore lapses on an expiry date that
the hook shares with the workflows check in CI. After that date the check reports the key again,
until an actionlint release that knows the key replaces the ignore.

The workflow lint checks the rules that the ci-design skill's
[Step scripts](../../sync/skills/ci-design/SKILL.md#step-scripts) section lists, over the changed
files under `.github/workflows/` and `sync/workflow-callers/`. It runs when the machine lacks
actionlint or actionlint fails, and it prints each fault as a warning and passes the push.

Each job that calls a package script runs it through the `memory-capped` script, which the entry's
build points at the [memory-cap script](./memory-caps.md) with the host's memory budget as the cap.
A job that outgrows the host then fails alone, and every job prints its peak memory.

## The related tests

The test job runs unit tests only. It leaves out the lane files, which need a real system and run
only in CI: a file under an `e2e/` folder or a `-e2e` package, and a file whose suffix names a
standard lane or a lane that the `lanes` option of `zgeoff/max-test-timeout` in the root
`.oxlintrc.json` declares, as
[the test timeout check](./oxlint-config-tests.md#the-test-timeout-check) reads it. It skips, and
passes with a notice that CI runs the full suite, in two cases:

- The branch changes a shared test input, a file under a `test-utils/` folder or a `bunfig.toml`,
  which reaches tests beyond the siblings of the files it changes.
- The branch has more than 50 related unit test files.

The job passes `bun test` the [worker count](./memory-caps.md#the-worker-count) as `--parallel`.
With one worker it also raises the per-test timeout, because a host with one worker runs each file
slower than CI does. The runner holds that timeout as one constant, the only place a run may raise
the timeout.

## The delivered files

The entry delivers these files, and their tests stay in tools:

- `.lefthook/pre-push-baseline.yml` — the lefthook jobs.
- `scripts/read-branch-files.ts` — lists the files changed since the merge base with origin's
  default branch. lefthook's `{push_files}` lists every file in history for a branch with no
  upstream, so the baseline does not use it.
- `scripts/run-related-tests.ts` — runs each changed file's sibling unit test through the repo's
  `test` script, as [The related tests](#the-related-tests) describes.
- `scripts/run-commits-check.ts` — runs `commitlint` with the rules of `@zgeoff/commitlint-config`
  on the message of each pushed commit, merge commits left out. A repo that does not install both
  `@commitlint/cli` and `@zgeoff/commitlint-config` gets a notice in place of the check.
- `scripts/run-local-paths-check.ts` — fails each line that a pushed commit adds and that holds the
  home directory of whoever runs it, followed by a slash, or the machine's host name as a whole
  word. A home of `/` and the host `localhost` are left out.
- `scripts/run-test-timeouts-check.ts` — fails each `bun test --timeout` above the default timeout
  or of 0 in a `package.json` script, and each `bunfig.toml` whose `[test] timeout` is above it, as
  [the test timeout check](./oxlint-config-tests.md#the-test-timeout-check) describes.
- `scripts/run-uncommitted-check.ts` — the uncommitted check, which reads `git status` for each file
  the branch changes and looks on disk for each file it deletes.
- `scripts/run-workflows-check.ts` — the workflow lint, which reads the workflow files that `HEAD`
  holds and warns on each fault. The `Lint workflows` step of `bun-checks.yml` downloads it from
  tools and runs it over every workflow.
- `scripts/dependency-gates/run-dependency-gates-check.ts` and the modules it imports from its
  folder — the dependency gates check. The `Check dependency gates` step of `bun-checks.yml`
  downloads them from tools.
- `scripts/read-worker-count.ts` and `scripts/read-memory-budget.ts` — print the
  [worker count and the memory budget](./memory-caps.md#the-worker-count) of the host.
- `scripts/read-branch-base.ts`, `scripts/read-pushed-ranges.ts`, `scripts/parse-pushed-refs.ts`,
  `scripts/read-range-commits.ts`, `scripts/format-commit-lines.ts`,
  `scripts/read-pushed-refs-input.ts`, `scripts/parse-added-lines.ts`,
  `scripts/pick-merge-blobs-command.ts`, `scripts/parse-shell-words.ts`,
  `scripts/shell-escape-parsers.ts`, `scripts/collect-command-names.ts`,
  `scripts/collect-expression-references.ts`, `scripts/find-install-cache-path.ts`,
  `scripts/parse-lane-limits.ts` and `scripts/run-program.ts` — the modules these scripts import.

The check scripts exit 0 when clean or skipped, 1 with a problem, and 2 when they cannot run, such
as in a clone without origin's default branch. One exception: the workflow lint exits 0 with a
problem, because it only warns.

The entry's build adds the package scripts `files:branch`, `lint:files`, `test:related`,
`check:commits`, `check:local-paths`, `check:test-timeouts`, `check:dependency-gates`,
`check:workflows`, `check:uncommitted` and `memory-capped` when the repo lacks them. It changes one
script the repo already has: a `files:branch` that runs the old `scripts/collect-branch-files.ts`
moves to `scripts/read-branch-files.ts`. A repo opts in with three changes, which
[Opting in to the pre-push baseline](../runbooks/downstream-repo-setup.md#opting-in-to-the-pre-push-baseline)
lists.

## Limits of the baseline

The file list comes from the checked-out branch. `git push origin <other-branch>` lints and tests
the checked-out branch's files, not the pushed branch's, and CI catches what the hook skips.

A job that a repo adds in its `lefthook.yml` runs before the uncommitted check, so it can read an
uncommitted copy of a file the branch changes.

A repo changes what a baseline job runs through the package script that the job calls, such as
`typecheck`. The shell and docs checks and the workflows check's actionlint call their programs
directly, so a repo cannot change them. A job of the same name in `lefthook.yml` does not override a
baseline job, because lefthook merges the extended file over the repo's own.
