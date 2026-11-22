# The PR checks

Two checks keep every pull request in the zgeoff repos to one shape: the body check holds the
description to the [PR template](../../.github/PULL_REQUEST_TEMPLATE.md), and the title check holds
the title to the Conventional Commit rules. Each runs as a reusable workflow in this repo.
[repo-sync](./repo-sync.md) writes a small caller workflow for each into every repo it syncs, so a
repo needs no setting to get them.

## The body check

The body check is `chex pr-body`, a command of [chex](../../packages/chex/README.md), the checks
package in this repo. The [pr-body workflow](../../.github/workflows/pr-body-check.yml) runs it on
each push to a PR and each edit of its description. The workflow fetches the description from the
GitHub API when the run starts, so it checks the current text even when the tick-chex job edited the
description after the push or edit that started the run. The workflow skips a PR that a bot opened.
Its first job, the pr-body job, runs the command below; its second, the tick-chex job, ticks the
chex box.

```sh
chex pr-body --body-file body.md                              # the shape of the description
chex pr-body --body-file body.md --base <sha> --head <sha>   # also the Checks commit hashes
```

The command prints one line for each error, with the section and the fix. It ignores HTML comments,
because the template keeps its examples in them. It also ignores the block between
`<!-- wringer:report -->` and `<!-- /wringer:report -->`. In a repo set up with the
[wringer](https://github.com/zgeoff/wringer) verify tool, `bun verify publish` writes that block
into the description after the PR opens.

The description fails on:

- Any heading but `Description`, `Next steps`, `Checks` and `Verification`, or those headings out of
  that order. A heading with nothing under it also fails: delete it.
- A bold label line under Next steps other than **Needs the owner** and **Later**, an item under
  **Needs the owner** that isn't a checkbox, and an item under **Later** that doesn't end with an
  issue ID in brackets, such as `(GEO-124)`.
- A code block over 50 lines, or a line in one over 100 characters, which GitHub shows with a scroll
  bar.
- A `<word>` placeholder left from the template, outside code.
- A line under Checks other than `- [ ] chex`, `- [x] Deslop (<commit>)` and
  `- [x] Cold read (<commit>)`.

Only `Description` is required.

A PR that changes a doc or skill file also needs the Checks section with all three lines. A doc or
skill file is any file that `chex prose` reads when it gets no path, as the chex README lists.

### The Checks lines

The chex line passes ticked or unticked, because the tick-chex job sets it. The author ticks the
other two after running the [deslop](https://github.com/zgeoff/skills/tree/main/skills/deslop) and
[cold-read](https://github.com/zgeoff/skills/tree/main/skills/cold-read) skills, and writes the
short hash of the commit they checked in the brackets.

With `--base` and `--head`, the command also reads the branch's commits:

- It fails the hash on either line when that commit isn't on the branch.
- It fails the hash on the Deslop line when a later commit on the branch changes a doc or skill
  file. Run deslop on that change, and write the new hash on the Deslop line.
- It keeps the hash on the Cold read line valid after later commits. The cold-read skill caps the
  reads for each PR, and a fresh cold read always finds something, so a rerun after each fix would
  never stop.

## The tick-chex job

The pr-body workflow's second job runs `chex prose links skill` on the PR's head: the prose, links
and skill checks. It ticks the chex line when all three pass, unticks it when one fails, and fails
itself too, so the run shows why the box is unticked. It writes the description back only when the
text changed, and leaves a description with no chex line as it is.

The job runs when a PR opens, reopens or gets a push, and never on an edit, because its own edit
would start it again. It skips a PR from a fork, whose token can't write, and a PR that a bot
opened. To tick a chex line you added by hand, push a commit.

## The chex version

The pr-body workflow names the chex release it runs in its `CHEX` environment value, and this repo's
`bun-checks.yml` workflow names the same release in its own. `bun run check:chex-pin` fails when
`renovate.json` has no rule that updates both, so Renovate always moves them together.

## The title check

The [pr-title workflow](../../.github/workflows/pr-title-check.yml) lints the PR title with
commitlint and `@zgeoff/commitlint-config`, the rules that `chex commits` applies to each commit. A
squash merge makes the title the commit subject, so the title follows the same rules. The workflow
runs when a PR opens, reopens, gets a push or is edited, so renaming the PR runs the check again.

## When a check fails

Open the failed job from the PR's checks list, and read its log.

- When the pr-body job fails, its log names each section and the fix. Edit the PR description, which
  runs the check again.
- When the tick-chex job fails, its log holds the output of `chex prose links skill`. Fix what it
  reports, and push. The push runs the job again, and it ticks the box when the checks pass.
- When the pr-title job fails, its log gives the commitlint error and the fix. Rename the PR, which
  runs the check again.
