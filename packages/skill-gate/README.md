<div align="center">
  <h1>@zgeoff/skill-gate</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/skill-gate"><img src="https://img.shields.io/npm/v/@zgeoff/skill-gate" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../agent-hooks/README.md">@zgeoff/agent-hooks</a>
  </p>
</div>

A package that forwards to `@zgeoff/agent-hooks`, which holds the skill gate.

`runSkillGate` runs the hooks of [`@zgeoff/agent-hooks`](../agent-hooks/README.md), whose first
handler is the skill gate, so an entry point that calls it keeps working. A gate denial exits 2 with
the reason on stderr, which Claude Code and Codex both take as a block.

## Install

Install `@zgeoff/agent-hooks` instead, and run its start-up stub, as its README describes. First
take the `hook-start` entry of repo-sync and merge its pull request, so that the repo holds the stub
at `.claude/hooks/start.ts`. `agent-hooks init` refuses to run without the stub, and it replaces the
skill gate's older hook entries. Then run these commands at the repo root:

```sh
bun remove @zgeoff/skill-gate
bun add -d @zgeoff/agent-hooks
bunx agent-hooks init
```

## Documentation

[The skill gate architecture](../../docs/architecture/skill-gate.md) describes what the gate denies.
