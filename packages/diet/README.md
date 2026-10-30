<div align="center">
  <h1>@zgeoff/diet</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/diet"><img src="https://img.shields.io/npm/v/@zgeoff/diet" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/architecture/memory-caps.md">Memory caps</a>
  </p>
</div>

Run a command inside a cgroup memory cap with no swap, and report its peak memory and any OOM kills.

A test run or a type check that outgrows a small host takes the host down with it. `diet` runs the
command in a cgroup of its own, so the kernel kills that command first, and it prints how close the
run came to its budget. It exits with the command's status, or 1 when the kernel OOM-killed a
process in the cgroup.

## Install

```sh
bun add -d @zgeoff/diet
```

`diet` is a bash script for Linux with cgroup v2. On any other host it prints a warning and runs the
command uncapped.

```sh
diet -- bun run typecheck
diet --budget 4G -- bun test
```

```text
diet: peaked at 1.2 GB of 4 GB
```

## Features

- A budget in bytes or in binary units, such as `512M` or `4G`, or by default the host's memory
  budget: its total memory, or the tightest cgroup cap above the process when that is lower.
- A cap through a systemd scope, with or without sudo, or through a cgroup that `diet` writes
  itself, as [the modes](../../docs/architecture/memory-caps.md#the-modes) describe.
- The peak anonymous memory of the run, which the kernel cannot take back under the cap.
- An error annotation for an OOM kill in GitHub Actions.
- Signals to `diet` go on to the command, so the report still prints when a run is stopped.

## Documentation

[Memory caps](../../docs/architecture/memory-caps.md) describes why `diet` uses a cgroup, how each
mode caps, and what a run reports.
