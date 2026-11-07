# Agent Guidelines

This repo is tools, the shared tooling for every zgeoff repo. It publishes the `@zgeoff/*` packages
to npm, and it holds the files that repo-sync copies into each other repo.

## Required reading

The rules a task needs are not repeated here. Load the skill for the work before starting it.

| Skill           | Source                                                                             | Load before                                                                                 |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `code-style`    | [`code-style`](https://github.com/zgeoff/skills/tree/main/skills/code-style)       | writing, reviewing, or renaming any TypeScript — the function-naming role table lives there |
| `testing`       | [`testing`](https://github.com/zgeoff/skills/tree/main/skills/testing)             | designing, writing, or reviewing tests                                                      |
| `docs-writing`  | [`docs-writing`](https://github.com/zgeoff/skills/tree/main/skills/docs-writing)   | writing or editing any committed prose: READMEs, this file, skills                          |
| `skill-writing` | [`skill-writing`](https://github.com/zgeoff/skills/tree/main/skills/skill-writing) | writing or editing a skill                                                                  |
| `ci-design`     | [`ci-design`](https://github.com/zgeoff/skills/tree/main/skills/ci-design)         | adding, changing, or reviewing a workflow, a job, or a trigger                              |
| `cold-read`     | [`cold-read`](https://github.com/zgeoff/skills/tree/main/skills/cold-read)         | checking a skill you wrote or changed, before its PR                                        |
| `deslop`        | [`deslop`](https://github.com/zgeoff/skills/tree/main/skills/deslop)               | editing the prose of a skill you wrote or changed, before its PR                            |

Each source is a folder of zgeoff/skills, at the commit that `sync/skills-pin.json` pins.
`bun run skills:install`, which `bun install` runs, unpacks that commit into
`.zgeoff-skills/<commit>/` and links the skills that `defaultPinnedSkills` in
[`write-pinned-skills.ts`](scripts/skills/write-pinned-skills.ts) lists into `.agents/skills/`.
`.claude/skills` is a link to `.agents/skills`, so Claude Code and Codex read the same skills. For a
skill that list leaves out, read its `SKILL.md` under `.zgeoff-skills/<commit>/skills/<name>/`.

## Skill changes

Skill text lives in zgeoff/skills, so edit a skill in a checkout of that repo and open its PR there.
Then:

1. Load the `skill-writing`, `cold-read` and `deslop` skills from that checkout.
2. Do every step in the "Check it" section of its skill-writing. In its last step, you give the PR
   description three headings: "Skill checks", "Cold read" and "Deslop".

## Repo structure

tools is one Bun workspace.

```text
packages/           the @zgeoff/* packages; release-please versions each one and publishes the
                    public ones to npm, as RELEASING.md describes
sync/               the sources that repo-sync delivers, listed in sync/manifest.json; an edit here
                    reaches every repo that takes the entry, as docs/architecture/repo-sync.md
                    describes; skills-pin.json pins the zgeoff/skills commit of the skill text
  pre-push/         the pre-push baseline that the pre-push-baseline entry delivers; its check
                    scripts come from packages/chex, whose own baseline this repo's lefthook.yml
                    extends
  workflow-callers/ workflow stubs that call this repo's reusable workflows, all opt-in but the
                    repo-sync guard
  hooks/            the agent hooks' start-up stub and the skill gate's older entry point
  deadcode/         the knip runner that the opt-in knip-runner entry delivers
  skill-gate/       the skill gate's rules, which repo-sync writes to .claude/skill-gate.json in
                    each repo its except list leaves out; this repo keeps its own copy there,
                    with a gate of its own on TypeScript, and check:sync fails when the copy lacks
                    a shared gate
scripts/            the step scripts that this repo's workflows run, one folder per area, and the
                    shell scripts that repo-sync and the release job run; tests sit beside them; a
                    reusable workflow downloads each step script as it is, so a step script imports
                    no package, and a step that needs one runs a chex subcommand from npm
.github/workflows/  this repo's CI, release and sync dispatch, and the reusable workflows that other repos call:
                    bun-checks, repo-sync and its guard, audit-fix, release-please and the
                    paths-changed gate
```

A manifest entry can name a source outside `sync/`. `.github/PULL_REQUEST_TEMPLATE.md`,
`.github/ISSUE_TEMPLATE/` and `.editorconfig` ship to other repos too, so an edit to one of them
changes every repo that takes it. Skill text never changes here, as [Skill changes](#skill-changes)
says.

## Packages

- Every external version lives once, in the root `workspaces.catalog`. A package writes `"catalog:"`
  for an external dependency and `"workspace:*"` for an internal one.
- Pin exact versions, with no `^` or `~` ranges. `bun add` saves exact versions, so the rule covers
  hand-written edits.

## Commands

- Run `bun run test` from the repo root. It runs `rig unit`, which hands `bun test` this host's
  worker count and leaves out every lane in `rig.config.ts` and its built-in table. The other lanes
  have their own scripts: `bun run test:host`, `bun run test:e2e` and `bun run test:browser`, which
  need no ignore list. The jest-extended preload lives in the root `bunfig.toml`, so a run from a
  package folder lacks the extra matchers. The workflow-lint tests run `actionlint`, so put it on
  the `PATH` first: the pinned build lands in `<dir>/actionlint-bin` after
  `PART=all RUNNER_TEMP=<dir> GITHUB_PATH=<dir>/path bun run ci:install-tool actionlint`.
- `bun run format` fixes formatting. lefthook runs the light checks before a commit and a push, and
  CI runs the rest.
- `bun run lint` is plain oxlint. `bun run lint:full` adds the type-aware pass and its type check.
  oxlint runs both through tsrslint (`@maschwenk/tsrslint`), a Rust port of tsgolint, in tsgolint's
  place, because stock tsgolint runs out of memory under 2 GiB on impz. `lint:full` is CI-only:
  never run it locally.
- `bun run typecheck` runs `tsrs` per package and over the root `rig.config.ts`, `scripts/` and
  `sync/`. CI runs it beside `lint:full`, and when the two type checks disagree, `tsrs` is right.
- `bun run check:sync` checks `sync/manifest.json` against the rules repo-sync assumes. Run it after
  you change the manifest or a file an entry lists. CI runs it, and the pre-push hook does not.
- `bun run check:release-workflow` checks the tag step of the shared release job in
  `.github/workflows/release-please.yml`, and fails on a dependency cycle between the workspace
  packages, in any dependency field, which stops release-please. CI and the pre-push hook run it.
- `bun run check:chex-pin` fails when no custom manager in `renovate.json` captures the chex release
  that `.github/workflows/bun-checks.yml` pins, which Renovate then never bumps. CI runs it.
- `bun run check:repo-sync-workflows` checks the stub `sync/repo-sync.yml` against
  `.github/workflows/repo-sync.yml`: two dispatches of different tools commits get two concurrency
  groups, the sync job queues every waiting run, the stub grants every permission a job asks for,
  and the alarm job asks for `actions: read`. CI and the pre-push hook run it.
- `bun run check:lefthook-guard` checks that `lefthook.yml` holds the `chex-baseline` job that
  `chex init` writes. CI and the pre-push hook run it.
- `bun run check:baseline-jobs` runs each job of `packages/chex/lefthook.yml` in a sandbox and fails
  a job that keeps git's repository variables or breaks the behaviour its case expects. CI runs it.
- `bun run check:test-layout` runs `chex test-layout`, which fails a test folder, a test helper or a
  helper import outside the layout that the `testing` skill sets. CI runs it.
- `bun x chex workflows` runs the shared workflow lint over the workflows HEAD holds, so commit a
  workflow change before you run it. CI runs it. `bun run check:docs` runs the docs checks that this
  repo takes, which the pre-push hook and CI run too.
