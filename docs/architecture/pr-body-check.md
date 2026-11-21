# The PR body check

`pr-body` lints a PR body that `--body-file` names, and prints one line per error with the section
and the fix. It strips HTML comments and the `wringer:report` span first, so the template's own
examples never count. With `--base` and `--head`, it also fails a Deslop or Cold read hash that is
not in the branch or is older than the newest commit between them that changes a doc or skill file,
and a PR that changes such a file with no Checks section. Those are the files `prose` reads with no
path. `chex pr-body tick-chex --body-file <path> --passed` prints the body with only the chex
checkbox ticked, and `--failed` unticks it.
