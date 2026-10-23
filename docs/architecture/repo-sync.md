# Repo sync

Repo sync keeps the files every downstream repo carries a copy of current in each repo.
[`manifest.json`](../../sync/manifest.json) lists them as entries, and the
[repo-sync workflow](../../.github/workflows/repo-sync.yml) delivers them to a downstream repo as
one pull request on the branch `repo-sync/zgeoff-tools`, with one commit for each entry that
changed. A run while that pull request is open updates it.
[`repo-sync.yml`](../../sync/repo-sync.yml) is the stub a downstream repo installs to call it. A
downstream repo calls the workflow at a sync tag, as [Sync tags](./sync-tags.md) describes.

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

## Workflow callers

Files under [`workflow-callers/`](../../sync/workflow-callers/) are opt-in entries: each is a short
workflow that calls a reusable workflow in this repo, and a repo lists the ones it runs in the
stub's `include` input. A caller reads repo-specific values from repo variables, which its header
comment names, since the copy is otherwise verbatim. `workflow-bun-pr` runs
[`bun-checks.yml`](../../.github/workflows/bun-checks.yml), the standard Bun pull-request checks.

## Skills

Files under [`skills/`](../../sync/skills/) are the shared base of a Claude skill, each delivered by
its `skill-<name>` entry to `.claude/skills/<name>/`. A skill entry is opt-in, so a repo takes only
the skills for the work it holds. One exception: `skill-pr-evidence` reaches every repo, because
every agent that opens a pull request needs it. The code-style base lives in this repo's own
[`.claude/skills/code-style/`](../../.claude/skills/code-style/), because this repo's agents load it
there and the verb-contract lint rule's test reads its role table from it. A repo keeps its own
rules for the same area in a `project-<name>` skill beside it, which repo-sync never touches, and
the shared skill tells the reader to load both. The entry lists every file in its skill folder,
since the skill links its references by relative path; `scripts/check-sync-manifest.sh` fails on a
file the entry omits. A skill's tests sit beside its scripts and stay in tools.

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
excepted file outside its block. The workflow leaves an excepted file in place, so a repo that holds
a copy from before its `except` removes that copy itself.

## Hooks

Files under [`hooks/`](../../sync/hooks/) are Claude Code hooks, delivered as opt-in entries to
`.claude/hooks/<name>/`. Their tests stay in tools. `hook-skill-gate` delivers the skill gate's
entry point, a file that runs the gate from
[`@zgeoff/skill-gate`](../../packages/skill-gate/README.md). The gate denies an edit until the
session has loaded every skill the path needs, and a call to a gated tool until the session has
loaded its skills and read its reference files. The package README describes what it allows, blocks
and warns on. The repo takes a gate fix by bumping the package, and the entry point changes only
when the package's API does. A repo opts in with four changes, which repo-sync never touches, as
[Opting in to the skill gate](../runbooks/downstream-repo-setup.md#opting-in-to-the-skill-gate)
lists.

The pre-push baseline is an entry of its own kind, which
[The pre-push baseline](./pre-push-baseline.md) describes.

## Retired files

A file that an earlier manifest delivered and the current one no longer lists is retired, and the
workflow deletes the repo's copy in its own commit, `retired-files`. It deletes a copy only when the
copy matches a version of a source that tools delivered to that path, so a file the repo wrote
itself or edited after the sync stays. A renamed file is the exception: when its source moved to a
source that the same entry still delivers, and the run wrote the new target, the old copy goes even
when the repo edited it, since the sync overwrites the file at its new path. git's rename detection
finds the move in this repo's history, so a repo that skipped the tags since the move loses the old
copy too.

A retired file also stays while its entry is still in the manifest and the run did not sync that
entry, because the entry's current files can still need it. That covers an entry the repo skips or
leaves out of `include`, and an entry that failed. A retired file of an entry that the manifest no
longer holds stays when the repo lists that entry in `skip`. A retired workflow file stays while the
repo takes no entry with a workflow target, because the run's token then cannot push a change under
`.github/workflows/`.
[`scripts/remove-retired-sync-files.sh`](../../scripts/remove-retired-sync-files.sh) reads the
earlier manifests from this repo's history, so the workflow checks out the full history.

## The sync branch

The sync branch is force-pushed on every run, so a commit a person adds to it is lost on the next
run. Edit the source in tools instead. An entry that fails, through a workflow conflict or its
build, is left out of the pull request, and the run fails after the other entries sync.
