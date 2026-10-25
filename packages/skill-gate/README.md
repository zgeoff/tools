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

Register the entry point in `.claude/settings.json`, before a Bash command and after it. The
`PreToolUse` matcher names each tool that a tool gate names, since the hook never sees a call that
the matcher skips. This example gates `mcp__tracker__update_ticket`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|Bash|mcp__tracker__update_ticket",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
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
            "command": "bun \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
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
            "command": "bun \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-gate/skill-gate.ts\""
          }
        ]
      }
    ]
  }
}
```

## Codex

The same entry point runs as a Codex hook. Codex follows Claude Code's hook contract, so the gate
denies an edit, denies a gated tool call, and blocks after a Bash command exactly as it does under
Claude Code. The hook command passes `--harness codex`, which makes `runSkillGate` read the Codex
payload; with no argument the harness is Claude Code. The rules stay in `.claude/skill-gate.json`.

Register the entry point in `.codex/hooks.json`. The command resolves the repo root with `git`,
because Codex sets no `CLAUDE_PROJECT_DIR`. The `PreToolUse` matcher names `apply_patch`, which is
how Codex edits files, and each gated tool. This example gates `mcp__tracker__update_ticket`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch|mcp__tracker__update_ticket",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"$(git rev-parse --show-toplevel)/.claude/hooks/skill-gate/skill-gate.ts\" --harness codex"
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
            "command": "bun \"$(git rev-parse --show-toplevel)/.claude/hooks/skill-gate/skill-gate.ts\" --harness codex"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun \"$(git rev-parse --show-toplevel)/.claude/hooks/skill-gate/skill-gate.ts\" --harness codex"
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bun \"$(git rev-parse --show-toplevel)/.claude/hooks/skill-gate/skill-gate.ts\" --harness codex"
          }
        ]
      }
    ]
  }
}
```

Codex runs a repo's hooks only in a trusted project, and only after you trust each hook definition.
Open `/hooks` in the Codex CLI and trust the four entries. A changed definition needs a new review.

Codex finds a repo's skills in `.agents/skills`, while the rules and the gate's own skill checks use
`.claude/skills`. A repo that serves both harnesses makes `.agents/skills` a symlink to
`.claude/skills`, or the reverse.

### How Codex loads count

Codex has no Skill tool, no Read tool, and no transcript format that hooks may rely on, so the gate
keeps its own ledger of what each session loaded. Three events write it:

- A Bash command that reads `.agents/skills/<name>/SKILL.md` or `.claude/skills/<name>/SKILL.md`
  loads that skill, and one that reads a file a tool gate names as a reference records the reference
  as read. Only `cat`, `head`, `tail`, `sed -n`, `nl`, `less` and `bat` count as reads, and the file
  has to exist. The path resolves against the payload's `cwd`.
- A prompt that names a skill present under either folder as `$<name>` loads it. Codex puts that
  skill's text into the context with no tool call, so the prompt hook is the only place the gate
  sees it.
- `PostCompact` clears the ledger's skills and reads, as a `compact_boundary` entry does in a Claude
  Code transcript. A skill loaded by `$<name>` before a compaction counts only after it loads again;
  the gate clears it because it cannot confirm that Codex keeps the text.

The ledger is a JSON file named for the session id, in the gate's `skill-gate` folder beside the
session's rollout file, where the Bash snapshots also live. A session with no rollout file keeps it
under the system temp folder. A subagent reports its parent's session id, so a subagent shares the
parent's ledger.

### Edits and Bash

`apply_patch` carries a patch whose `*** Add File:`, `*** Update File:`, `*** Delete File:` and
`*** Move to:` lines name each path. The gate resolves every path against `cwd` and gates each one
as it gates an `Edit`. It denies the patch when any path is gated and lacks skills, and its denial
names the missing skills per path.

Bash change detection uses the same snapshots as under Claude Code. Codex fires no failure event, so
a command that never reaches `PostToolUse` leaves a snapshot behind. Each snapshot is keyed by its
own `tool_use_id`, so the leftover never affects the next command.

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
