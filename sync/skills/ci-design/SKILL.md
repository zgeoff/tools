---
name: ci-design
description:
  How CI runs in a zgeoff repo — the public and private job profiles, job timeouts, test budgets,
  reusable workflows instead of composite actions, path gates on pull requests with a full run on
  main, which jobs cancel and which never do, building once and passing the result, checkout depth,
  triggers that rerun nothing, the dependency gates check, and when a dependency exception is
  allowed. Load it before adding, changing, or reviewing a workflow, a job, a trigger, a Renovate
  setting that starts CI runs, or a release-age exclude, an override or an audit ignore.
metadata:
  kind: rule-set
---

# CI design

This skill holds the patterns that keep a pipeline from running a job whose result is already known.
A job runs when its inputs change, builds each result once, and cancels only the runs whose result a
newer commit replaces. The skill also holds the rules for dependency gates: the overrides,
release-age excludes and audit ignores that change what `bun install` or `bun audit` would do. The
shared reusable workflows live in zgeoff/tools. A repo calls each one at a pinned commit of
zgeoff/tools' `main`, and the pull request that
[repo-sync](https://github.com/zgeoff/tools/blob/main/docs/architecture/repo-sync.md) opens in the
repo moves that pin.

Hand back a workflow change that the [workflow lint](#the-workflow-lint) passes with no new warning,
and a dependency change that the [dependency gates check](#dependency-gates) passes.

## Key rules

Each line links the section that explains it.

- [Two profiles](#two-profiles): a public repo runs parallel jobs for wall time, and a private repo
  runs one `checks` job of named steps for minutes.
- [Timeouts](#timeouts): every job sets a limit, 20 minutes by default.
- [Test budgets](#test-budgets): the budget covers the slowest test job in a public repo and the sum
  of the test steps in a private one.
- [Reusable workflows](#reusable-workflows): share setup as a reusable workflow in zgeoff/tools,
  never as a composite action.
- [Step scripts](#step-scripts): a `run:` holds one plain command, anything more goes in a
  TypeScript script under `scripts/<area>/`, and the workflow lint checks the rules a parser can
  see.
- [Dependency gates](#dependency-gates): run the shared check that fails on a stale override,
  release-age exclude or audit ignore, or a missing [first-party](#first-party-packages) exclude,
  and never a copy of it.
- [Dependency exceptions](#dependency-exceptions): add an exclude, an override or an audit ignore
  for a third-party package only with a named reason, the narrowest scope, provenance for an
  exclude, and its cleanup record.
- [First-party packages](#first-party-packages): exclude every first-party package by its full name,
  with no removal comment, in its own pull request on main.
- [Path gates](#path-gates): a pull-request job runs only when its input paths change, through a
  `changes` job, and every push to main runs it in full.
- [Cancelling runs](#cancelling-runs): checks cancel when a newer commit arrives; release, deploy
  and migrate jobs never cancel.
- [Build once](#build-once): build each artifact once per run and pass it to the jobs that need it.
- [Checkout depth](#checkout-depth): depth 1 for a job that never reads history, a blobless full
  clone for one that does.
- [No rebase churn](#no-rebase-churn): rebase a bot's pull request only on a conflict, and filter a
  `workflow_run` trigger to the branch its job acts on, with a guard on the run's event and
  repository where the job holds a secret.

## References

- [Workflow lint](./references/workflow-lint.md): open it when the lint warns, or before a change
  that a lint rule covers.

## Loading the skill

This guide is the shared base that repo-sync delivers from zgeoff/tools; edit it there, never in a
downstream repo. When the repo has a `project-ci-design` skill, load it too. It holds the repo's own
pipeline, such as its required checks and its deploy jobs, and where the two disagree, the project
skill wins.

This skill covers how CI runs. How a test is written and run, including the worker count, the lanes
and the per-test time limit, is in the [testing](../testing/SKILL.md) skill, and this skill repeats
none of it.

## Two profiles

A repo's visibility picks the layout of its checks. A public repo spends no paid minutes, so it
splits work into parallel jobs to cut wall time. A private repo pays for every job, at least a full
minute each, so it runs one job.
[`bun-checks.yml`](https://github.com/zgeoff/tools/blob/main/.github/workflows/bun-checks.yml), the
shared reusable workflow for a Bun repo, picks the profile from `github.event.repository.private`.
In a reusable workflow, that value describes the calling repo. When an event's payload has no
repository, the workflow uses its `private` input instead. A hand-written workflow follows the same
layout by hand.

| Profile | Jobs                                                  | Required check | Test budget covers        |
| ------- | ----------------------------------------------------- | -------------- | ------------------------- |
| Public  | `gitleaks`, `static`, `test`, `test-<lane>`, `checks` | `checks`       | the slowest test job      |
| Private | `checks`                                              | `checks`       | the sum of the test steps |

A public repo runs one `test-<lane>` job for each lane it has. A private repo's `checks` job runs
the secret scan, the static checks, the tests and each lane as named steps.

A ruleset requires `checks` in both profiles. A public repo's `checks` job needs every other job and
runs even after one fails or the run is cancelled. It fails when a job it needs failed or was
cancelled, and it counts a job skipped by design, such as the lane job of a repo without lanes, as a
pass. The `checks` job has to run every time, because GitHub counts a skipped required check as a
pass: a ruleset that requires a job which skips in its profile blocks nothing.

In a public repo:

- **Split work into its own job only when the split saves at least 60 s of wall time** against
  running it as a step. A job that saves less costs a runner start, a checkout and an install for
  nothing.
- **Start at most 10 jobs at once in one run.** The account's concurrent-job limit is shared by
  every repo, so a wide run queues the others.
- **Shard the test job only when the repo is over its budget after the speed work** in the testing
  skill.

In a private repo:

- **Add a second job only for another runner, such as KVM or macOS, or another trigger.** A
  [heavy check](./references/workflow-lint.md#terms) runs nightly or on dispatch.
- **Make the `checks` job the required check**, with no aggregator job after it.
- **Run the secret scan as a step.** A scan of a few seconds in its own job bills a full minute.
- **Path-gate a lane inside the job.** A step diffs the pull request's merge commit against its
  base, as the [path gate](#path-gates) does, and the lane's step `if:` reads its output, so a lane
  that a pull request cannot affect skips without a second job. No shared step does this, so the
  repo writes the step as a [step script](#step-scripts).

Both profiles gate side work on paths, cancel a superseded pull-request run, build once and set a
timeout on every job.

## Timeouts

Every job sets `timeout-minutes`. A job without one runs until the platform's own limit, and a hung
test burns that whole time. The limit is 20 minutes, the `bun-checks.yml` default. A repo that calls
it through the synced `pr.yml` caller changes the limit with its `BUN_CHECK_TIMEOUT_MINUTES`
variable.

## Test budgets

A repo's test budget is a wall-time limit on its tests in CI. In a public repo, the budget covers
the slowest test job, because that job sets the run's wall time. In a private repo, the budget
covers the sum of the test steps in the `checks` job, because those steps bill one after another.

## Reusable workflows

Share a run of steps between jobs or repos as a reusable workflow, called with `uses:` at the job
level. A composite action folds its steps into one step of the caller's log, so a failure shows as
one red line, and a reader opens the action's source to find which command failed. A reusable
workflow shows each of its jobs and steps in the run, with its own timings.

A shared reusable workflow lives in zgeoff/tools, and a repo calls it as
`zgeoff/tools/.github/workflows/<name>.yml@<commit> # main`. A repo-local reusable workflow sits in
the repo's own `.github/workflows/` and is called by its path. Before writing setup steps by hand,
check whether a tools reusable workflow covers them, and call it.

## Step scripts

A `run:` holds one plain command on one line, such as `run: bun run --silent ci:tag-release`. The
command holds no `if`, `for`, `while` or `case`, no `&&`, `||`, `;` or pipe, and no `${{ }}`: a
value from an expression reaches the command through `env:`. Logic in a `run:` block runs only in a
real run, and a step that runs only on release, on deploy or on failure never runs before it merges.
Logic in a script runs in the script's tests on every pull request, as the testing skill's
[workflows reference](../testing/references/workflows.md) describes.

- **A script is TypeScript run by Bun, in `scripts/<area>/`.** It runs each outside command through
  Bun's `$` shell, and the step calls it through a package script. An existing `.sh` step script
  stays.
- **Never put a script under `.github/`.** `bun test` skips the hidden folder, so a script and its
  test there never run in the repo's test suite.
- **A reusable workflow in zgeoff/tools runs its step scripts from the commit that defines the
  job.** The caller's checkout lacks them, so
  [`download-step-scripts.ts`](https://github.com/zgeoff/tools/blob/main/scripts/ci/download-step-scripts.ts)
  fetches each one from that commit as its bundle under `step-bundles/`. A bundle inlines every file
  and package its script imports. The download fails on a bundle that still imports a package, so a
  step script takes no package that the bundler cannot inline. A caller pinned to a commit runs that
  commit's scripts.
- **A change to a reusable workflow or its step scripts moves every caller's pin.** When a
  zgeoff/tools commit changes one, repo-sync opens a pull request in each caller that moves its pins
  to that commit, even if no synced file changed. Each caller runs repo-sync from the commit its pin
  names, so a fix to repo-sync reaches a caller only after that caller's pull request merges.

### The workflow lint

The workflow lint checks the `run:` rule and the rules in this skill that a parser can check
exactly. The `Lint workflows` step of `bun-checks.yml` runs it after the actionlint step over the
repo's workflows and the workflow callers that zgeoff/tools delivers. The
[pre-push baseline](https://github.com/zgeoff/tools/blob/main/docs/architecture/pre-push-baseline.md),
the lefthook hook that repo-sync delivers, runs it over the workflow files a branch changes. It
reports each fault as a warning and passes, so a repo that a repo-sync pull request moves to a new
commit keeps a green run while it clears the warnings.

The [workflow lint reference](./references/workflow-lint.md) lists each warning, the terms the lint
reads, and how it picks the profile.

## Dependency gates

Run the shared dependency gates check in the pull-request checks of every Bun repo, and never write
a copy of it. The `Check dependency gates` step of `bun-checks.yml` runs it. A repo with its own
workflow runs `bun run check:dependency-gates`, a script that the pre-push baseline adds. A repo
without the baseline runs `bun x @zgeoff/chex dependency-gates`.

The release-age wait is `minimumReleaseAge` in the `[install]` table of `bunfig.toml`: `bun install`
refuses each release younger than that age. A release-age exclude is a package name in the same
table's `minimumReleaseAgeExcludes` list, and that package skips the wait.

A dependency gate is an entry in a repo's config that changes what `bun install` or `bun audit`
would do without it: an override pins a version, a release-age exclude skips the release-age wait,
and an audit ignore hides an advisory. When its reason is gone, the entry stays, and nobody notices
unless a check fails.

The
[dependency gates check](https://github.com/zgeoff/tools/blob/main/docs/architecture/dependency-updates.md#the-dependency-gates-check)
fails on each dependency gate that no longer guards anything:

- An override whose pinned version every range in the lockfile allows.
- A release-age exclude whose removal date has passed, or that has no dated removal comment. A
  first-party exclude passes with or without a comment.
- An ignored advisory that is gone, or that a release in range fixes.

It also fails on a first-party package that the lockfile installs with no release-age exclude, as
[First-party packages](#first-party-packages) describes.

## Dependency exceptions

A dependency exception is a dependency gate that a person adds for a third-party package. The
[audit-fix workflow](https://github.com/zgeoff/tools/blob/main/docs/architecture/dependency-updates.md#the-audit-fix-workflow),
which turns a red `bun audit` into a fix pull request, writes the other gates. An exception is a
release-age exclude, a root override, or an audit ignore. Add one only when it is de-risked and
carries its own cleanup. Every zgeoff repo follows this rule, so a repo's AGENTS.md or project skill
links here and states no exception rule of its own.

A first-party exclude is not a dependency exception, and its rule is in
[First-party packages](#first-party-packages).

An exception is de-risked when its pull request shows each of these:

- A named reason: the change the exception unblocks, such as a fix the repo needs or a tool that
  nothing older provides. Convenience is no reason: when an older release does the job, pin the
  newest version that passes the release-age wait, in the root `workspaces.catalog`, or in the
  package's `package.json` in a repo with no catalog.
- The narrowest scope: name each package in full, never a scope, and pin it to one exact version in
  the catalog or the override.
- Provenance for a release-age exclude: every excluded release has an npm provenance attestation, so
  its publisher built it in CI from a public source. Check each one with
  `npm view <package>@<version> dist.attestations.provenance`, which prints a `predicateType` for an
  attested release and nothing for one without. A release with no attestation gets no exclude.

Each kind of exception carries the record that takes it out:

- A release-age exclude carries a dated removal comment above the list, in the form the audit-fix
  workflow writes, such as
  `# left-pad 1.3.1 (published 2026-03-01) ages past the gate ~2026-03-08 — remove then`. The date
  is the day the release ages past the release-age wait. The comment names its package, so its place
  above the list does not matter. The audit-fix workflow never removes an exclude without the
  comment.
- An audit ignore carries an entry in the repo's root `audit-ignores.json`, keyed by the advisory
  ID, with its `package`, its `reason` and an ISO `expires` date. The `--ignore` flag goes in the
  `audit` script of `package.json`. Without the entry, the ignore never expires, and the audit-fix
  workflow never audits the advisory again.
- A root override needs no record: the dependency gates check fails once every range in the lockfile
  admits the pinned version.

### First-party packages

Exclude every first-party package from the release-age wait. A first-party package is one under
`@zgeoff/`, `@impz/`, `@wringer/` or `@heynixie/`, the scopes in
[`first-party-scopes.ts`](https://github.com/zgeoff/tools/blob/main/packages/chex/src/dependency-gates/first-party-scopes.ts).
The owner of the zgeoff repos publishes these packages and trusts each release. Renovate bumps a
first-party package as soon as a new release publishes, and `bun install` refuses that release until
the package has a release-age exclude.

- Exclude every first-party package that the lockfile installs, including one that only another
  package depends on. The dependency gates check names each one with no exclude. A repo that sets no
  `minimumReleaseAge` needs none.
- Add a missing exclude in its own pull request on main. Renovate rebuilds its own branch, so a
  commit pushed there does not last.
- After that pull request merges, tick the rebase checkbox in the body of each red Renovate pull
  request. Renovate rebases only on a conflict, so without the tick its branch stays red.
- Write each exclude as the full package name, such as `@zgeoff/std`. Bun accepts a scope entry such
  as `@zgeoff/*` with no warning, and the entry lets no package through.
- Give the exclude no removal comment. The audit-fix workflow removes an exclude on its comment's
  date, so delete the comment from a first-party exclude that has one.

## Path gates

A workflow whose jobs are required checks runs on every pull request. `on.pull_request.paths` skips
the whole workflow, and a skipped workflow never reports, so a required check stays pending and the
merge blocks. A job skipped by its own `if:` reports success instead. The path gate uses that: a
`changes` job outputs whether the pull request touches the job's inputs, and each later job reads
the answer.

Call `zgeoff/tools/.github/workflows/paths-changed.yml@<commit> # main` as the `changes` job:

| Input or output | What it holds                                                                             |
| --------------- | ----------------------------------------------------------------------------------------- |
| `paths` input   | the path patterns, one per line                                                           |
| `changed`       | `'true'` when the pull request changes a matching file or the event is not a pull request |

The patterns follow `on.pull_request.paths`, and both `*` and `**` match `/`.

A made-up caller for an image build:

```yaml
on:
  pull_request:
  push:
    branches: [main]

jobs:
  changes:
    permissions:
      contents: read
    uses: zgeoff/tools/.github/workflows/paths-changed.yml@<commit> # main
    with:
      paths: |
        services/api/**
        bun.lock
        .github/workflows/image.yml

  image:
    needs: changes
    if: ${{ !cancelled() && needs.changes.outputs.changed != 'false' }}
    runs-on: ubuntu-latest
    steps:
      - run: echo build
```

- **Gate on `!= 'false'`, never `== 'true'`.** A failed or cancelled `changes` job leaves the output
  empty, and the gated job then runs the work instead of passing without it. Keep `!cancelled()` in
  the `if:` too: a job whose `needs` failed skips unless its `if:` holds a status function.
- **List the workflow file in `paths`.** A change to the workflow is a change to the job's inputs.
- **Give the push trigger no `paths`.** The `changes` job outputs `'true'` on a push, so every push
  to main runs every job, and main tests the merged tree even when a pull request skipped a job.
- **Gate a job whose inputs are a known part of the tree.** An image, a native build or an
  end-to-end suite fits, because a pull request that changes none of its paths cannot change its
  result.

## Cancelling runs

A newer commit makes the checks of the older one worthless, so a checks workflow cancels its older
runs, on pull requests and on pushes to main:

```yaml
concurrency:
  group: checks-${{ github.ref }}
  cancel-in-progress: true
```

A gate on main must pass once for each commit on main, so it never cancels. It groups its runs by
commit, and a newer commit starts its own run beside the older one:

```yaml
on:
  push:
    branches: [main]
concurrency:
  group: gate-${{ github.sha }}
  cancel-in-progress: false
```

A release, deploy or migrate job never cancels, because a cut-off deploy can leave a target half
changed. Give each such job its own job-level `concurrency` group with `cancel-in-progress: false`,
so the checks group can cancel the run's checks without reaching the deploy. A workflow-level
`cancel-in-progress: true` covers every job in the workflow, so a workflow with a deploy job sets
its groups per job.

```yaml
jobs:
  deploy:
    needs: checks
    concurrency:
      group: deploy-production
      cancel-in-progress: false
```

## Build once

Build each artifact once per run, and hand it to every job that needs it. A container image builds
in one job and passes on through the registry, or through buildx with the GitHub Actions cache
(`cache-from: type=gha` and `cache-to: type=gha,mode=max`), so a later job pulls the layers instead
of rebuilding them. A file passes on with `actions/upload-artifact` and `actions/download-artifact`.

A Bun job runs `bun install --frozen-lockfile` with no `actions/cache` step for
`~/.bun/install/cache` or `node_modules`. On a GitHub-hosted runner, a restore of that cache takes
longer than the install it replaces, and a job that misses the cache spends more time to save one.
The rule leaves a cache of any other path alone, such as a Nix store, which `bun install` does not
replace. The lint skips a path line that holds a `${{ }}` expression, because GitHub resolves it
only when the job runs. Each job pays for its own runner, checkout and install, which
[Two profiles](#two-profiles) weighs against wall time.

## Checkout depth

A job that never reads history checks out at depth 1, the `actions/checkout` default. A job that
reads history, such as a secret scan over a pull request's commits, an affected-packages build, a
size check against the base, or a commit-message check, clones the full history without the file
contents:

```yaml
- uses: actions/checkout@<pinned sha>
  with:
    fetch-depth: 0
    filter: blob:none
```

A blobless clone fetches every commit and tree, and git fetches a file's contents when a command
first reads them. A history that holds large old files then costs the same to clone as a small one.
A job that reads many old files, such as one that walks every past version of a file, fetches each
one on its own from a blobless clone, so it clones the contents too and states that with
`filter: ''`. A job that diffs only the pull request against its base needs the merge commit and its
parents, `fetch-depth: 2`.

## No rebase churn

A rebase that nobody needs reruns every check on the branch. The shared Renovate preset sets
`rebaseWhen: "conflicted"`, so Renovate rebases an open pull request only when it conflicts with the
base branch. A ruleset never requires a branch to be up to date before it merges: the push run on
main tests the merged tree, and an up-to-date rule turns each merge into a rebase and a rerun for
every open pull request.

A `workflow_run` trigger starts on every completed run of the named workflows, on every branch. A
job that acts on one branch, such as an audit of the default branch, filters the trigger with
`branches:` to that branch, so a run on another branch starts nothing.

The `branches:` filter matches the head branch's name alone, so the run of a fork's pull request
from a branch named `main` passes `branches: [main]`. A job that holds a secret or writes to the
repo also checks, in its `if:`, that the triggering run came from an event a fork cannot start and
from the repo itself:

```yaml
if: >-
  contains(fromJSON('["push","schedule"]'), github.event.workflow_run.event) &&
  github.event.workflow_run.head_repository.full_name == github.repository
```
