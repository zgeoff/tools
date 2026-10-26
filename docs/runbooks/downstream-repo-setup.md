# Setting up a downstream repo

A downstream repo takes the files tools shares through [repo sync](../architecture/repo-sync.md).
Wire the repo up once, then opt in to each opt-in entry it runs. The skill gate and the pre-push
baseline need changes in the repo beyond the `include` line, which repo-sync never makes.

## Wiring up a downstream repo

1. Install the repo-sync GitHub App on the repo, and set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

2. Copy [`repo-sync.yml`](../../sync/repo-sync.yml) to `.github/workflows/repo-sync.yml`, and pin it
   to the newest sync tag with `scripts/pin-tools-ref.sh`.
3. Dispatch it once: `gh workflow run repo-sync.yml -R zgeoff/<repo>`. Expect one pull request that
   carries every entry the repo is behind on.

## Opting in to the skill gate

A repo opts in to the `hook-skill-gate` entry with four changes, plus a fifth for a repo that uses
Codex. Repo-sync touches none of them:

1. Add `hook-skill-gate` to `include` in `.github/workflows/repo-sync.yml`.
2. Run `bun add -d @zgeoff/skill-gate` at the repo root. Without the package, the entry point fails
   on every edit and gates nothing.
3. Write the rules in `.claude/skill-gate.json`, as the package README's
   [Rules](../../packages/skill-gate/README.md#rules) section shows. A repo without this file has no
   gate.
4. Register the hook in `.claude/settings.json`, as the package README's
   [Entry point](../../packages/skill-gate/README.md#entry-point) section shows. The `PreToolUse`
   matcher names each tool that a tool gate names.
5. For a repo that also uses Codex, register the hook in `.codex/hooks.json` with `--harness codex`,
   as the package README's [Codex](../../packages/skill-gate/README.md#codex) section shows, then
   trust the hook definitions in the Codex CLI with `/hooks`. Codex reads skills from
   `.agents/skills`, so link it to `.claude/skills`.

## Opting in to the pre-push baseline

The [pre-push baseline](../architecture/pre-push-baseline.md) runs its jobs one at a time, so a push
fits a 2 GiB host. A repo opts in with four changes:

1. Install `ts-pattern`, which the workflow lint imports, unless `package.json` already lists it:

   ```bash
   bun add --dev --exact ts-pattern
   ```

   Expect `package.json` to list `ts-pattern` and `bun.lock` to change. Without it, the `workflows`
   job fails on the first push that changes a workflow.

2. Add `pre-push-baseline` to `include` in `.github/workflows/repo-sync.yml`.
3. In `lefthook.yml`, add `extends: [.lefthook/pre-push-baseline.yml]`, and delete `parallel` and
   the baseline's jobs from `pre-push` and `pre-commit`. lefthook refuses to run a hook that sets
   both `parallel` and the baseline's `piped`. A job the repo keeps under `pre-push.jobs` runs
   before the baseline's, so keep only cheap repo-specific gates there.
4. Move every whole-tree check the baseline drops, such as type-aware lint, dead code and the full
   suite, into CI as a required check, if CI does not run it already.
