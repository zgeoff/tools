# sync

Files every downstream repo carries a copy of. [`manifest.json`](./manifest.json) lists them as
entries, and the [repo-sync workflow](../.github/workflows/repo-sync.yml) delivers each entry to a
downstream repo as one pull request on the branch `sync/<name>`. [`repo-sync.yml`](./repo-sync.yml)
is the stub a downstream repo installs to call it.

## Manifest entries

An entry holds:

- `name` — the branch suffix and the name that `skip` and `include` take.
- `description` — one line, which the workflow writes into the pull request body.
- `files` — `source` (a path in this repo), `target` (a path in the downstream repo), and an
  optional `mode` such as `0755`. The workflow copies each file verbatim.
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
names, since the copy itself is verbatim. `workflow-bun-pr` runs
[`bun-checks.yml`](../.github/workflows/bun-checks.yml), the standard Bun pull-request checks.

Files under [`skills/`](./skills/) are the shared base of a Claude skill, delivered by the opt-in
`skill-testing` and `skill-docs-writing` entries to `.claude/skills/<name>/`. A repo keeps its own
rules for the same area in a `project-<name>` skill beside it, which repo-sync never touches, and
the shared skill tells the reader to load both. The entry lists every file in its skill folder,
since the skill links its references by relative path; `scripts/check-sync-manifest.sh` fails on a
file the entry omits.

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

## Wiring up a downstream repo

1. Install the repo-sync GitHub App on the repo, and set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

2. Add `agents/project.md` with the repo's own rules, and add `agents/shared.md` and `AGENTS.md` to
   the repo's formatter ignore list, since both arrive formatted by this repo's settings.
3. Copy [`repo-sync.yml`](./repo-sync.yml) to `.github/workflows/repo-sync.yml`.
4. Dispatch it once: `gh workflow run repo-sync.yml -R zgeoff/<repo>`. Expect one pull request per
   entry the repo is behind on.
5. Add a drift check to the repo's CI, so a hand edit to `AGENTS.md` fails the build:

   ```yaml
   - run: bash scripts/build-agents-md.sh agents/shared.md agents/project.md AGENTS.md
   - run: git diff --exit-code AGENTS.md
   ```
