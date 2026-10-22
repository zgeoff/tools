# @zgeoff/skill-gate

The skill gate is a Claude Code hook that denies an edit until the session has loaded every skill
the path needs, and names the missing skills. It denies a call to a gated tool, such as an MCP tool,
the same way until the session has loaded the skills and read the reference files the tool needs.
After a Bash command, it compares `git status` with the status before the command, and it blocks
when the command changed a gated file that the session lacks the skills for. The package holds no
rules: each repo keeps its own in `.claude/skill-gate.json`, and a repo without that file has no
gate.

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
`PreToolUse` matcher names each tool that a [tool gate](#tool-gates) names, since the hook never
sees a call that the matcher skips. This example gates `mcp__tracker__update_ticket`:

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

## Rules

`.claude/skill-gate.json` maps path globs to the skills each path needs. `match` is a glob over the
path from the repo root, and it matches files in dot folders such as `.claude/`. A path that holds
an `ignore` segment is never gated. The entry point matches with `Bun.Glob` when the package cannot
load, and `Bun.Glob` misses deep paths for a `**` inside a brace group, such as `{e2e/**,test/**}`,
so write one gate per pattern.

```json
{
  "ignore": ["node_modules/", "dist/"],
  "gates": [
    { "match": "**/*.test.ts", "skills": ["testing", "project-testing"] },
    { "match": "**/*.md", "skills": ["docs-writing"] }
  ]
}
```

The gate skips a skill that a rule names but `.claude/skills/` lacks, and it still requires the
rule's other skills. A rules file that does not parse denies no edit and no tool call. In both cases
the hook warns the user and the agent on every edit, and on every call to a tool that the hook
matcher names, until the rules file is fixed.

The gate skips a key it does not know, at the top level or inside a gate, and keeps the rest of the
rules. It warns on every edit and every gated tool call, and the key itself denies nothing. A rules
file written for a later version of the package therefore never blocks every call.

### Tool gates

The optional `tools` list gates a tool call by its `PreToolUse` tool name. Each gate names the
`tool`, the `skills` the session loads, and the `references` it reads, and it needs at least one
skill or reference. A reference is a file path under `.claude/skills/`. A tool gate never names
`Edit`, `Write`, `MultiEdit` or `Bash`, since path gates cover those tools.

```json
{
  "gates": [],
  "tools": [
    {
      "tool": "mcp__tracker__update_ticket",
      "skills": ["ticket-review"],
      "references": ["ticket-review/references/reasons.md"]
    }
  ]
}
```

The denial names each missing skill and each reference to read. The gate skips a skill or a
reference that the repo lacks, and warns on each gated call until the rule is fixed.

## Documentation

[The skill gate architecture](../../docs/architecture/skill-gate.md) describes how the entry point
fails closed, which skill loads and reference reads the gate counts, and how it checks what a Bash
command changed.
