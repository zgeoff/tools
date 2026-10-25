# Documentation

The docs of tools: how its shared files and packages work, and the steps a contributor follows.

## Architecture

- [Repo sync](./architecture/repo-sync.md): manifest entries, each kind of entry, retired files, and
  the sync branch.
- [Sync tags](./architecture/sync-tags.md): why a repo syncs at a tag, never at `main`.
- [The pre-push baseline](./architecture/pre-push-baseline.md): what the baseline runs and the files
  it delivers.
- [Memory caps](./architecture/memory-caps.md): the script that runs a command inside a cgroup
  memory cap, and its modes.
- [Dependency updates](./architecture/dependency-updates.md): the Renovate preset, the self-hosted
  Renovate run, and the audit-fix workflow.
- [The Socket config](./architecture/socket-config.md): how the `socket` entry limits Socket's
  scans.
- [Skill gate](./architecture/skill-gate.md): how `@zgeoff/skill-gate` decides which edits, Bash
  commands and tool calls it denies.
- [@zgeoff/oxlint-config](./architecture/oxlint-config.md), with its
  [code-style rules](./architecture/oxlint-config-code-style.md),
  [import zones](./architecture/oxlint-config-import-zones.md) and
  [test-file rules](./architecture/oxlint-config-tests.md).
- [std typed helpers](./architecture/std-typed-helpers.md): the helpers in `@zgeoff/std` that each
  hold the one type assertion their job needs.
- [format-codemod rules](./architecture/format-codemod-rules.md): the blank lines the codemod adds
  and removes between statements.
- [format-codemod inputs](./architecture/format-codemod-inputs.md): how the CLI turns its arguments
  into the files it formats.

## Guides

- [Writing skill-gate rules](./guides/skill-gate-rules.md): path gates, tool gates, and the mistakes
  in a rules file that the gate tolerates.
- [Gating Codex edits](./guides/skill-gate-codex.md): register the skill gate as a Codex hook, and
  how the gate counts loads there.

## Runbooks

- [Setting up a downstream repo](./runbooks/downstream-repo-setup.md): wire a repo up, and opt in to
  the skill gate and the pre-push baseline.
- [Releasing the sync files](./runbooks/releasing-sync-files.md): push a new sync tag and move each
  repo to it.
