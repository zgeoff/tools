# Memory caps

A test run or a type check that outgrows its host takes the host down with it: on a small machine
shared by parallel agents, the kernel's OOM killer then picks a process from any session. The
memory-cap script runs a command inside a cgroup with a memory cap and no swap, so the kernel kills
that command first, and it reports how close the run came. The `memory-cap` entry delivers it to
every repo as `scripts/run-memory-capped.sh`, from
[`sync/pre-push/run-memory-capped.sh`](../../sync/pre-push/run-memory-capped.sh).

## Why a cgroup and not ulimit

`ulimit -v` caps address space, not memory. oxlint reserves far more address space than it uses and
panics under the limit, and a test run under it dies with a small heap. A cgroup's `memory.max`
counts the pages a process uses, so a cap there fails only a run that uses too much.

## The modes

The script tries each mode in order and uses the first the host supports. `--modes` prints the
supported ones, and `MEMORY_CAP_MODE` picks one by name.

| Mode           | Host                                                                    | How it caps                                                                              |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `systemd-sudo` | systemd and a passwordless sudo, such as a GitHub runner                | a transient scope from `sudo systemd-run`, which drops back to the caller with `setpriv` |
| `systemd-user` | a desktop whose user manager has the memory controller                  | a transient scope from `systemd-run --user`                                              |
| `cgroupfs`     | a writable cgroup v2 tree with no systemd, such as a root shell in a VM | a sibling cgroup that the script writes and removes itself                               |
| `none`         | any other host                                                          | no cap: the script prints a warning and runs the command                                 |

cgroup v2 lets a cgroup below the root either hold processes or enable a controller for its
children, never both. The `cgroupfs` mode therefore makes its cgroup beside the one that holds the
shell, under a parent that has the memory controller enabled for its children, and moves the shell
into it.

## What a run reports

After the command ends, the script prints three lines on stderr: the cap and the swap cap it set,
the peak anonymous memory and `memory.peak`, and the count of OOM kills in the cgroup. `memory.peak`
counts the page cache, which the kernel takes back under the cap, so the script also samples the
anonymous memory, which the kernel cannot take back, at a short interval. It exits with the
command's status, or 1 when the kernel OOM-killed a process in the cgroup. In GitHub Actions, the
OOM line is an error annotation.
