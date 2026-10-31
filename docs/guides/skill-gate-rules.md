# Writing skill-gate rules

The rules file, `.claude/skill-gate.json`, tells the [skill gate](../architecture/skill-gate.md)
which skills an edit needs and which skills and references a tool call needs. Path gates cover edits
and Bash commands, and tool gates cover any other tool. A repo without the file has no gate.

## Path gates

Each entry of `gates` maps a path glob to the skills that a path needs. `match` is a glob over the
path from the repo root, and it matches files in dot folders such as `.claude/`. A path that holds
an `ignore` segment is never gated.

```json
{
  "ignore": ["node_modules/", "dist/"],
  "gates": [
    { "match": "**/*.test.ts", "skills": ["testing", "project-testing"] },
    { "match": "**/*.md", "skills": ["docs-writing"] }
  ]
}
```

Write one gate per pattern, and never put a `**` inside a brace group, such as `{e2e/**,test/**}`.
When the package cannot load, the entry point matches with `Bun.Glob`, which misses deep paths for
that shape.

## Tool gates

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

Run `bunx agent-hooks init` after you add or remove a tool gate, so that the `PreToolUse` matcher in
`.claude/settings.json` and `.codex/hooks.json` names each gated tool. The hook never sees a call
that the matcher skips. The denial names each missing skill and each reference to read.

## Mistakes the gate tolerates

The gate warns rather than blocks on a rule it cannot apply, so a rules file with a mistake never
blocks every call:

- A skill or a reference that the repo lacks is skipped, and the gate still requires the rule's
  other skills and references.
- A key the gate does not know, at the top level or inside a gate, is skipped, and the gate keeps
  the rest of the rules. The key itself denies nothing, so a rules file written for a later version
  of the package never blocks every call.
- A rules file that does not parse denies no edit and no tool call. When the package cannot load,
  the start-up stub fails closed instead, as
  [Failing closed](../architecture/agent-hooks.md#failing-closed) describes.

In each case, the hook warns the user and the agent on every edit, and on every call to a tool that
the hook matcher names, until you fix the rules file.

The gate does not tolerate a rules path it cannot read as a file, such as a folder or a file the
hook cannot read: it denies every gated call until the file reads again, as
[Failing closed](../architecture/skill-gate.md#failing-closed) describes. A repo with nothing at the
path has no gate.
