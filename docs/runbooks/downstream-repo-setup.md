# Setting up a downstream repo

A downstream repo takes the files tools shares through [repo sync](../architecture/repo-sync.md).
Wire the repo up once, then opt in to each opt-in entry it runs. The agent hooks, the pre-push
baseline and the knip runner need changes in the repo beyond the `include` line, which repo-sync
never makes.

## Wiring up a downstream repo

The merge of the repo-sync stub in step 5 starts the repo's first sync, so do the other steps first.

1. Add the config of [noslop](https://github.com/zgeoff/noslop), the review bot, as `review.json` at
   the repo root, and merge it in a pull request of its own:

   ```json
   { "extends": "github:zgeoff/noslop-config" }
   ```

   noslop reviews a pull request under the config on `main`, so the first sync pull request needs
   this file on `main` first. noslop counts each file that the `synced` globs of the config match,
   the shared config's globs included, as code the pull request did not write. So a finding in a
   synced file takes a `deferred` reply that points at the issue for the fix in tools or
   zgeoff/skills, as
   [Answer a finding](https://github.com/zgeoff/noslop/blob/main/docs/guides/answer-a-finding.md)
   describes. Without the file on `main`, such a finding takes only `accepted-risk`, which only an
   admin of the repo can record. When the repo takes a synced file that the shared `synced` list
   misses, add a `synced` list of path globs, such as `["scripts/shared/**"]`, to `review.json`.
   noslop appends it to the shared list.

   ```sh
   gh api repos/zgeoff/<repo>/contents/review.json --jq .path
   ```

   Expect: `review.json`.

2. Install the repo-sync GitHub App on the repo. Set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

   Expect: `gh secret list -R zgeoff/<repo>` lists both names.

3. Allow auto-merge in the repo, so a sync pull request merges on green checks:

   ```sh
   gh api -X PATCH repos/zgeoff/<repo> -F allow_auto_merge=true --jq .allow_auto_merge
   ```

   Expect: `true`.

4. Keep the repo's skills in `.agents/skills/`, and link `.claude/skills` to it, as
   [Skills](../architecture/repo-sync.md#skills) describes. Run this at the repo root, and merge the
   link:

   ```sh
   mkdir -p .agents/skills .claude && ln -s ../.agents/skills .claude/skills && git add .claude/skills
   ```

   Expect: `git ls-files -s .claude/skills` prints mode `120000`.

5. Copy [`repo-sync.yml`](../../sync/repo-sync.yml) to `.github/workflows/repo-sync.yml`. Pin its
   `uses:` line to the newest commit on `main` of tools whose `Main` workflow run passed. A repo
   pinned to a commit whose run failed or still runs skips the sync until a newer commit turns
   green, and a sync pull request moves the pin to that commit. Print the newest green commit:

   ```sh
   gh api -X GET repos/zgeoff/tools/actions/workflows/main.yml/runs -f branch=main -f event=push -f status=success -f per_page=1 --jq '.workflow_runs[0].head_sha'
   ```

   Replace `@main` on the `uses:` line with `@<commit> # main`, where `<commit>` is the printed
   commit. Merge the stub. Expect one sync pull request that carries every entry the repo is behind
   on. If none opens, start the sync with `gh workflow run repo-sync.yml -R zgeoff/<repo>`. From
   then on, each merge to `main` of tools that changes a synced file opens a sync pull request, or
   updates the one that is open.

## Opting in to the agent hooks

A repo opts in to the `hook-start` entry in five steps, plus a sixth for a repo that uses Codex.
`agent-hooks init` refuses to run until `.claude/hooks/start.ts` exists, so that file arrives first:

1. Add `hook-start` to `include` in `.github/workflows/repo-sync.yml`.
2. Dispatch repo-sync with `gh workflow run repo-sync.yml -R zgeoff/<repo>`, and merge its pull
   request. Expect `main` to hold `.claude/hooks/start.ts`.
3. Run `bun add -d @zgeoff/agent-hooks` at the repo root. Expect `bun.lock` to list the package.
4. Check that `main` holds `.claude/skill-gate.json`, which a new repo takes from repo-sync. For
   gates of the repo's own, follow
   [The shared rules](../guides/skill-gate-rules.md#the-shared-rules).
5. Run `bunx agent-hooks init` at the repo root. Expect
   `agent-hooks init wrote .claude/settings.json and .codex/hooks.json`.
6. For a repo that also uses Codex, trust the hook definitions in the Codex CLI with `/hooks`.

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

## Opting in to the knip runner

knip run in a worktree inside another checkout, such as `<clone>/.worktrees/<branch>`, where
`<clone>` is the outer checkout and `<branch>` the worktree's branch, reads the outer checkout's
`tsconfig.json`. When that file extends a package the outer checkout has not installed, knip fails
with `File '<package>/tsconfig.json' not found`, where `<package>` is the package in its `extends`
field. The `knip-runner` entry delivers `scripts/run-knip.sh`, which runs knip so that it reads the
repo's own `tsconfig.json`. The runner needs a `tsconfig.json` at the repo root, and it analyses the
whole repo, so only the root `package.json` calls it. knip reads a relative path given to
`--reporter`, `--cache-location` or `--directory` from the `scripts/` folder, so give each of these
an absolute path. A repo opts in with one pull request that makes three changes:

1. Add `knip-runner` to `include` in `.github/workflows/repo-sync.yml`.
2. Copy [`run-knip.sh`](../../sync/deadcode/run-knip.sh) to `scripts/run-knip.sh` with its mode, as
   in `install -m 0755 <tools>/sync/deadcode/run-knip.sh scripts/run-knip.sh`, where `<tools>` is a
   checkout of tools at the newest commit on `main` whose `Main` run passed. Expect
   `git ls-files -s scripts/run-knip.sh` to show `100755` once you stage it. If it shows `100644`,
   run `git update-index --chmod=+x scripts/run-knip.sh`.
3. In `package.json`, replace each `knip` command in the `deadcode` script with
   `bash scripts/run-knip.sh`, and keep its arguments, as in
   `bash scripts/run-knip.sh --production`. Expect `bun run deadcode` to pass in a worktree under
   `.worktrees/`.

The merge changes the stub, so repo-sync runs on the newest green commit of tools. The copy matches
that commit's file in content and mode, so the run commits nothing for the entry, as
[Delivery](../architecture/repo-sync.md#delivery) describes.

## Taking the baseline from chex

A repo that installs [`@zgeoff/chex`](../../packages/chex/README.md) takes the same baseline with
one `extends` line in place of the repo-sync entry:

1. Run `bun add -d @zgeoff/chex @zgeoff/rig @zgeoff/diet @commitlint/cli @zgeoff/commitlint-config`
   at the repo root. Expect `bun.lock` to list the five packages.
2. Run `bun x --no-install chex init` at the repo root. Expect
   `chex init: lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml`, then
   `chex init: lefthook.yml runs chex-baseline first in pre-commit and pre-push, which fails when node_modules/@zgeoff/chex/lefthook.yml is missing`,
   and, for a repo with no `check:docs` script,
   `chex init: package.json runs "chex prose length links readmes skill" as check:docs`. `chex init`
   adds the chex baseline to an `extends` list in block form or in one-line brackets, such as the
   `extends: [.lefthook/pre-push-baseline.yml]` that the repo-sync entry asks for. It refuses
   `extends` written as a single path with no brackets, such as `extends: local.yml`, and a bracket
   list across lines; for these, add the chex baseline to the list by hand. It also refuses a
   `pre-commit` or `pre-push` hook whose jobs are not a block list; for these, write the jobs as a
   block list, then run `chex init` again.
3. Edit `check:docs` to name the docs checks the repo takes, such as
   `chex prose length links vision`. CI runs each check that `check:docs` names as its own step.
4. In `lefthook.yml`, delete `parallel` and the baseline's jobs from `pre-push` and `pre-commit`, as
   step 2 of [Opting in to the pre-push baseline](#opting-in-to-the-pre-push-baseline) describes. To
   keep a job of the repo's own in place of a baseline job, such as a typecheck under a lower memory
   cap, list the baseline job's name, such as `chex-typecheck`, under the hook's `exclude_tags`, as
   [Limits of the baseline](../architecture/pre-push-baseline.md#limits-of-the-baseline) shows.
5. If the repo takes the `pre-push-baseline` entry, delete it from `include` in
   `.github/workflows/repo-sync.yml`, and delete `.lefthook/pre-push-baseline.yml` from `extends` in
   `lefthook.yml`, so the push runs one baseline.
