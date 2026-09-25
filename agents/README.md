# AGENTS.md partials

The repo-root `AGENTS.md` is generated — never edit it directly.

- `shared.md` — cross-project guidelines. This repo is the canonical source; downstream repos
  receive a vendored copy via the repo-sync workflow and must not edit it locally.
- `project.md` — guidelines specific to the containing repo, appended after the shared partial.

Rebuild with `bash scripts/build-agents-md.sh agents/shared.md agents/project.md AGENTS.md`
(`bun run build:agents` here). CI fails the PR when `AGENTS.md` doesn't match the partials.

## Wiring up a downstream repo

The repo-sync workflow delivers `shared.md` and `scripts/build-agents-md.sh` as the `agents` entry,
then rebuilds `AGENTS.md`. [`sync/README.md`](../sync/README.md) covers installing it.
