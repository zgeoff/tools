# @zgeoff/checks

`zgeoff-check` runs the checks that every zgeoff repo shares, so a repo runs them with one package
script instead of a lint script of its own. Each check is a module with a name, a file glob, and a
function that returns findings. The runner prints each finding as `path:line: <check>: <message>`
and exits 1 when it prints any. With no arguments it checks every file that git tracks, and with a
list of files it checks only those.

## Install

```sh
bun add -d @zgeoff/checks
```

Add the script that the pre-push baseline and the standard list of the shared pull-request checks
call. Both skip the check with a notice while a repo lacks the script, so adding it turns the check
on. A repo that sets its own list in the `BUN_CHECK_SCRIPTS` variable adds `check` to that list as
well:

```json
{
  "scripts": {
    "check": "zgeoff-check"
  }
}
```

The package runs on Bun.

## Checks

| Check   | Files     | It runs                     | It needs on the PATH  |
| ------- | --------- | --------------------------- | --------------------- |
| `shell` | `**/*.sh` | `shellcheck` and `shfmt -d` | `shellcheck`, `shfmt` |

The `shell` check runs `shfmt` with no style flags, so `shfmt` reads its style from the repo's
`.editorconfig`. The `shfmt` finding sits at the first line of each block that `shfmt` would change.
The shared pull-request checks install `shfmt` when their list runs `check`, and the runner image
already has `shellcheck`.

## Exit codes

- `0`: no check found a problem.
- `1`: a check found at least one problem.
- `2`: the run failed before it could check. The config file breaks a rule, a check needs a program
  that the PATH lacks, git or a check's program fails, or an argument starts with a dash and names
  no file. The runner prints the reason.

## Turning a check off

A repo turns a check off in `zgeoff-check.json` at its root, and each entry gives the reason:

```json
{
  "off": [{ "check": "shell", "reason": "the scripts are vendored from another project" }]
}
```

The runner rejects an entry with no reason, with a blank reason, or with a check name it does not
know, and it exits 2 without running any check. A check is either on or off for the whole repo.
