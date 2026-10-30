# sync

Files every downstream repo carries a copy of. [`manifest.json`](./manifest.json) lists them as
entries, and the [repo-sync workflow](../.github/workflows/repo-sync.yml) delivers them to a
downstream repo as one pull request. [`repo-sync.yml`](./repo-sync.yml) is the stub a downstream
repo installs to call it. [Repo sync](../docs/architecture/repo-sync.md) describes what an entry
holds and how a run delivers, updates and retires the files.

## Layout

- [`manifest.json`](./manifest.json) — the entries, which `scripts/check-sync-manifest.sh` checks in
  CI.
- [`repo-sync.yml`](./repo-sync.yml) — the stub that calls the repo-sync workflow at a pinned
  commit.
- [`workflow-callers/`](./workflow-callers/) — workflows that each call a reusable workflow in this
  repo, all opt-in but the repo-sync guard.
- [`skills/`](./skills/) — the shared base of each Claude skill, with its scripts' tests.
- [`docs-vision/`](./docs-vision/) — the vision doc check, which docs-writing's `check-length.sh`
  runs in a repo that takes it, with its test.
- [`hooks/`](./hooks/) — Claude Code hooks, such as the skill gate's entry point, with their tests.
- [`pre-push/`](./pre-push/) — the [pre-push baseline](../docs/architecture/pre-push-baseline.md)
  and the [memory-cap script](../docs/architecture/memory-caps.md), with their tests.

## Documentation

- [Repo sync](../docs/architecture/repo-sync.md): how a merge to `main` reaches each repo, manifest
  entries, each kind of entry, retired files, and the sync branch.
- [The pre-push baseline](../docs/architecture/pre-push-baseline.md): what the baseline runs and the
  files it delivers.
- [Memory caps](../docs/architecture/memory-caps.md): `@zgeoff/diet` and the synced script, which
  run a command inside a cgroup memory cap, and their modes.
- [Dependency updates](../docs/architecture/dependency-updates.md): the Renovate preset, the
  self-hosted Renovate run, and the audit-fix workflow.
- [The Socket config](../docs/architecture/socket-config.md): how the `socket` entry limits Socket's
  scans.
- [Setting up a downstream repo](../docs/runbooks/downstream-repo-setup.md): wire a repo up, and opt
  in to the skill gate and the pre-push baseline.
