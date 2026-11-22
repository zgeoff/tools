# Documentation

The docs of tools: how its shared files and packages work, and the steps a contributor follows.

## Architecture

- [Repo sync](./architecture/repo-sync.md): how a merge to `main` reaches each repo, manifest
  entries, each kind of entry, retired files, and the sync branch.
- [The pre-push baseline](./architecture/pre-push-baseline.md): what the baseline runs.
- [Memory caps](./architecture/memory-caps.md): `@zgeoff/diet`, which runs a command inside a cgroup
  memory cap, and its modes.
- [rig](./architecture/rig.md): `@zgeoff/rig`, the lane table, a lane's run, the browser lane, and
  how the lint rules read the same limits.
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
  [import zones](./architecture/oxlint-config-import-zones.md),
  [feature folders](./architecture/oxlint-config-feature-folders.md),
  [test-file rules](./architecture/oxlint-config-tests.md) and
  [seeding rules](./architecture/oxlint-config-seeding.md).
- [std typed helpers](./architecture/std-typed-helpers.md): the helpers in `@zgeoff/std` that each
  hold the one type assertion their job needs.
- [std file lock](./architecture/std-file-lock.md): `withFileLock`, the cross-process lock in
  `@zgeoff/std`, and how a crashed holder frees it.
- [MCP OAuth server](./architecture/mcp-auth.md): `@zgeoff/mcp-auth`, the OAuth server that atc,
  boxxy, pepys and impz share for their `/mcp` routes, how a grant is stored and revoked, and its
  tokens and limits.
- [storyboard](./architecture/storyboard.md): `@zgeoff/storyboard`, how a scene's changes are placed
  in time, how the dark and light files are written, and the two check suites.
- [The testing kit](./architecture/testing-kit.md): the rules that span the subpaths of
  `@zgeoff/testing`, and why each holds.
- [format-codemod rules](./architecture/format-codemod-rules.md): the blank lines the codemod adds
  and removes between statements.
- [format-codemod inputs](./architecture/format-codemod-inputs.md): how the CLI turns its arguments
  into the files it formats.

## Guides

- [Memory budgets](./guides/memory-budgets.md): the peak memory a pre-push job and a test suite keep
  to on each kind of host.
- [Writing skill-gate rules](./guides/skill-gate-rules.md): path gates, tool gates, and the mistakes
  in a rules file that the gate tolerates.
- [Setting up the browser lane](./guides/browser-lane.md): adopt rig's browser lane, its build
  script, page code and memory cap.
- [Programs in e2e tests](./guides/e2e-programs.md): declare the programs an `e2e/` folder runs, and
  find each one's command with `resolveProgram`.
- [Benchmarks and evaluations](./guides/benchmarks-and-evals.md): `defineBench`, `rig bench` and
  `rig eval`.
- [The test layout](./guides/test-layout.md): the faults `chex test-layout` reports and how to fix
  each.
- [Testing a program with @zgeoff/testing](./guides/testing-package.md): drive a program in a
  terminal, run it to its exit, or start it and wait until it is ready.
- [Gating Codex edits](./guides/skill-gate-codex.md): register the skill gate as a Codex hook, and
  how the gate counts loads there.

## Runbooks

- [Setting up a downstream repo](./runbooks/downstream-repo-setup.md): wire a repo up, and opt in to
  the agent hooks and the pre-push baseline.

## Decisions

- [0001: A grant is a user row](./decisions/0001-a-grant-is-a-user-row.md): why `@zgeoff/mcp-auth`
  stores each grant as one better-auth `user` row, with cascading deletes.
- [0002: Bearer tokens only](./decisions/0002-bearer-tokens-only.md): why `@zgeoff/mcp-auth` drops
  DPoP and refuses DPoP-bound tokens.
- [0003: The core shares the app's Kysely](./decisions/0003-the-core-shares-the-apps-kysely.md): why
  `@zgeoff/mcp-auth` runs on the app's own Kysely when the app has one.
- [0004: The clock interface lives in std](./decisions/0004-the-clock-interface-lives-in-std.md):
  why production code takes its clock from `@zgeoff/std`, and why `sleep` resolves on abort.
- [0005: Fetch mocking uses msw 3](./decisions/0005-fetch-mocking-uses-msw-3.md): why every repo
  mocks `fetch` through one msw 3 network with the `fetch/web` interceptor.
- [0006: Skills live in .agents/skills](./decisions/0006-skills-live-in-agents-skills.md): why every
  repo keeps its skills in `.agents/skills/` and links `.claude/skills` to it.
