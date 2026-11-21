# 0006: Skills live in .agents/skills

- Date: 2026-11-21
- Status: decided

## Decision

Every zgeoff repo keeps its agent skills as files in `.agents/skills/`, and `.claude/skills` is a
symlink to `../.agents/skills`.

repo-sync, the tools workflow that copies each shared skill from zgeoff/skills into every repo,
names each copy's destination path in its manifest. Those paths sit under `.claude/skills/`. In a
repo with the symlink, repo-sync's write goes through the link, so the file lands in
`.agents/skills/` and git records it there. In a repo that keeps a real `.claude/skills` folder, the
file lands in that folder, where Claude Code reads it. A path under `.agents/skills/` would put the
file where Claude Code never reads in such a repo.

## Why

- Codex reads skills from `.agents/skills`, and so do Cursor, Gemini CLI, GitHub Copilot and
  OpenCode, by their docs. Claude Code reads only `.claude/skills`. More agents read
  `.agents/skills`, so that folder holds the files, and only Claude Code depends on the link.
- Claude Code follows the `.claude/skills` symlink to the files, so Claude Code and Codex read the
  same copy.

## Rejected alternatives

- **Files in `.claude/skills/`, with `.agents/skills` a symlink to it.** Every agent except Claude
  Code would then depend on the link, including each new agent that reads `.agents/skills`.
- **A copy of each skill in both folders.** Every edit needs two writes, and the copies drift apart.

## Consequences

- On Windows, turn symlinks on before you clone, with `git config --global core.symlinks true`. Git
  for Windows turns them off by default, and git then checks `.claude/skills` out as a small text
  file, so Claude Code finds no skills. To fix a clone made without the setting, set it, then run
  `git checkout -- .claude/skills`.
- zgeoff's CI runs only on Linux runners, so no CI job meets the Windows problem.
