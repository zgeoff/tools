# Writing skill-gate rules

The [skill gate](../architecture/skill-gate.md) is a Claude Code and Codex hook from
[`@zgeoff/agent-hooks`](../../packages/agent-hooks/README.md). It refuses an agent's tool call until
the agent's session has loaded the skills that the call needs. The hook reads its rules from
`.claude/skill-gate.json`, which holds two lists:

- `gates`, the path gates: each one lists the skills that an edit of a matching path needs.
- `tools`, the tool gates: each one lists the skills and the reference files that a call to one tool
  needs. A reference file is a file inside a skill's folder, such as a skill's `references/` file.

A repo without `.claude/skill-gate.json` has no gate. Repo-sync writes the file in most repos, so
read [The shared rules](#the-shared-rules) before you change it.

## The shared rules

Repo-sync copies [`sync/skill-gate/skill-gate.json`](../../sync/skill-gate/skill-gate.json) to
`.claude/skill-gate.json`, through the `skill-gate-rules` entry of its
[manifest](../architecture/repo-sync.md#manifest-entries). Each sync overwrites the copy, so change
the shared gates in the source file in this repo.

The entry's `except` list holds each repo that kept rules of its own before the entry existed.
Repo-sync leaves that repo's file alone, so add the two shared gates to the file by hand, and copy
each later change to them too.

The shared file holds two path gates. They refuse an edit of a skill's `SKILL.md`, or of a file
under the skill's `references/`, until the session loads `skill-writing`, `docs-writing` and
`deslop`. They match a skill in any `skills/` folder, such as `.claude/skills/`, `.agents/skills/`
or `sync/skills/`.

Every repo takes `deslop` from the `skill-deslop` entry, and `skill-writing` and `docs-writing` from
the opt-in entries that `skill-deslop` needs. A repo that skips one of them lacks that skill, and
the gate skips it, as [Mistakes the gate tolerates](#mistakes-the-gate-tolerates) describes.

To give a repo gates of its own:

1. In the repo's `.github/workflows/repo-sync.yml`, add `skill-gate-rules` to the `skip` input, a
   comma-separated list of entry names.
2. Add the repo's gates to its `.claude/skill-gate.json`, after the shared gates that the last sync
   wrote there.

Expect the next sync pull request to leave `.claude/skill-gate.json` alone. From then on, a change
to the shared gates no longer reaches the repo, and you copy it by hand.

## Path gates

Each path gate pairs a `match` glob with the `skills` that a matching path needs. The hook matches
the glob against the path from the project folder: the folder in `CLAUDE_PROJECT_DIR` under Claude
Code, or the git top level under Codex. A glob matches files in dot folders such as `.claude/`. When
several path gates match one path, the edit needs the skills of all of them. The hook skips a path
that contains any string in the top-level `ignore` list, such as `node_modules/`.

```json
{
  "ignore": ["node_modules/", "dist/"],
  "gates": [
    { "match": "**/*.test.ts", "skills": ["testing", "project-testing"] },
    { "match": "**/*.md", "skills": ["docs-writing"] }
  ]
}
```

Start each glob with `**/`. An agent often edits in a worktree under the project folder, such as
`.worktrees/<branch>/`, so the path it edits starts with the worktree's folder. A glob such as
`src/**` misses that path, and `**/src/**` matches it.

The hook checks a path gate before an edit through Edit, Write or MultiEdit. After a Bash command,
it checks each file that the command changed, as
[Bash commands](../architecture/skill-gate.md#bash-commands) describes.

## Tool gates

Each tool gate in the optional `tools` list holds:

- `tool`: the tool's name, as Claude Code passes it to a
  [`PreToolUse` hook](https://code.claude.com/docs/en/hooks), such as `mcp__tracker__update_ticket`;
- `skills`: the skills that the session loads before the call;
- `references`: the files that the session reads before the call, each a path relative to
  `.claude/skills/`. A read of the file under `.agents/skills/` counts too.

A tool gate needs at least one skill or reference. Never name `Edit`, `Write`, `MultiEdit` or `Bash`
in a tool gate, because the path gates check those tools. The hook reads a rules file that breaks
either rule as a file that does not parse, as
[Mistakes the gate tolerates](#mistakes-the-gate-tolerates) describes.

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

After you add or remove a tool gate, run `bunx agent-hooks init`. It writes the `PreToolUse` matcher
in `.claude/settings.json` and `.codex/hooks.json`, which lists each gated tool. The hook never sees
a call to a tool that the matcher leaves out.

When the hook refuses a call, its message lists each missing skill and each reference to read.

## Mistakes the gate tolerates

The hook skips a part of the rules that it cannot apply, and it keeps the rest:

- It skips a skill or a reference that the repo lacks, and it still requires the other skills and
  references of the same gate.
- It skips a key it does not know, at the top level or inside a gate. A rules file written for a
  later version of the package then still works.
- It refuses no call when the rules file does not parse.

In each case, the hook shows a warning in the session on every edit, and on every call to a tool
that the `PreToolUse` matcher lists, until you fix the rules file.

## An unreadable rules file

When the hook cannot read `.claude/skill-gate.json` as a file, such as when the path is a folder, it
refuses every edit, every Bash command and every call to a gated tool. Without the rules, it cannot
tell which calls to let through. It refuses them until you fix the path, as
[the skill gate's Failing closed](../architecture/skill-gate.md#failing-closed) describes.

The start-up stub, `.claude/hooks/start.ts`, runs the hook from the package. When the package cannot
load, the stub refuses every tool call but two kinds of Bash command, each written as plain words:
the install that repairs it, `bun install` or `bun install --frozen-lockfile`, and a read-only `ls`,
`cat` or `pwd`, as [the agent hooks' Failing closed](../architecture/agent-hooks.md#failing-closed)
describes.
