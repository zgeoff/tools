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
something changed. PRs opened with the default `GITHUB_TOKEN` don't trigger the target repo's own
`pull_request` workflows; if downstream checks must run on sync PRs, pass a GitHub App or PAT token
to the stub instead.
