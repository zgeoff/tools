# sync

Files every downstream repo carries a copy of. [`manifest.json`](./manifest.json) lists them as
entries, and the [repo-sync workflow](../.github/workflows/repo-sync.yml) delivers each entry to a
downstream repo as one pull request on the branch `sync/<name>`. [`repo-sync.yml`](./repo-sync.yml)
is the stub a downstream repo installs to call it.

## Manifest entries

An entry holds:

- `name` — the branch suffix and the name that `skip` and `include` take.
- `description` — one line, which the workflow writes into the pull request body.
- `files` — `source` (a path in this repo), `target` (a path in the downstream repo), an optional
  `mode` such as `0755`, and an optional `except`, the `owner/repo` names of the repos that never
  receive the file. The workflow copies each file verbatim, except that a workflow target's calls to
  `zgeoff/tools` workflows at `@main` move to the ref the run syncs from, and a Markdown target
  loses the blocks that need a file the repo does not receive.
- `optIn` (optional) — `true` delivers the entry only to a repo whose stub lists it in `include`.
- `build` (optional) — a bash command the workflow runs in the downstream checkout after the copy,
  for a file that is generated from a copied one. The runner has bash, git and jq, and nothing from
  the downstream repo's toolchain is installed, so the command uses those only.

A target under `.github/workflows/` needs the line `repo-sync delivers this file from zgeoff/tools`
in its source. Without it, the workflow never overwrites a workflow file the repo wrote itself.
`scripts/check-sync-manifest.sh` checks these rules in CI.

Files under [`workflow-callers/`](./workflow-callers/) are opt-in entries: each is a short workflow
that calls a reusable workflow in this repo, and a repo lists the ones it runs in the stub's
`include` input. A caller reads repo-specific values from repo variables, which its header comment
names, since the copy is otherwise verbatim. `workflow-bun-pr` runs
[`bun-checks.yml`](../.github/workflows/bun-checks.yml), the standard Bun pull-request checks.

Files under [`skills/`](./skills/) are the shared base of a Claude skill, each delivered by its
opt-in `skill-<name>` entry to `.claude/skills/<name>/`. The code-style base lives in this repo's
own [`.claude/skills/code-style/`](../.claude/skills/code-style/), because this repo's agents load
it there and the function-verb lint rule's test reads its verb list from it. Its script and the
script's test live in [`skills/code-style/`](./skills/code-style/). A repo keeps its own rules for
the same area in a `project-<name>` skill beside it, which repo-sync never touches, and the shared
skill tells the reader to load both. The entry lists every file in its skill folder, since the skill
links its references by relative path; `scripts/check-sync-manifest.sh` fails on a file the entry
omits. A skill's tests sit beside its scripts and stay here.

A reference that fits only some repos, such as one for a language a repo never uses, names the other
repos in its `except`, so they never load it. Every link to it in the entry's Markdown files sits in
a block, which the workflow removes for an excepted repo, and the text outside the block reads whole
without it:

```markdown
<!-- repo-sync needs ./references/rust.md -->

For Rust, read [Rust testing](./references/rust.md).

<!-- repo-sync end -->
```

The path is relative to the Markdown file. `scripts/check-sync-manifest.sh` fails on a link to an
excepted file outside its block. The workflow never deletes a file, so a repo that holds a copy from
before its `except` removes that copy itself.

Files under [`hooks/`](./hooks/) are Claude Code hooks, delivered as opt-in entries to
`.claude/hooks/<name>/`. Their tests stay here. `hook-skill-gate` delivers the skill gate: a
`PreToolUse` hook that denies an edit until the session has loaded every skill the path needs, and
names the missing skills. The gate holds no rules. A repo opts in with three changes, which
repo-sync never touches:

1. Add `hook-skill-gate` to `include` in `.github/workflows/repo-sync.yml`.
2. Write `.claude/skill-gate.json`. `match` is a glob over the path from the repo root, and a path
   that holds an `ignore` segment is never gated. A repo without this file has no gate. `Bun.Glob`
   misses deep paths for a `**` inside a brace group, such as `{e2e/**,test/**}`, so write one gate
   per pattern.

   ```json
   {
     "ignore": ["node_modules/", "dist/"],
     "gates": [
       { "match": "**/*.test.ts", "skills": ["testing", "project-testing"] },
       { "match": "**/*.md", "skills": ["docs-writing"] }
     ]
   }
   ```

3. Register the hook in `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Edit|Write|MultiEdit",
           "hooks": [
             {
               "type": "command",
               "command": "bun \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
             }
           ]
         }
       ]
     }
   }
   ```

A rule that names a skill missing from `.claude/skills/`, or a rules file that does not parse, never
denies an edit. The hook warns the user and the agent on every edit until the rule is fixed.

The gate counts the loads of the session that makes the edit. A subagent's tool call carries
`agent_id` beside the main session's `transcript_path`, and the gate reads that subagent's own
transcript, `<session>/subagents/agent-<agent_id>.jsonl` beside the main one. A subagent therefore
loads the skills itself, and the main session's loads never count for it. A compaction writes a
`compact_boundary` entry, and the loads before it no longer count: after a compaction, the gate
denies a gated edit until the session loads the skills again, and its denial says so.

The gate sees Edit, Write and MultiEdit only. A Bash command that writes a gated path, such as a
redirect, `tee`, `sed -i`, or a script, is not checked: a reliable check needs a full shell parser,
and a partial one refuses ordinary commands. This gap is accepted. Change a gated path only with
Edit, Write or MultiEdit; the denial says the same.

Files under [`pre-push/`](./pre-push/) are the pre-push baseline, delivered by the opt-in
`pre-push-baseline` entry. The baseline runs its jobs one at a time, so a push fits a 2 GiB host or
a machine shared by parallel agents. It runs `format:check` and `typecheck` over the whole tree, and
plain `oxlint` and the sibling tests over the files the branch changes. CI keeps every whole-tree
check required. The entry delivers three files, and its tests stay here:

- `.lefthook/pre-push-baseline.yml` — the lefthook jobs.
- `scripts/collect-branch-files.ts` — lists the files changed since the merge base with origin's
  default branch. lefthook's `{push_files}` lists every file in history for a branch with no
  upstream, so the baseline does not use it.
- `scripts/run-related-tests.ts` — runs each changed file's sibling test through the repo's `test`
  script.

Its build adds the package scripts `files:branch`, `lint:files` and `test:related` when the repo
lacks them, and never changes a script the repo already has. A repo opts in with three changes:

1. Add `pre-push-baseline` to `include` in `.github/workflows/repo-sync.yml`.
2. In `lefthook.yml`, add `extends: [.lefthook/pre-push-baseline.yml]`, and delete `parallel` and
   the baseline's jobs from `pre-push`. lefthook refuses to run a hook that sets both `parallel` and
   the baseline's `piped`. A job the repo keeps under `pre-push.jobs` runs before the baseline's, so
   keep only cheap repo-specific gates there.
3. Move every whole-tree check the baseline drops, such as type-aware lint, dead code and the full
   suite, into CI as a required check, if CI does not run it already.

The file list comes from the checked-out branch. `git push origin <other-branch>` lints and tests
the checked-out branch's files, not the pushed branch's, and CI catches what the hook skips.

A repo changes what a baseline job runs through the package script that the job calls, such as
`typecheck`. A job of the same name in `lefthook.yml` does not override it, because lefthook merges
the extended file over the repo's own.

A sync branch is force-pushed on every run, so a commit a person adds to it is lost on the next run.
Edit the source here instead.

## Dependency updates

Two parts keep a repo's dependencies current with no person filing an issue. Renovate opens the
update pull requests from the shared preset in [`default.json`](../default.json), which a repo takes
with `"extends": ["github>zgeoff/tools"]` in its own `renovate.json`, with no sync entry. The
`workflow-audit-fix` entry turns a red `bun audit` into a pull request. Neither part uses GitHub's
dependency graph, because the graph does not read `bun.lock`, so Dependabot alerts stay empty for
these repos.

### The Renovate preset

The preset sorts each update by its kind:

| Update                    | Release-age wait | Pull request                                 | Merge           |
| ------------------------- | ---------------- | -------------------------------------------- | --------------- |
| Security fix              | none             | one per package, labelled `security`         | on green checks |
| Patch                     | 7 days           | the weekly `patch updates` group             | on green checks |
| Dev-tool minor            | 7 days           | the weekly `dev tools` group                 | after review    |
| Other minor, or any major | 7 days           | one per package                              | after review    |
| `@zgeoff/*` package       | none             | one per package, at any level                | on green checks |
| zgeoff/tools sync tag     | none             | one per tag                                  | on green checks |
| Lock-file maintenance     | none             | weekly, for the dependencies of dependencies | after review    |

The 7-day wait matches the `minimumReleaseAge = 604800` in each repo's `bunfig.toml`, so Renovate
proposes no version that `bun install` would refuse. Security fixes come from OSV, through
`osvVulnerabilityAlerts`, for every package Renovate finds. Their lock refresh runs
`bun install --minimum-release-age=0`, so a fix younger than the gate installs, and so do the new
dependencies it brings. A `@zgeoff/*` bump keeps the gate for its dependencies: `bun install`
accepts the new release only when the repo lists the package in `minimumReleaseAgeExcludes`.

Renovate's bun manager reads no Bun catalog until renovatebot/renovate#42909 ships, so a regex
manager in the preset finds each `catalog` entry in `package.json`. A regex-manager bump changes
`package.json` alone, because Renovate runs a manager's lock-file update only for that manager's own
updates. A `postUpgradeTasks` step therefore runs `bun install` and commits `bun.lock` in the same
pull request. Renovate runs that command only when the admin's `allowedCommands` allows it. The free
Mend-hosted app allows no such command, so on that app every catalog bump fails
`bun install --frozen-lockfile`. The preset needs self-hosted Renovate with `allowedCommands` set to
`["^bun install --ignore-scripts( --minimum-release-age=0)?$"]`. The step installs the newest Bun,
not the version in `.bun-version`, as Renovate's own bun manager does. Remove the regex manager once
the bun manager reads catalogs.

### The audit-fix workflow

The `workflow-audit-fix` caller runs the reusable
[`audit-fix.yml`](../.github/workflows/audit-fix.yml) every day, by hand, and after a `PR`,
`Dependency Health` or `Dep Health` run fails. The job audits the default branch, and it opens a
pull request on the branch `audit-fix` only when the audit needs a change:

- `bun audit fix` updates each vulnerable package to the lowest fixed release that every dependent's
  range accepts.
- A fix younger than the release-age gate gets a `minimumReleaseAgeExcludes` entry in `bunfig.toml`,
  with a comment that dates the release and the day to remove the entry. The first run on or after
  that day removes the entry and its comment; an entry without the step's comment stays.
- An advisory that no fix reaches gets an entry in `audit-ignores.json`, which holds the package,
  the reason, and an expiry 30 days out. The `audit` script in `package.json` gets the matching
  `--ignore` flag.
- An expired ignore is audited again: the entry gets a new expiry while no fix reaches it, and goes
  when the audit no longer reports the advisory. An expiry more than 90 days out counts as expired.
- A rerun keeps the expiries on the open `audit-fix` branch, so it builds the same tree and leaves
  the pull request's checks alone.

An `--ignore` flag with no `audit-ignores.json` entry stays as it is. The pull request is labelled
`dependencies` and `security`. A pull request that adds or renews an ignore is also labelled
`audit-ignore` and waits for a person's review: the job turns auto-merge off for it. The job asks
GitHub to merge any other pull request on green checks, which needs auto-merge allowed in the repo
settings. A run that finds nothing to change deletes the `audit-fix` branch, which closes a stale
pull request.

The caller needs Bun 1.4.0 or newer in `.bun-version`, since `bun audit fix` arrived in 1.4.0, and
the repo-sync App secrets that [Wiring up a downstream repo](#wiring-up-a-downstream-repo) sets. The
App token pushes the branch, so the repo's checks run on the pull request; a push with the default
`GITHUB_TOKEN` starts no workflow run.

## Sync tags

A downstream repo calls the repo-sync workflow at a sync tag, never at `main`, and each run syncs
the files that tag holds. A change merged here reaches a repo only when the repo moves to a newer
tag, so a sweep of test or doc audits never sees the shared files change under it. A delivered
workflow that calls a workflow here, such as `workflow-bun-pr`, runs at the same tag.

The tags count up from `sync-v1`, and each one marks a commit on `main`. To release the sync files:

1. Tag the merged `main` with the next number, and push the tag:

   ```sh
   git fetch origin main
   git tag sync-v2 origin/main
   git push origin sync-v2
   ```

2. Between sweeps, move each downstream repo to the tag in a pull request.
   [`scripts/pin-tools-ref.sh`](../scripts/pin-tools-ref.sh) rewrites every call to a workflow here
   in the repo's `.github/workflows/`, and prints each file it changed:

   ```sh
   bash scripts/pin-tools-ref.sh sync-v2 ../<repo>
   ```

A tag is never moved or deleted, because the repos that pin it read it on every run.

## Wiring up a downstream repo

1. Install the repo-sync GitHub App on the repo, and set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

2. Copy [`repo-sync.yml`](./repo-sync.yml) to `.github/workflows/repo-sync.yml`, and pin it to the
   newest sync tag with `scripts/pin-tools-ref.sh`.
3. Dispatch it once: `gh workflow run repo-sync.yml -R zgeoff/<repo>`. Expect one pull request per
   entry the repo is behind on.
