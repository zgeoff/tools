# @zgeoff/skill-gate

The skill gate is a Claude Code and Codex CLI hook that denies an edit until the session has loaded
every skill the path needs, and names the missing skills. It denies a call to a gated tool, such as
an MCP tool, the same way until the session has loaded the skills and read the reference files the
tool needs. After a Bash command, it compares `git status` with the status before the command, and
it blocks when the command changed a gated file that the session lacks the skills for. The package
holds no rules: each repo keeps its own in `.claude/skill-gate.json`, and a repo without that file
has no gate.

## Install

```sh
bun add -d @zgeoff/skill-gate
```

Install it at the repo root, so that Bun resolves it from `.claude/hooks/`. The package runs on Bun.

## Entry point

The hook runs a file in the repo that calls the package's `runSkillGate`, at
`.claude/hooks/skill-gate/skill-gate.ts`. The `hook-skill-gate` entry of repo-sync delivers this
file from zgeoff/tools. `runSkillGate` reads the hook payload from stdin, prints the hook output,
and exits the process.

Register the entry point in `.claude/settings.json`, before a Bash command and after it. The command
runs Bun with `--no-install`, so the hook never fetches the package from npm: in a checkout with no
`node_modules`, the hook blocks every call but a few read-only commands until `bun install` runs.
The `PreToolUse` matcher names each tool that a tool gate names, since the hook never sees a call
that the matcher skips. This example gates `mcp__tracker__update_ticket`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|Bash|mcp__tracker__update_ticket",
        "hooks": [
          {
            "type": "command",
            "command": "bun --no-install \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bun --no-install \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bun --no-install \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
          }
        ]
      }
    ]
  }
}
```

## Codex

The same entry point runs as a Codex hook when its command passes `--harness codex`, and it gates
`apply_patch` edits, gated tools and Bash commands as it does under Claude Code. Codex has no Skill
tool, so the gate keeps a ledger of what each session loaded.
[Gating Codex edits](../../docs/guides/skill-gate-codex.md) holds the `.codex/hooks.json` example,
the trust step and the ledger rules.

## Rules

`.claude/skill-gate.json` maps path globs to the skills each path needs, and the optional `tools`
list gates a tool call by name.

```json
{
  "ignore": ["node_modules/", "dist/"],
  "gates": [{ "match": "**/*.md", "skills": ["docs-writing"] }],
  "tools": [{ "tool": "mcp__tracker__update_ticket", "skills": ["ticket-review"] }]
}
```

[Writing skill-gate rules](../../docs/guides/skill-gate-rules.md) covers each key, the glob shapes
to avoid, and how the gate treats a mistake in the rules file.

## Documentation

[The skill gate architecture](../../docs/architecture/skill-gate.md) describes how the entry point
fails closed, which skill loads and reference reads the gate counts, and how it checks what a Bash
command changed.
