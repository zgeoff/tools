# @zgeoff/skill-gate

The skill gate is a Claude Code `PreToolUse` hook that denies an edit until the session has loaded
every skill the path needs, and names the missing skills. It also warns when a Bash command writes a
gated path through a redirect, `tee`, `sed -i`, `cp`, `mv` or an inline script. The warning names
the skills to load and the edit tools, and the command still runs. The package holds no rules: each
repo keeps its own in `.claude/skill-gate.json`, and a repo without that file has no gate.

## Install

```sh
bun add -d @zgeoff/skill-gate
```

Install it at the repo root, so that Bun resolves it from `.claude/hooks/`. The package runs on Bun.

## Entry point

The hook runs a file in the repo that calls the package. The `hook-skill-gate` repo-sync entry
delivers it to `.claude/hooks/skill-gate/skill-gate.ts`:

```ts
import { runSkillGate } from '@zgeoff/skill-gate';

await runSkillGate();
```

`runSkillGate` reads the hook payload from stdin, prints the hook output, and exits the process.
Register the entry point in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|Bash",
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
path from the repo root, and a path that holds an `ignore` segment is never gated. `Bun.Glob` misses
deep paths for a `**` inside a brace group, such as `{e2e/**,test/**}`, so write one gate per
pattern.

```json
{
  "ignore": ["node_modules/", "dist/"],
  "gates": [
    { "match": "**/*.test.ts", "skills": ["testing", "project-testing"] },
    { "match": "**/*.md", "skills": ["docs-writing"] }
  ]
}
```

A rule that names a skill missing from `.claude/skills/`, or a rules file that does not parse, never
denies an edit. The hook warns the user and the agent on every edit until the rule is fixed.

## Which loads count

The gate counts the loads of the session that makes the edit. A subagent's tool call carries
`agent_id` beside the main session's `transcript_path`, and the gate reads that subagent's own
transcript, `<session>/subagents/agent-<agent_id>.jsonl` beside the main one. A subagent therefore
loads the skills itself, and the main session's loads never count for it. A compaction writes a
`compact_boundary` entry, and the loads before it no longer count: after a compaction, the gate
denies a gated edit until the session loads the skills again, and its denial says so.

## Bash commands

The gate blocks only Edit, Write and MultiEdit. For Bash it reads the common forms of a shell write
and warns, because a hook cannot parse every shell form: a deny built on a partial parser would
block ordinary commands or let other writes through. A command the parser misses runs with no
warning. Change a gated path only with Edit, Write or MultiEdit; the denial and the warning both say
so.
