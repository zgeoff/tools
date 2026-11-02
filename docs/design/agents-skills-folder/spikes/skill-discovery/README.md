# Spike: one skills folder for Claude Code and Codex

This spike decides where every zgeoff repo keeps its agent skills. Its script, `probe.sh`, builds
six small repos that each lay out the `.agents/skills` and `.claude/skills` folders another way,
with one test skill, and asks Claude Code and Codex which skill each one lists. The spike also reads
how three parts of zgeoff/tools handle those layouts.

## Question

Where should a repo keep its skills so that Claude Code, Codex and other agents all read one copy?
That covers the standard folder name, which folder holds the files and which one is a symlink, what
zgeoff/tools and each repo must change, and whether a symlink breaks a Windows checkout or a CI job.

## Answer

- Codex reads `.agents/skills`, and the docs of Cursor, Gemini CLI, GitHub Copilot and OpenCode say
  they read it too. Claude Code 2.1.294 reads only `.claude/skills`.
- Both agents follow a symlink from one folder to the other, whether it links the whole folder or
  each skill: each agent listed the test skill in all 4 such layouts.
- Two parts of zgeoff/tools break when `.claude/skills` links to `.agents/skills`. repo-sync, which
  copies shared skills into each repo, sees git record the copies at `.agents/skills` paths, so its
  pull requests wait for review instead of merging on their own. `chex links` fails on the example
  links of the shared docs-writing skill.
- The skill gate, an agent hook that denies an edit until the agent loads a skill, already finds
  skills through the symlink.
- Every zgeoff workflow runs on Linux. On Windows, git checks a symlink out as a text file unless
  symlinks are on, and Claude Code would then find no skills.

The spike recommends files in `.agents/skills/`, with `.claude/skills` a symlink to
`../.agents/skills`, after a zgeoff/tools change that fixes repo-sync and `chex links`.

## Run it

```bash
docs/design/agents-skills-folder/spikes/skill-discovery/probe.sh .scratch/probe-run
```

Run it from the repo root, with `claude` and `codex` signed in. The argument names a new folder for
the probe repos. It prints one line per layout with the skills each agent listed, as
[Setup](./results.md#setup) shows.

## Results

[results.md](./results.md) answers each part of the question with its sources, compares the layouts,
and lists the follow-up work.

## Untested

The spike ran on no native Windows checkout, and it never ran the `skills` installer that
zgeoff/skills uses. [Untested](./results.md#untested) lists each gap.
