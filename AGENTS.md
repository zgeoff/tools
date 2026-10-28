# Agent Guidelines

This repo is tools, the shared tooling for every zgeoff repo. It publishes the `@zgeoff/*` packages
to npm, and it holds the files that repo-sync copies into each other repo.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill           | Source                       | Load before                                                                                 |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `code-style`    | `.claude/skills/code-style/` | writing, reviewing, or renaming any TypeScript — the function-naming role table lives there |
| `testing`       | `sync/skills/testing/`       | designing, writing, or reviewing tests                                                      |
| `docs-writing`  | `sync/skills/docs-writing/`  | writing or editing any committed prose: READMEs, this file, skills                          |
| `skill-writing` | `sync/skills/skill-writing/` | writing or editing a skill                                                                  |
| `ci-design`     | `sync/skills/ci-design/`     | adding, changing, or reviewing a workflow, a job, or a trigger                              |

Only `code-style` and `docs-writing` are installed as skills here. For the others, read the
`SKILL.md` in the source folder.

## Repo structure

tools is one Bun workspace.

```text
packages/           the @zgeoff/* packages; release-please versions each one and publishes the
                    public ones to npm, as RELEASING.md describes
sync/               the sources that repo-sync delivers, listed in sync/manifest.json; an edit here
                    reaches every repo that takes the entry, as sync/README.md describes
  skills/           the shared skill bases, each delivered to .claude/skills/<name>/
  pre-push/         the lefthook pre-push baseline and its pre-commit typecheck, which this repo's
                    lefthook.yml extends too
  workflow-callers/ opt-in workflow stubs that call this repo's reusable workflows
  hooks/            the skill-gate hook
scripts/            the shell scripts that repo-sync and CI run, plus the manual ones that pin a
                    repo to a sync tag and do a package's first npm publish; tests sit beside them
.github/workflows/  this repo's CI and release, and the reusable workflows that other repos call:
                    bun-checks, repo-sync, audit-fix, release-please and the paths-changed gate
.claude/skills/     the code-style skill, which is both this repo's skill and the shared base
```

A manifest entry can name a source outside `sync/`. `.github/PULL_REQUEST_TEMPLATE.md`,
`.github/ISSUE_TEMPLATE/`, `.editorconfig` and `.claude/skills/code-style/SKILL.md` ship to other
repos too, so an edit to one of them changes every repo that takes it.

## Packages

- Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
  for an external dependency and `"workspace:*"` for an internal one.
- Pin exact versions, with no `^` or `~` ranges. `bun add` saves exact versions, so the rule covers
  hand-written edits.

## Commands

- Run `bun run test` from the repo root, which hands `bun test` this host's worker count. The
  jest-extended preload lives in the root `bunfig.toml`, so a run from a package folder lacks the
  extra matchers.
- `bun run format` fixes formatting. lefthook runs the light checks before a commit and a push, and
  CI runs the rest.
- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass and tsgolint's type
  check, and is CI-only: never run it locally.
- `bun run typecheck` runs `tsc` per package and over `scripts/` and `sync/`. CI runs it beside
  `lint:full`, and when the two type checks disagree, `tsc` is right.
- `bun run check:sync` checks `sync/manifest.json` against the rules repo-sync assumes. Run it after
  you change the manifest or a file an entry lists. CI runs it, and the pre-push hook does not.
- `bun run check:release-workflow` checks the tag step of the shared release job in
  `.github/workflows/release-please.yml`. CI and the pre-push hook run it.
