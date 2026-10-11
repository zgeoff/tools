# AGENTS.md partial

`shared.md` holds the cross-project guidelines that repo-sync's `agents` entry delivers, with
`scripts/build-agents-md.sh`, to a downstream repo that builds its `AGENTS.md` from `shared.md` and
its own `agents/project.md`. A downstream repo keeps its vendored copy as delivered and never edits
it locally.

This repo's own `AGENTS.md` is hand-kept: edit it directly. It does not build from `shared.md`.

## Wiring up a downstream repo

The repo-sync workflow delivers `shared.md` and `scripts/build-agents-md.sh` as the `agents` entry,
then rebuilds `AGENTS.md`. [`sync/README.md`](../sync/README.md) covers installing it.
