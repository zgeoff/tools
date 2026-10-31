# Setting up a downstream repo

A downstream repo takes the files tools shares through [repo sync](../architecture/repo-sync.md).
Wire the repo up once, then opt in to each opt-in entry it runs. The agent hooks and the pre-push
baseline need changes in the repo beyond the `include` line, which repo-sync never makes.

## Wiring up a downstream repo

1. Install the repo-sync GitHub App on the repo, and set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

2. Copy [`repo-sync.yml`](../../sync/repo-sync.yml) to `.github/workflows/repo-sync.yml`, and pin
   its `uses:` line to the newest commit on `main` of tools whose `Main` run passed. A commit whose
   run failed or still runs is newer than every green one, so a repo pinned to it skips the sync
   until a newer commit turns green. Print the newest green commit:

   ```sh
   gh api -X GET repos/zgeoff/tools/actions/workflows/main.yml/runs -f branch=main -f event=push -f status=success -f per_page=1 --jq '.workflow_runs[0].head_sha'
   ```

   Replace `@main` on the `uses:` line with `@<commit> # main`, where `<commit>` is the printed
   commit.

3. Allow auto-merge in the repo, so a sync pull request merges on green checks:

   ```sh
   gh api -X PATCH repos/zgeoff/<repo> -F allow_auto_merge=true --jq .allow_auto_merge
   ```

   Expect: `true`.

4. Dispatch it once: `gh workflow run repo-sync.yml -R zgeoff/<repo>`. Expect one pull request that
   carries every entry the repo is behind on. From then on, each merge to `main` of tools that
   changes a synced file opens or updates that pull request.

## Opting in to the agent hooks

A repo opts in to the `hook-start` entry in five steps, plus a sixth for a repo that uses Codex.
`agent-hooks init` refuses to run until the stub exists, so the stub arrives first:

1. Add `hook-start` to `include` in `.github/workflows/repo-sync.yml`.
2. Dispatch repo-sync with `gh workflow run repo-sync.yml -R zgeoff/<repo>`, and merge its pull
   request. Expect the default branch to hold `.claude/hooks/start.ts`.
3. Run `bun add -d @zgeoff/agent-hooks` at the repo root. Expect `bun.lock` to list the package.
4. Write the skill gate's rules in `.claude/skill-gate.json`, as
   [Writing skill-gate rules](../guides/skill-gate-rules.md) describes. A repo without this file has
   no gate.
5. Run `bunx agent-hooks init` at the repo root. Expect
   `agent-hooks init wrote .claude/settings.json and .codex/hooks.json`.
6. For a repo that also uses Codex, trust the hook definitions in the Codex CLI with `/hooks`. Codex
   reads skills from `.agents/skills`, so link it to `.claude/skills`.

## Opting in to the pre-push baseline

The [pre-push baseline](../architecture/pre-push-baseline.md) runs its jobs one at a time, so a push
fits a 2 GiB host. A repo opts in with three changes:

1. Add `pre-push-baseline` to `include` in `.github/workflows/repo-sync.yml`.
2. In `lefthook.yml`, add `extends: [.lefthook/pre-push-baseline.yml]`, and delete `parallel` and
   the baseline's jobs from `pre-push` and `pre-commit`. lefthook refuses to run a hook that sets
   both `parallel` and the baseline's `piped`. A job the repo keeps under `pre-push.jobs` runs
   before the baseline's, so keep only cheap repo-specific gates there.
3. Move every whole-tree check the baseline drops, such as type-aware lint, dead code and the full
   suite, into CI as a required check, if CI does not run it already.

## Taking the baseline from chex

A repo that installs [`@zgeoff/chex`](../../packages/chex/README.md) takes the same baseline with
one `extends` line in place of the repo-sync entry:

1. Run `bun add -d @zgeoff/chex @zgeoff/rig @zgeoff/diet @commitlint/cli @zgeoff/commitlint-config`
   at the repo root. Expect `bun.lock` to list the five packages.
2. Run `bun x --no-install chex init` at the repo root. Expect
   `chex init: lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml`, and, for a repo with no
   `check:docs` script,
   `chex init: package.json runs "chex prose length links skill" as check:docs`. `chex init` adds
   the chex baseline to an `extends` list in block form or in one-line brackets, such as the
   `extends: [.lefthook/pre-push-baseline.yml]` that the repo-sync entry asks for. It refuses
   `extends` written as a single path with no brackets, such as `extends: local.yml`, and a bracket
   list across lines; for these, add the chex baseline to the list by hand.
3. Edit `check:docs` to name the docs checks the repo takes, such as
   `chex prose length links vision`. CI runs each check that it names as its own step.
4. In `lefthook.yml`, delete `parallel` and the baseline's jobs from `pre-push` and `pre-commit`, as
   step 2 of [Opting in to the pre-push baseline](#opting-in-to-the-pre-push-baseline) describes.
5. If the repo takes the `pre-push-baseline` entry, delete it from `include` in
   `.github/workflows/repo-sync.yml`, and delete `.lefthook/pre-push-baseline.yml` from `extends` in
   `lefthook.yml`, so the push runs one baseline.
