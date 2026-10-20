# @zgeoff/checks

`zgeoff-check` runs the checks that every zgeoff repo shares, so a repo runs them with one package
script instead of a lint script of its own. Each check is a module with a name and a function that
returns findings. A file check also has a file glob, and a branch check reads the commits of the
branch instead of files. The runner prints each finding as `path:line: <check>: <message>` and exits
1 when it prints any. With no arguments the file checks read every file that git tracks, and with a
list of files they read only those. The branch checks run in both cases. It runs from any folder in
the repo: it reads the config at the repo root, prints each path from the root, and reads a file
argument from the folder it runs in. It skips a listed file that does not exist, such as one the
branch deletes, so a misspelled path checks nothing.

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

| Check         | Files                              | It runs                        | It needs on the PATH  |
| ------------- | ---------------------------------- | ------------------------------ | --------------------- |
| `shell`       | `**/*.sh`                          | `shellcheck -x` and `shfmt -d` | `shellcheck`, `shfmt` |
| `workflows`   | `.github/workflows/*.{yml,yaml}`   | `actionlint`                   | `actionlint`          |
| `commits`     | the branch's commits               | `commitlint`                   | `commitlint`          |
| `local-paths` | the lines the branch's commits add | `git log -p`                   | `git`                 |

The `shell` check runs `shfmt` with no style flags, so `shfmt` reads its style from the repo's
`.editorconfig`. The `shfmt` finding sits at the first line of each block that `shfmt` would change.
`shellcheck` follows each `source` line into the file it names, and looks for that file beside the
script and then from the repo root. A sourced file is followed even when the run does not list it.
The shared pull-request checks install `shfmt` when their list runs `check`, and the runner image
already has `shellcheck`.

The `workflows` check reads only the top of `.github/workflows`, because GitHub runs no workflow
from a subfolder. `actionlint` reads its config from `.github/actionlint.yaml`, where a repo ignores
an error message that the pinned release reports wrongly. `actionlint` also runs `shellcheck` on
each `run:` script. The shared pull-request checks install a pinned `actionlint` when their list
runs `check`.

## Branch checks

A branch check reads the commits from the branch's base to HEAD. The base is the merge base of HEAD
and origin's default branch, which `origin/HEAD` names, or `origin/main` when origin has no HEAD.
The run exits 2 when git finds no base, so a clone without the default branch never passes
unchecked. The shared pull-request checks fetch the full history for this. A repo with its own CI
checks out with `fetch-depth: 0`.

The `commits` check runs `commitlint` on the message of each commit except merge commits. It passes
the rules of `@zgeoff/commitlint-config` with `--config`, so a `commitlint.config.js` in the repo
has no effect. Each finding prints the commit's short hash as its path and 1 as its line. The repo
installs `commitlint`, which `bun run` puts on the PATH:

```sh
bun add -d @commitlint/cli
```

The `local-paths` check reads each line that a commit of the branch adds, in every commit, because a
later commit that removes the line still pushes the commit that adds it. A line fails when it holds
the home directory of whoever runs the check, followed by a slash, or the machine's host name as a
whole word. Each finding sits at the line's number in the file as that commit leaves it. The check
reads no home of `/` and no host named `localhost`, which match too much to mean a leak. In CI the
home and the host belong to the runner, so the check catches a leak only where it runs on the
machine that made it, such as in the pre-push hook.

## Exit codes

- `0`: no check found a problem.
- `1`: a check found at least one problem.
- `2`: the run could not finish, so the runner prints the reason and no findings, even when some
  checks found problems before it stopped. That happens when the config file breaks a rule, a check
  needs a program that the PATH lacks, a branch check finds no base, git or a check's program fails,
  a listed file cannot be read for a reason other than being absent, or the command line holds an
  unknown option or `--help` with files.

## Turning a check off

A repo turns a check off in `zgeoff-check.json` at its root, and each entry gives the reason:

```json
{
  "off": [{ "check": "shell", "reason": "the scripts are vendored from another project" }]
}
```

The runner rejects an entry with no reason, with a blank reason, or with a check name it does not
know, and it exits 2 without running any check. A check is either on or off for the whole repo.
