# The PR body check

`chex pr-body` checks that a pull request's description follows the
[PR template](../../.github/PULL_REQUEST_TEMPLATE.md), so every PR has the same sections and labels.
The [pr-body workflow](../../.github/workflows/pr-body.yml) runs it on each push and each edit of a
PR.

```sh
chex pr-body --body-file body.md                                # the shape of the body
chex pr-body --body-file body.md --base <sha> --head <sha>     # also the prose-check commits
chex pr-body tick-chex --body-file body.md --passed            # prints the body, chex line ticked
```

It prints one line per error, with the section and the fix. It reads the body without its HTML
comments and without the verify report between `<!-- wringer:report -->` and
`<!-- /wringer:report -->`, because the template's examples sit in comments and the report is
written by `bun verify publish`.

## The checks

- **Headings:** `Description`, then `Next steps`, `Checks` and `Verification`, in that order, and
  none other. Only `Description` is required. A section with nothing in it fails: delete its
  heading.
- **Next steps:** only two labels. Each item under **Needs the owner** is a checkbox. Each item
  under **Later** ends with an issue ID in brackets, such as `(GEO-124)`.
- **Code blocks:** at most 50 lines, each 100 characters or fewer, so a block fits on screen on
  GitHub without a scroll bar.
- **Placeholders:** a `<word>` left from the template fails, outside code.
- **Checks:** only the lines `- [ ] chex`, `- [x] Deslop (<commit>)` and
  `- [x] Cold read (<commit>)`. The commit is the one the agent ran that check on.

With `--base` and `--head`, it also reads the branch's commits. The commit on a Deslop or Cold read
line fails when it isn't on the branch, or when a commit after it on the branch changes a doc or
skill file, because the check then ran on text that has since changed. A PR whose branch changes a
doc or skill file needs a Checks section. Doc and skill files are the files that `chex prose` reads
when it gets no path, as the [chex README](../../packages/chex/README.md) lists.

`tick-chex` changes nothing on disk: it prints the body with only the chex line set to `[x]`, or to
`[ ]` with `--failed`.
