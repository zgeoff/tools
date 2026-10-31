# Documentation

The docs of tools: how its shared files and packages work, and the steps a contributor follows.

## Architecture

- [Repo sync](./architecture/repo-sync.md): how a merge to `main` reaches each repo, manifest
  entries, each kind of entry, retired files, and the sync branch.
- [The pre-push baseline](./architecture/pre-push-baseline.md): what the baseline runs and the files
  it delivers.
- [Memory caps](./architecture/memory-caps.md): `@zgeoff/diet` and the synced script, which run a
  command inside a cgroup memory cap, and their modes.
- [Dependency updates](./architecture/dependency-updates.md): the Renovate preset, the self-hosted
  Renovate run, and the audit-fix workflow.
- [The Socket config](./architecture/socket-config.md): how the `socket` entry limits Socket's
  scans.
- [Agent hooks](./architecture/agent-hooks.md): the start-up stub that every hook entry runs, how it
  installs `@zgeoff/agent-hooks`, and how it fails closed.
- [Skill gate](./architecture/skill-gate.md): how the skill gate decides which edits, Bash commands
  and tool calls it denies.
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
- [Setting up a browser lane](./guides/browser-lane.md): the command, the preload, and the memory
  cap of a repo's browser lane.
- [Gating Codex edits](./guides/skill-gate-codex.md): register the skill gate as a Codex hook, and
  how the gate counts loads there.

## Runbooks

- [Setting up a downstream repo](./runbooks/downstream-repo-setup.md): wire a repo up, and opt in to
  the agent hooks and the pre-push baseline.
