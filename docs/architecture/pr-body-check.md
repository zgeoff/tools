# The PR checks

Two checks keep every pull request in the zgeoff repos to one shape: the body check holds the
description to the [PR template](../../.github/PULL_REQUEST_TEMPLATE.md), and the title check holds
the title to the Conventional Commit rules. Each runs as a reusable workflow in this repo.
[repo-sync](./repo-sync.md) writes a small caller workflow for each into every repo it syncs, so a
repo opts into neither.

## The body check

The body check is `chex pr-body`, a command of [chex](../../packages/chex/README.md), the checks
package in this repo. The [pr-body workflow](../../.github/workflows/pr-body-check.yml) runs it on
each push to a PR and each edit of its description. The workflow fetches the description from the
GitHub API when the run starts, so it checks the current text even when another job edited the
description after the push or edit that started the run. The workflow skips a PR that a bot opened.

```sh
chex pr-body --body-file body.md                              # the shape of the description
chex pr-body --body-file body.md --base <sha> --head <sha>   # also the Checks commit hashes
```

The command prints one line for each error, with the section and the fix. It ignores HTML comments,
because the template keeps its examples in them. It also ignores the block between
`<!-- wringer:report -->` and `<!-- /wringer:report -->`, which a repo's verify tool writes into the
description after the PR opens.

The description fails on:

- **Headings:** any heading but `Description`, `Next steps`, `Checks` and `Verification`, or those
  out of that order. A heading with nothing under it also fails: delete it.
- **Next steps:** a bold label line other than **Needs the owner** and **Later**. Each item under
  **Needs the owner** must be a checkbox, and each item under **Later** must end with an issue ID in
  brackets, such as `(GEO-124)`.
- **Code blocks:** a block over 50 lines, or a line over 100 characters, which GitHub shows with a
  scroll bar.
- **Placeholders:** a `<word>` left from the template, outside code.
- **Checks:** any line but `- [ ] chex`, `- [x] Deslop (<commit>)` and `- [x] Cold read (<commit>)`.

Only `Description` is required, with one exception: a PR that changes a doc or skill file needs the
Checks section with all three lines. A doc or skill file is any file that `chex prose` reads when it
gets no path, as the chex README lists.

### The Checks lines

The chex line passes ticked or unticked, because the tick-chex job sets it. The author ticks the
other two after running the [deslop](https://github.com/zgeoff/skills/tree/main/skills/deslop) and
[cold-read](https://github.com/zgeoff/skills/tree/main/skills/cold-read) skills, and writes the
commit they checked.

With `--base` and `--head`, the command also reads the branch's commits:

- A Deslop or Cold read commit fails when it isn't on the branch.
- A Deslop commit fails when a later commit on the branch changes a doc or skill file. Run deslop on
  that change, and write the new commit on the Deslop line.
- A Cold read commit stays valid after later commits. The cold-read skill caps the reads for each
  PR, and a fresh cold read always finds something, so a rerun after each fix would never stop.

## The tick-chex job

The pr-body workflow's second job runs `chex prose links skill` on the PR's head: the prose, links
and skill checks. It ticks the chex line when all three pass, unticks it when one fails, and fails
itself too, so the run shows why the box is unticked. It writes the description back only when the
text changed, and leaves a description with no chex line as it is. It does the edit with
`chex pr-body tick-chex`, which prints the description with the chex line set to `[x]`, or to `[ ]`
with `--failed`, and writes no file.

The job runs when a PR opens, reopens or gets a push, and never on an edit, because its own edit
would start it again. It skips a PR from a fork, whose token can't write, and a PR that a bot
opened. To tick a chex line you added by hand, push a commit.

The workflow pins one chex release in its `CHEX` value, and `bun-checks.yml` pins another. In this
repo, `bun run check:chex-pin` fails when a Renovate custom manager in `renovate.json` doesn't match
both pins, so Renovate bumps them together.

## The title check

The [pr-title workflow](../../.github/workflows/pr-title-check.yml) lints the PR title with
commitlint and `@zgeoff/commitlint-config`, the rules that `chex commits` applies to each commit. A
squash merge makes the title the commit subject, so the title follows the same rules. The workflow
runs when a PR opens, reopens, gets a push or is edited, so renaming the PR runs the check again.

## When a check fails

Open the failed job from the PR's checks list. Its log has one line for each error, with the section
and the fix.

- **The pr-body job:** edit the PR description, which runs the check again.
- **The tick-chex job:** fix what `chex prose links skill` reports, and push. The push runs the job
  again, and it ticks the box when the checks pass.
- **The pr-title job:** rename the PR, which runs the check again.
