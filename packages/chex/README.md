<div align="center">
  <h1>@zgeoff/chex</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/chex"><img src="https://img.shields.io/npm/v/@zgeoff/chex" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/architecture/pre-push-baseline.md">The pre-push baseline</a>
  </p>
</div>

Run each shared check of a zgeoff repo as one subcommand, and take the lefthook pre-push baseline
that calls them with one `extends` line.

Each check prints its own findings, then `cleared: <check>` when it passes or `bounced: <check>`
when it fails, so a run of several checks names each one that failed. To start, run `chex init`,
then `chex length links`.

## Install

```sh
bun add -d @zgeoff/chex @zgeoff/rig @zgeoff/diet @commitlint/cli @zgeoff/commitlint-config
bun x --no-install chex init
```

`chex` runs under Bun. The baseline runs the related tests through [`@zgeoff/rig`](../rig/README.md)
and each job under the memory cap of [`@zgeoff/diet`](../diet/README.md), so a repo that takes it
installs both, and `chex init` fails until it does. `chex commits` lints commit messages with
`@commitlint/cli` and `@zgeoff/commitlint-config`; in a repo that lacks either one, it prints a
notice and passes.

## Commands

`chex <check>...` runs each check in turn, even after one bounces, and exits with the highest exit
code among them: 0 when each clears, 1 when a check finds a fault, and 2 when a check cannot run.
chex also exits 2 for a check that throws or exits with any other code, such as 127 for a missing
program. `chex <check> <args...>` hands the arguments to that one check.

The docs checks read the repo's READMEs, its `docs/` tree and its skills:

| Check     | Fails on                                                                                                            | Arguments      |
| --------- | ------------------------------------------------------------------------------------------------------------------- | -------------- |
| `prose`   | banned words, process residue and over-long paragraphs                                                              | the paths      |
| `length`  | a README over its line limit, and warns on a doc over its cap                                                       | none           |
| `links`   | a relative link or anchor that does not resolve                                                                     | the paths      |
| `readmes` | a README of none of the [five kinds](../../sync/skills/docs-writing/references/readmes.md#the-five-kinds-of-readme) | none           |
| `vision`  | a missing `docs/vision.md`, or one past 60 lines                                                                    | none           |
| `skill`   | a skill's frontmatter, its word limit, and a link with a line anchor                                                | the skill dirs |

The repo checks read the branch, the pushed commits and the repo's config:

| Check              | Fails on                                                                    | Arguments       |
| ------------------ | --------------------------------------------------------------------------- | --------------- |
| `commits`          | a pushed commit whose message fails `@zgeoff/commitlint-config`             | `--pushed-refs` |
| `local-paths`      | a line a pushed commit adds that holds the home folder or the host name     | `--pushed-refs` |
| `test-timeouts`    | a `bun test` timeout above its lane's limit, in a script or a `bunfig.toml` | none            |
| `workflows`        | nothing: it warns on each fault of the shared workflow lint, and passes     | the paths       |
| `dependency-gates` | a stale age-gate exclude, an override or an audit ignore that nothing needs | none            |
| `uncommitted`      | a file the branch changes that holds a change the push does not send        | none            |

With no path, `prose` and `links` read every README outside `.claude/` and `.agents/`, every file
under `docs/`, each spike's `results.md`, and the Markdown under `.agents/skills/`,
`.claude/skills/`, `skills/` and `sync/skills/`. `--pushed-refs` reads the refs a push sends from
stdin, as a pre-push hook gets them; without it, `commits` and `local-paths` read the branch's
commits since its base.

Some docs checks skip files whether or not you name paths, and a path you name never brings a
skipped file back:

- `prose` skips the `docs-writing`, `project-docs-writing`, `skill-writing` and `deslop` skills
  under `.agents/skills/`, `.claude/skills/`, `skills/` and `sync/skills/`, which hold the banned
  patterns as examples.
- `links` skips `project-docs-writing` under `.agents/skills/` and `.claude/skills/`, and
  `docs-writing` and `skill-writing` under `.claude/skills/` and `sync/skills/`, which link to
  placeholder targets as examples.
- `prose`, `links`, `readmes` and `skill` skip each file that `.gitattributes` marks
  `linguist-vendored`.

`chex init` writes the `extends` line and a
[`chex-baseline` job](../../docs/architecture/pre-push-baseline.md#a-checkout-without-the-baseline)
into `lefthook.yml`, and adds a `check:docs` script of `chex prose length links skill` when the repo
has none. A second run changes nothing.

## The pre-push baseline

A repo's `lefthook.yml` takes the baseline with one line, which `chex init` writes:

```yaml
extends:
  - node_modules/@zgeoff/chex/lefthook.yml
```

The baseline's jobs call `chex <check>` for the repo checks, `bun run check:docs` for the docs
checks the repo names, `rig related` for the tests beside the changed files, and the repo's own
`format:check` and `typecheck` scripts.
[The pre-push baseline](../../docs/architecture/pre-push-baseline.md) describes each job.
