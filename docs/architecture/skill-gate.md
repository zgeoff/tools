# Skill gate

The skill gate is a handler of the [agent hooks](./agent-hooks.md), which
[`@zgeoff/agent-hooks`](../../packages/agent-hooks/README.md) ships. It denies an edit, or a call to
a gated tool, until the session has loaded the skills and read the references that the repo's
[rules](../guides/skill-gate-rules.md) name for it. The gate counts only the loads of the session
that makes the call, and only those since the last compaction. It judges a Bash command by what the
command changed in the git work tree, and it blocks after the command when a changed gated file
needs a skill the session lacks.

## Failing closed

The gate runs only once the package loads. Until then the start-up stub refuses every edit, gated
tool call and Bash command but a read-only one, as [Failing closed](./agent-hooks.md#failing-closed)
in the agent hooks doc describes. Once the gate runs, a rules file that does not parse makes it warn
rather than deny, as
[Mistakes the gate tolerates](../guides/skill-gate-rules.md#mistakes-the-gate-tolerates) describes.

## Which loads count

The gate counts the loads of the session that makes the edit or the tool call. A skill loads through
a Skill tool call or a slash command. A reference counts once a Read tool call of its file succeeds;
a Bash `cat` of the file does not count. A subagent's tool call carries `agent_id` beside the main
session's `transcript_path`, and the gate reads that subagent's own transcript beside the main one:
`<session>/subagents/agent-<agent_id>.jsonl`, or
`<session>/subagents/workflows/<workflow_id>/agent-<agent_id>.jsonl` for a subagent that a workflow
started. A subagent therefore loads the skills itself, and the main session's loads never count for
it. A compaction writes a `compact_boundary` entry, and the loads and reads before it no longer
count: after a compaction, the gate denies a gated edit or tool call until the session loads the
skills and reads the references again, and its denial says so.

## Codex

Under `--harness codex` the gate reads the Codex payload and counts loads from its own ledger,
because Codex has no Skill tool or Read tool and its transcript format is unstable for hooks. The
[Codex guide](../guides/skill-gate-codex.md#how-codex-loads-count) lists the events that write the
ledger. An edit arrives as an `apply_patch` call, and the gate gates each path its headers name, so
a patch is denied when any one path lacks skills. Everything else, such as the rules, the Bash check
and the tool gates, works as under Claude Code.

## Bash commands

The gate checks what a Bash command changed, not what the command says. Before the command, it
records `HEAD` and the content of each gated file that `git status` lists as changed, staged or
untracked. After the command, it reads `git status` again, plus the files that differ between the
old and the new `HEAD`. A gated file that the command created, changed, deleted, renamed or
committed counts as a change. A file that keeps its content does not: one dirty before and left
alone, or one whose mode alone changed, compared with its content at the old `HEAD`. A command that
moves `HEAD` another way, such as a pull or a checkout, counts each gated file it brought in.

When the session that ran the command lacks a skill that a changed file needs, the hook blocks: the
agent gets a reason that names the skills to load and asks it to review what the command changed.
The same load check as an edit applies, with its compaction and subagent rules.

Claude Code runs a `PostToolUse` hook after the command, so a block cannot undo the change. The hook
exits 2, and Claude Code shows the reason to the agent beside the command's output, as the
[hooks reference](https://code.claude.com/docs/en/hooks#exit-code-2-behavior-per-event) describes. A
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
- A file that a git filter rewrites on checkout, such as a Git LFS file, never matches its content
  at `HEAD`, so a mode change to one counts as a change.
- Bash commands that run in parallel share one work tree, so each one's check also sees the other's
  changes.
- A command whose `PreToolUse` call left no record, such as one that started before the hook was
  installed, goes unchecked.

Change a gated path only with Edit, Write or MultiEdit, or `apply_patch` under Codex; the denial,
the warning and the block all say so.
