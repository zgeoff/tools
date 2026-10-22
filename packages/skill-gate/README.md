# @zgeoff/skill-gate

The skill gate is a Claude Code hook that denies an edit until the session has loaded every skill
the path needs, and names the missing skills. After a Bash command, it compares `git status` with
the status before the command, and it blocks when the command changed a gated file that the session
lacks the skills for. The package holds no rules: each repo keeps its own in
`.claude/skill-gate.json`, and a repo without that file has no gate.

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

The entry point fails closed. When the package cannot load, the entry point blocks each edit that a
gate in the rules file matches, and its error names the load failure. It also blocks every edit
inside the project when it cannot read the rules file or the file does not parse. Any other call
runs, and the hook reports the load failure as a non-blocking error.

Register the entry point in `.claude/settings.json`, before a Bash command and after it:

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
rule's other skills. A rules file that does not parse denies no edit. In both cases the hook warns
the user and the agent on every edit until the rules file is fixed.

## Which loads count

The gate counts the loads of the session that makes the edit. A subagent's tool call carries
`agent_id` beside the main session's `transcript_path`, and the gate reads that subagent's own
transcript, `<session>/subagents/agent-<agent_id>.jsonl` beside the main one. A subagent therefore
loads the skills itself, and the main session's loads never count for it. A compaction writes a
`compact_boundary` entry, and the loads before it no longer count: after a compaction, the gate
denies a gated edit until the session loads the skills again, and its denial says so.

## Bash commands

The gate checks what a Bash command changed, not what the command says. Before the command, it
records `HEAD` and the content of each gated file that `git status` lists as changed, staged or
untracked. After the command, it reads `git status` again, plus the files that differ between the
old and the new `HEAD`. A gated file that the command created, changed, deleted, renamed or
committed counts as a change, and a file that was dirty before and kept its content does not. A
command that moves `HEAD` another way, such as a pull or a checkout, counts each gated file it
brought in. When the session that ran the command lacks a skill that a changed file needs, the hook
blocks: the agent gets a reason that names the skills to load and asks it to review what the command
changed. The same load check as an edit applies, with its compaction and subagent rules.

Claude Code runs a `PostToolUse` hook after the command, so a block cannot undo the change. It stops
the agent's next step and puts the reason beside the command's output, as the
[hooks reference](https://code.claude.com/docs/en/hooks#posttooluse-decision-control) describes. A
command that exits with an error fires `PostToolUseFailure`, which cannot block, so the hook adds
the same reason as context.

Before the command runs, the gate also reads the common forms of a shell write, such as a redirect,
`tee`, `sed -i`, `cp`, `mv` or an inline script. When one targets a gated path, it warns and names
the skills to load. The warning is an early notice only, and the check after the command is the one
that blocks.

The check has limits:

- It needs a git work tree. Outside one, the gate gives only the early warning. When git fails
  inside one, such as on an index it cannot read, the hook warns the user and the agent that the
  command went unchecked.
- A command that runs in the background returns before it writes, so the check sees no change.
- Bash commands that run in parallel share one work tree, so each one's check also sees the other's
  changes.
- A command whose `PreToolUse` call left no record, such as one that started before the hook was
  installed, goes unchecked.

Change a gated path only with Edit, Write or MultiEdit; the denial, the warning and the block all
say so.
