# Agent Guidelines

## Operations

- Perform all work on a branch in a git worktree under `.worktrees/` (e.g. `git worktree add .worktrees/<branch> -b <branch>`) — never commit directly on `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
- When the work is ready, open a PR against `main` using the PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
- After pushing, link the opened PR's URL in your response so it's one click away.
