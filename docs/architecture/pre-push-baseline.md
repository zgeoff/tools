# The pre-push baseline

The pre-push baseline is the set of lefthook jobs that a downstream repo runs before a push. Files
under [`sync/pre-push/`](../../sync/pre-push/) are the baseline, delivered by the opt-in
`pre-push-baseline` entry, except the [memory-cap script](./memory-caps.md), which every repo takes,
and this repo's own `lefthook.yml` extends it too. The baseline runs its jobs one at a time, so a
push fits a host with little memory or a machine shared by parallel agents. CI keeps every
whole-tree check required.

## What the baseline runs

The baseline runs `format:check` and `typecheck` over the whole tree, and plain `oxlint`, the shell,
docs and workflows checks and the sibling tests over the files the branch changes. The shell check
runs `shellcheck` and `shfmt -d`, the docs check runs the docs-writing skill's `check-length.sh` and
`check-links.sh`, and the workflows check runs `actionlint`. Each runs only when the branch changes
a file that matches its glob. A check whose program the machine lacks prints a notice and passes,
because CI installs the program and runs the check. The docs check prints a notice and passes in a
repo without `.claude/skills/docs-writing/scripts/`. The commits and local-paths checks read the
branch's commits, and the test-timeouts check reads the files that `HEAD` holds. The baseline also
runs `typecheck` before a commit that stages a code or JSON file, after the repo's own pre-commit
jobs, so the type check sees what the fixers wrote.

## The delivered files

The entry delivers these files, and their tests stay in tools:

- `.lefthook/pre-push-baseline.yml` — the lefthook jobs.
- `scripts/read-branch-files.ts` — lists the files changed since the merge base with origin's
  default branch. lefthook's `{push_files}` lists every file in history for a branch with no
  upstream, so the baseline does not use it.
- `scripts/run-related-tests.ts` — runs each changed file's sibling test through the repo's `test`
  script.
- `scripts/run-commits-check.ts` — runs `commitlint` with the rules of `@zgeoff/commitlint-config`
  on the message of each commit since that merge base, merge commits left out. A repo that does not
  install both `@commitlint/cli` and `@zgeoff/commitlint-config` gets a notice in place of the
  check.
- `scripts/run-local-paths-check.ts` — fails each line that a commit since that merge base adds and
  that holds the home directory of whoever runs it, followed by a slash, or the machine's host name
  as a whole word. A home of `/` and the host `localhost` are left out.
- `scripts/run-test-timeouts-check.ts` — fails each `bun test --timeout` above the default timeout
  in a `package.json` script, and each `bunfig.toml` whose `[test] timeout` is above it, as
  [the test timeout check](./oxlint-config-tests.md#the-test-timeout-check) describes.
- `scripts/read-branch-base.ts`, `scripts/parse-added-lines.ts` and `scripts/run-program.ts` — the
  modules these scripts import.

The check scripts exit 0 when clean or skipped, 1 with a problem, and 2 when they cannot run, such
as in a clone without origin's default branch.

The entry's build adds the package scripts `files:branch`, `lint:files`, `test:related`,
`check:commits`, `check:local-paths` and `check:test-timeouts` when the repo lacks them. It changes
one script the repo already has: a `files:branch` that runs the old
`scripts/collect-branch-files.ts` moves to `scripts/read-branch-files.ts`. A repo opts in with three
changes, which
[Opting in to the pre-push baseline](../runbooks/downstream-repo-setup.md#opting-in-to-the-pre-push-baseline)
lists.

## Limits of the baseline

The file list comes from the checked-out branch. `git push origin <other-branch>` lints and tests
the checked-out branch's files, not the pushed branch's, and CI catches what the hook skips.

A repo changes what a baseline job runs through the package script that the job calls, such as
`typecheck`. The shell, docs and workflows checks call their programs directly, so a repo cannot
change them. A job of the same name in `lefthook.yml` does not override a baseline job, because
lefthook merges the extended file over the repo's own.
