# sync

Files every downstream repo carries a copy of. [`manifest.json`](./manifest.json) lists them as
entries, and the [repo-sync workflow](../.github/workflows/repo-sync.yml) delivers them to a
downstream repo as one pull request. [`repo-sync.yml`](./repo-sync.yml) is the stub a downstream
repo installs to call it. [Repo sync](../docs/architecture/repo-sync.md) describes what an entry
holds and how a run delivers, updates and retires the files.

## Layout

- [`manifest.json`](./manifest.json) — the entries, which `scripts/check-sync-manifest.sh` checks in
  CI.
- [`repo-sync.yml`](./repo-sync.yml) — the stub that calls the repo-sync workflow at a sync tag.
- [`workflow-callers/`](./workflow-callers/) — workflows that each call a reusable workflow in this
  repo, all opt-in but the repo-sync guard.
- [`skills/`](./skills/) — the shared base of each Claude skill, with its scripts' tests.
- [`hooks/`](./hooks/) — Claude Code hooks, such as the skill gate's entry point, with their tests.
- [`pre-push/`](./pre-push/) — the [pre-push baseline](../docs/architecture/pre-push-baseline.md)
  and the [memory-cap script](../docs/architecture/memory-caps.md), with their tests.

## Documentation

- [Repo sync](../docs/architecture/repo-sync.md): manifest entries, each kind of entry, retired
  files, and the sync branch.
- [The pre-push baseline](../docs/architecture/pre-push-baseline.md): what the baseline runs and the
  files it delivers.
- [Sync tags](../docs/architecture/sync-tags.md): why a repo syncs at a tag, never at `main`.
- [Memory caps](../docs/architecture/memory-caps.md): the script that runs a command inside a cgroup
  memory cap, and its modes.
- [Dependency updates](../docs/architecture/dependency-updates.md): the Renovate preset, the
  self-hosted Renovate run, and the audit-fix workflow.
- [The Socket config](../docs/architecture/socket-config.md): how the `socket` entry limits Socket's
  scans.
- [Setting up a downstream repo](../docs/runbooks/downstream-repo-setup.md): wire a repo up, and opt
  in to the skill gate and the pre-push baseline.
- [Releasing the sync files](../docs/runbooks/releasing-sync-files.md): push a new sync tag and move
  each repo to it.
