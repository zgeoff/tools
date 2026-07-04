# AGENTS.md partials

The repo-root `AGENTS.md` is generated — never edit it directly.

- `shared.md` — cross-project guidelines. This repo is the canonical source; downstream repos
  receive a vendored copy via the sync workflow and must not edit it locally.
- `project.md` — guidelines specific to the containing repo, appended after the shared partial.

Rebuild with `bash scripts/build-agents-md.sh agents/shared.md agents/project.md AGENTS.md`
(`bun run build:agents` here). CI fails the PR when `AGENTS.md` doesn't match the partials.

## Wiring up a downstream repo

1. Add `agents/project.md` with the repo-specific rules.
2. Add a stub workflow that calls the reusable sync workflow:

   ```yaml
   name: sync-agents
   on:
     schedule:
       - cron: '0 6 * * 1'
     workflow_dispatch:
   jobs:
     sync:
       uses: zgeoff/tools/.github/workflows/sync-agents.yml@main
       permissions:
         contents: write
         pull-requests: write
   ```

3. Run the stub once (`workflow_dispatch`) — the resulting PR vendors `agents/shared.md` and
   `scripts/build-agents-md.sh` and generates `AGENTS.md`.
4. Add a drift check to the repo's CI so hand-edits to the generated file fail the build:

   ```yaml
   - run: bash scripts/build-agents-md.sh agents/shared.md agents/project.md AGENTS.md
   - run: git diff --exit-code
   ```

The sync workflow re-vendors the shared partial and rebuilds `AGENTS.md`, opening a PR only when
something changed.

## Sync PRs and CI

GitHub suppresses workflow runs for events created by the automatic `GITHUB_TOKEN` (its
anti-recursion rule), so by default a sync PR arrives with **no checks**: the target repo's
`pull_request` workflows never fire. Fine when merging on sight — checks still run on `main` after
merge. But if the repo has branch protection with required checks, the sync PR can never satisfy
them and is unmergeable.

To make checks run, open the PR with a different identity: create a fine-grained PAT (or GitHub App
token) with contents + pull-requests write on the repo, store it as a repo secret, and pass it to
the stub:

```yaml
jobs:
  sync:
    uses: zgeoff/tools/.github/workflows/sync-agents.yml@main
    secrets:
      token: ${{ secrets.SYNC_TOKEN }}
```

With a token supplied, the `permissions` block on the stub job is no longer needed.
