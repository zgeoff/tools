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

## Code style

- One primary export per file, and the file name kebab-cases that export (`with-jest-context.ts`
  exports `withJestContext`). Exceptions: `index.ts` entrypoints, `types.ts` for a package's shared
  types, and side-effect-only modules, which are named for what they do (`augment-bun-test.ts`).
- Function names start with a verb (`expandInputs`, `planGapEdit`, `parseSource`). Pure transforms
  and value-producers are `build<Result>From<Source>` (`buildEditsFromAst`,
  `buildBenchStatsFromReports`); drop the `From<Source>` suffix only when there's no meaningful
  single source (`buildUnifiedDiff`). Avoid the bare `to<Result>` prefix.
- Module order: imports, then the primary export, then private helpers in composition order
  (depth-first). Don't lead with helpers. Types for the primary export's signature may sit just
  above it.

## Testing

- Never use `describe` — write flat `test('it does a thing', …)` blocks.
- Tests declare their own data inline — no fixtures shared between tests, even if that means
  duplication.
- Reach for jest-extended matchers instead of hand-rolling assertions. Frequently useful:
  - arrays
    - `toIncludeAllMembers`
    - `toIncludeSameMembers`
    - `toPartiallyContain`
    - `toIncludeAllPartialMembers`
    - `toSatisfyAll`
  - objects
    - `toContainEntry`
    - `toContainEntries`
    - `toContainAllKeys`
    - `toBeFrozen`
  - strings
    - `toStartWith`
    - `toEndWith`
    - `toInclude`
    - `toEqualCaseInsensitive`
    - `toEqualIgnoringWhitespace`
  - values
    - `toBeNil`
    - `toBeOneOf`
    - `toSatisfy`
    - `toBeWithin`
    - `toBeEmpty`
  - dates
    - `toBeAfter`
    - `toBeBefore`
    - `toBeBetween`
    - `toBeValidDate`
  - mocks
    - `toHaveBeenCalledOnce`
    - `toHaveBeenCalledExactlyOnceWith`
    - `toHaveBeenCalledBefore`
    - `toHaveBeenCalledAfter`
  - errors/async
    - `toThrowWithMessage`
    - `toResolve` (returns a promise — always `await`)
    - `toReject` (returns a promise — always `await`)
- Matchers also work asymmetrically inside `toEqual`/`toMatchObject`
  (`status: expect.toBeOneOf([…])`).
- Known gaps: `expect.pass`/`expect.fail` are unimplemented upstream and excluded from our types.
  It's `toEqualCaseInsensitive` — not `…Insensitively` as some docs claim; unknown matcher names
  fail typecheck here (upstream's own types are looser and would let typos through).

## Dependencies

- Pin exact versions — no `^`/`~` ranges. Shared versions live in the root catalog; workspace
  packages reference them via `catalog:`. (`bun add` saves exact automatically via `exact = true` in
  bunfig.toml — the rule applies to hand-written edits.)
