# Agent Guidelines

## Operations

- Perform all work on a branch in a git worktree under `.worktrees/` (e.g.
  `git worktree add .worktrees/<branch> -b <branch>`) — never commit directly on `main`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages.
- When the work is ready, open a PR against `main` using the PR template
  (`.github/PULL_REQUEST_TEMPLATE.md`).
- PR descriptions are condensed by default: lead paragraph ≤2 sentences, one-line bullets, ≤150
  words. Write the short version first — do not draft long and trim.
- After pushing, link the opened PR's URL in your response so it's one click away.

## Type checking

Type errors are checked by two engines on purpose: `lint:type-aware` includes tsgolint's
experimental `--type-check` (fast, run it locally), while `typecheck` runs real `tsc` per package
(ground truth). CI runs both until tsgolint earns trust; if they ever disagree, believe `tsc`.

## Dependencies

- Pin exact versions — no `^`/`~` ranges. Shared versions live in the root catalog; workspace
  packages reference them via `catalog:`. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)
