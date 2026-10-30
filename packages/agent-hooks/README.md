<div align="center">
  <h1>@zgeoff/agent-hooks</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/agent-hooks"><img src="https://img.shields.io/npm/v/@zgeoff/agent-hooks" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/guides/skill-gate-rules.md">Writing skill-gate rules</a>
  </p>
</div>

The Claude Code and Codex CLI hooks of a zgeoff repo, run from one entry point.

Each hook entry runs a start-up stub in the repo, and the stub hands the hook payload to this
package. The package runs its handlers in order, and the first handler that blocks decides: the hook
exits 2 with that handler's message. When the package is missing, the stub runs `bun install`
itself, so a fresh worktree needs no install before an agent can work. When the package still cannot
load, the stub refuses each tool call but a read-only command.

## Install

Take the `hook-start` entry of repo-sync first, which delivers the start-up stub to
`.claude/hooks/start.ts`. Then run these commands at the repo root:

```sh
bun add -d @zgeoff/agent-hooks
bunx agent-hooks init
```

Install the package at the repo root, so that Bun resolves it from `.claude/hooks/`. The package
runs on Bun. `agent-hooks init` refuses to run until the stub exists. It writes one stub entry for
each event into `.claude/settings.json` and `.codex/hooks.json`, with a `PreToolUse` matcher that
names each tool a tool gate names. Run it again after you change the tool gates. It keeps every
other hook, and it replaces an entry for the stub or for the skill gate's older entry point.

Codex runs a repo's hooks only after you trust each hook definition: open `/hooks` in the Codex CLI
and trust the entries.

## Features

- The [skill gate](../../docs/architecture/skill-gate.md) denies an edit, or a call to a gated tool,
  until the session loads the skills and reads the references that the repo's rules name. It blocks
  after a Bash command that changed a gated file without them.
- [The start-up stub](../../docs/architecture/agent-hooks.md) installs the package when it is
  missing, runs one install for parallel hook calls, and fails closed.
- [Codex](../../docs/guides/skill-gate-codex.md): the same stub runs as a Codex hook with
  `--harness codex`.

## Configuration

`.claude/skill-gate.json` holds the skill gate's rules, and a repo without the file has no gate.
[Writing skill-gate rules](../../docs/guides/skill-gate-rules.md) covers each key.

## Documentation

[The docs index](../../docs/README.md) lists the architecture docs and guides.
