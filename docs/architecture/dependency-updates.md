# Dependency updates

Two parts keep a repo's dependencies current with no person filing an issue. Renovate opens the
update pull requests from the shared preset in [`default.json`](../../default.json), which a repo
takes with `"extends": ["github>zgeoff/tools"]` in its own `renovate.json`, with no sync entry. The
`workflow-audit-fix` entry turns a red `bun audit` into a pull request. Neither part uses GitHub's
dependency graph, because the graph does not read `bun.lock`, so Dependabot alerts stay empty for
these repos. The [dependency gates check](#the-dependency-gates-check) fails a pull request while
the repo keeps an override, an age-gate exclude or an audit ignore that no longer guards anything.

## The Renovate preset

The preset sorts each update by its kind:

| Update                | Release-age wait | Pull request                                 | Merge           |
| --------------------- | ---------------- | -------------------------------------------- | --------------- |
| Security fix          | none             | one per package, labelled `security`         | on green checks |
| Patch                 | the gate         | the weekly `patch updates` group             | on green checks |
| Dev-tool minor        | the gate         | the weekly `dev tools` group                 | on green checks |
| TanStack router       | the gate         | the `tanstack-router monorepo` group         | on green checks |
| `@wringer/*` package  | the gate         | the `wringer packages` group                 | on green checks |
| Other minor           | the gate         | one per package                              | on green checks |
| Major                 | the gate         | one per package, opened weekly               | after review    |
| `@zgeoff/*` package   | none             | one per package, at any level                | on green checks |
| `@impz/*` package     | none             | one per package, at any level                | on green checks |
| zgeoff/tools sync tag | none             | one per tag                                  | on green checks |
| Lock-file maintenance | none             | weekly, for the dependencies of dependencies | on green checks |

A TanStack router release, React Start among its packages, reaches a repo as one pull request for
its patch and minor bumps, so the router and React Start never ship at different versions. That
group opens at any time, as other minor bumps do.

Each `@wringer/*` driver peer-depends on `@wringer/core`, and a repo that builds on them pins each
one's exact version, so their patch and minor bumps reach a repo as one pull request, the
`wringer packages` group, and the packages never mix versions. The group opens at any time, as the
TanStack group does. A major bump of one of them gets its own pull request, as any major does.

A `@zgeoff/*` or `@impz/*` bump and a sync-tag bump ignore Renovate's concurrent limit of 10 update
branches per repo. A busy repo keeps more than 10 update branches open, and Renovate would hold a
new sync tag on its Dependency Dashboard under Rate-Limited until a person closed some of them. The
two rules set `prConcurrentLimit` and `branchConcurrentLimit` to 0, which Renovate reads as no limit
for a branch that holds their updates.

The release-age wait matches the `minimumReleaseAge = 604800` gate in each repo's `bunfig.toml`, so
Renovate proposes no version that `bun install` would refuse. Security fixes come from OSV, through
`osvVulnerabilityAlerts`, for every package Renovate finds. Their lock refresh runs
`bun install --minimum-release-age=0`, so a fix younger than the gate installs, and so do the new
dependencies it brings. A `@zgeoff/*` or `@impz/*` bump keeps the gate for its dependencies:
`bun install` accepts the new release only when the repo lists the package in
`minimumReleaseAgeExcludes`.

The preset sets `rebaseWhen` to `conflicted`, so Renovate rebases an open pull request only when it
conflicts with the base branch. Renovate's default rebases every auto-merge pull request that falls
behind the base branch, and each rebase reruns the pull request's checks, so a red pull request
would rerun them on every Renovate run. No ruleset requires a branch to be up to date before it
merges, and the push run on the default branch tests the merged tree.

Renovate's bun manager reads no Bun catalog until renovatebot/renovate#42909 ships, so a regex
manager in the preset finds each `catalog` entry in `package.json`. A regex-manager bump changes
`package.json` alone, because Renovate runs a manager's lock-file update only for that manager's own
updates. A `postUpgradeTasks` step therefore runs `bun install` and commits `bun.lock` in the same
pull request. Renovate runs that command only when the admin's `allowedCommands` allows it. The free
Mend-hosted app allows no such command, so on that app every catalog bump fails
`bun install --frozen-lockfile`. The preset needs self-hosted Renovate whose `allowedCommands`
allows each command, which [Running Renovate](#running-renovate) sets. The step installs the newest
Bun, not the version in `.bun-version`, as Renovate's own bun manager does. Remove the regex manager
once the bun manager reads catalogs.

## Running a package's init after a bump

A `@zgeoff/*` package that a repo wires in, through `package.json` scripts, the lefthook `extends`
line, or hook entries in `.claude/settings.json` and `.codex/hooks.json`, writes that wiring with an
idempotent `init` subcommand. A version bump changes only the version, so the preset holds one
package rule for each such package, whose post-upgrade task runs two commands in the bump's branch:

1. `bun install --ignore-scripts` installs the new version.
2. `bun run --if-present node_modules/.bin/<bin> init` runs the package's `init`.

Renovate commits each file the task adds or changes into the same pull request, so the bump and its
wiring merge together on green checks. `bun run --if-present` exits 0 when the bin is absent, so a
version that ships no such bin opens its pull request as any bump does. `bun x` would fetch a
missing bin from the registry instead. A package with no rule gets no `init` run.

A failed command, a bin that exists without an `init` subcommand among them, is an artifact error to
Renovate. Renovate opens no pull request for the bump until the release is two hours old, then opens
it with a failed `renovate/artifacts` status and a comment that holds the error. The platform's
native auto-merge waits only for the checks a repo's ruleset requires, and would merge that branch
without its wiring, so each rule turns it off. Renovate then merges the pull request itself on its
first run after every status on the branch passes, and a failed `init` leaves the bump for a person.
A package rule's post-upgrade task replaces the catalog rule's, which is why each rule runs
`bun install` itself.

The preset runs `init` for these packages:

| Package               | Command                                                   |
| --------------------- | --------------------------------------------------------- |
| `@zgeoff/agent-hooks` | `bun run --if-present node_modules/.bin/agent-hooks init` |
| `@zgeoff/chex`        | `bun run --if-present node_modules/.bin/chex init`        |
| `@zgeoff/rig`         | `bun run --if-present node_modules/.bin/rig init`         |

To add a package, from the first version that ships its `init`:

1. Copy the `@zgeoff/chex` rule in [`default.json`](../../default.json), and change the package name
   and the bin.
2. Add the bin to the `init` pattern in the `RENOVATE_ALLOWED_COMMANDS` value of
   [`renovate.yml`](../../.github/workflows/renovate.yml).
3. Add a row to the table above.
4. Run `bun run check:renovate-config`. Expect exit 0. The check fails with
   `no RENOVATE_ALLOWED_COMMANDS pattern in .github/workflows/renovate.yml allows '<command>'` when
   a preset command has no pattern that allows it.

## Running Renovate

This repo's [`renovate.yml`](../../.github/workflows/renovate.yml) runs self-hosted Renovate every
two hours, and by hand with an optional dry run. Each run covers every repo where the Renovate
GitHub App is installed. A repo opts in with its own `renovate.json`, and Renovate skips a repo
without one and opens no onboarding pull request. The two-hour cadence puts a run inside the
preset's Monday window, so the weekly groups open on schedule, and a new `@zgeoff/*` release reaches
each repo within two hours.

The job mints an installation token from the App, and Renovate commits as the App's bot user. The
App needs the repository permissions in Renovate's
[GitHub App guide](https://docs.renovatebot.com/modules/platform/github/#running-as-a-github-app),
including Workflows write, so Renovate can bump the actions a workflow pins. tools has its own
`renovate.json`, so with the App installed here Renovate also bumps the action and the Renovate
version that `renovate.yml` pins. This repo holds the App's client ID, which starts with `Iv`, in
the `RENOVATE_APP_ID` secret and its private key in `RENOVATE_APP_PRIVATE_KEY`. Renovate merges an
auto-merge pull request itself on the first run after its checks pass; allowing auto-merge in a
repo's settings lets GitHub merge it sooner.

## The audit-fix workflow

The `workflow-audit-fix` caller runs the reusable
[`audit-fix.yml`](../../.github/workflows/audit-fix.yml) every day, by hand, and after a run fails
in the workflow that holds a repo's `bun audit`: `PR`, `pr`, `CI`, `Dependency Health` or
`Dep Health`. Only a failed run on `main` starts it, because the job audits the default branch, and
a failure on a pull-request branch leaves that audit unchanged. That failed run must come from a
push, the schedule or a dispatch in the repo itself, because a fork's pull request can come from a
branch named `main`, and the job holds the repo-sync App secrets. The job opens a pull request on
the branch `audit-fix` only when the audit needs a change:

- `bun audit fix` updates each vulnerable package to the lowest fixed release that every dependent's
  range accepts.
- A fix younger than the release-age gate gets a `minimumReleaseAgeExcludes` entry in `bunfig.toml`,
  with a comment that dates the release and the day to remove the entry. The first run on or after
  that day removes the entry and its comment; an entry without the step's comment stays.
- An advisory that no fix reaches gets an entry in `audit-ignores.json`, which holds the package,
  the reason, and an expiry `--expiry-days` ahead, whose default
  [`run-audit-fix.ts`](../../scripts/audit-fix/run-audit-fix.ts) sets. The `audit` script in
  `package.json` gets the matching `--ignore` flag.
- An expired ignore is audited again: the entry gets a new expiry while no fix reaches it, and goes
  when the audit no longer reports the advisory. An expiry past the cap that `maxExpiryDays` in
  [`plan-audit-ignores.ts`](../../scripts/audit-fix/plan-audit-ignores.ts) sets counts as expired.
- A rerun keeps the expiries on the open `audit-fix` branch, so it builds the same tree and leaves
  the pull request's checks alone.

An `--ignore` flag with no `audit-ignores.json` entry stays as it is. The pull request is labelled
`dependencies` and `security`. A pull request that adds or renews an ignore is also labelled
`audit-ignore` and waits for a person's review: the job turns auto-merge off for it. The job asks
GitHub to merge any other pull request on green checks, which needs auto-merge allowed in the repo
settings. A run that finds nothing to change deletes the `audit-fix` branch, which closes a stale
pull request.

The caller needs Bun 1.4.0 or newer in `.bun-version`, since `bun audit fix` arrived in 1.4.0, and
the repo-sync App secrets that
[Wiring up a downstream repo](../runbooks/downstream-repo-setup.md#wiring-up-a-downstream-repo)
sets. The App token pushes the branch, so the repo's checks run on the pull request; a push with the
default `GITHUB_TOKEN` starts no workflow run.

The [Socket config](./socket-config.md) checks the same dependency changes for supply-chain risks.

## The dependency gates check

The dependency gates check reads the root `package.json`, `bunfig.toml` and `bun.lock` in the
working tree, and fails on each entry the repo can remove:

- An age-gate exclude whose removal comment, in the form the audit-fix workflow writes, names a day
  before today. An exclude with no such comment fails too, because the audit-fix workflow never
  removes it. An exclude of a `@zgeoff/` or `@impz/` package never fails: the Renovate preset bumps
  those packages as soon as they publish, so each one keeps its exclude.
- A root override that every range in `bun.lock` admits, or one of a package that nothing in
  `bun.lock` depends on. An override that pins the version the root `workspaces.catalog` holds
  stays, because without it a dependent's range can resolve to a newer release than the catalog's.
- An `--ignore` flag in the `audit` script whose advisory `bun audit` no longer reports, or whose
  package `bun audit fix` can move to a patched release in range.

The check runs `bun audit` only when the `audit` script ignores an advisory, so it needs no network
in a repo with no ignore. A repo with no override, exclude or ignore passes. The
`Check dependency gates` step of [`bun-checks.yml`](../../.github/workflows/bun-checks.yml) runs it
on every pull request, and the [pre-push baseline](./pre-push-baseline.md) runs it before a push.
Its scripts live in [`sync/pre-push/dependency-gates/`](../../sync/pre-push/dependency-gates/).
