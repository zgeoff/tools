# rig

A repo's tests fall into lanes, and each lane needs its own timeout, its own process count and
sometimes its own set-up. `rig` is the one command that runs them all: it holds the table of lanes,
runs each lane with its limits under a memory cap, and gives the lint rules the same limits, so a
lane's timeout is written once. The [`@zgeoff/rig`](../../packages/rig/README.md) package holds it.
[Memory caps](./memory-caps.md) covers `diet`, which caps every command that rig starts, and
[the test-file rules](./oxlint-config-tests.md) cover the lint side of the limits.

## The lane table

The testing skill's [Lanes](../../sync/skills/testing/SKILL.md#lanes) table lists the built-in
lanes, and `standard-lanes.ts` in the package holds the same table as data, which a test pins to the
skill. A lane has a name, a file suffix (the unit and e2e lanes have none), a per-test limit, and a
process count. Every lane but unit runs one process per file, because each needs a real system that
two files cannot share, and the unit lane runs as many workers as the host's worker count allows.

A repo changes the table in `rig.config.ts`. `defineRig` merges the declared lanes over the built-in
ones and returns the resolved table, so a declaration overrides a built-in lane's limit, memory
budget and hooks, and adds a lane with its own suffix and limit. A bad value throws an error that
holds the lane and the field, because a config file is outside input and a lane with a wrong limit
would otherwise run unnoticed. The table is data, so Node can import the config when oxlint loads
its plugin.

## A lane's run

`rig <lane>` runs three steps, and the last one always runs:

1. `start` prepares what the tests need. A repo lane's `start` module default-exports a function
   that takes the lane context (repo root, lane, run ID and environment) and may return extra
   environment variables for the tests.
2. `run` starts `bun test` under `diet`, with the lane's limit as `--timeout`, its process count as
   `--parallel`, and its memory as `diet`'s budget. The lane's suffix filter or its `e2e` folders
   select the files. The folders are the `e2e` folders at the repo root or an app root and the
   `-e2e` packages that git tracks.
3. `stop` cleans up, whether the tests passed, failed or never started.

`rig` turns SIGINT, SIGTERM and SIGHUP into an abort. The abort stops the running command, the run
waits for it to exit so that `stop` can clean up, and an aborted run exits 1 whatever the tests'
exit code was.

`rig unit` builds its `bun test` command from the same table: one path ignore for every lane suffix
and for the `e2e` folders. A lane declared in `rig.config.ts` therefore leaves the unit run without
any ignore list in `package.json`. `rig related` runs the unit lane in its own process on the tests
beside the changed files, takes the lane suffixes from the table, and skips when the branch changes
a shared test input or has more than 50 related files. `rig init` writes the package scripts for the
lanes the repo has and a starter config, and a second run changes nothing.

## The browser lane

The browser lane runs `.browser.test.ts` suites against Chrome through `Bun.WebView`, one process
per file. It is built into rig, so its three steps are code in the package, and a repo declares no
hooks for it.

### Folders

The run folders sit in the repo's git-ignored cache, at
`node_modules/.cache/rig/browser/<host name>/<run ID>`, never in `TMPDIR`, because a host's `TMPDIR`
can sit in memory and each Chrome profile takes megabytes. Each host name keeps its own runs,
because a container that mounts the repo sees other process IDs than its host. The run ID is the rig
process's ID, and the lane passes it to the tests in `RIG_BROWSER_RUN_ID`, because the preload runs
again in each file's process and an ID it made would differ in each file.

### Chrome's temp folder

The tests get a short `TMPDIR`, because Chrome stops at startup when its socket path is longer than
the 107 bytes a Unix socket address holds, and the suites then fail with
`Chrome process closed the pipe`. That `TMPDIR` is a folder for the run inside a private folder
named `rig-browser-<uid>` in the system temp folder, or in `/tmp` when the system temp folder's path
is too long. Every user of a host shares `/tmp`, so the lane checks the private folder's owner and
mode before it writes there.

### The build and the preload

The lane runs the repo's `build:browser` script once, when the repo defines one, with the build
folder's path in `RIG_BROWSER_BUILD_DIR`. A build in the preload would run again in every file,
because `--parallel=1` isolates each file. The preload fails a file when the lane set no run ID, or
when the lane ran a build and its folder is empty, and it starts Chrome on a profile folder of the
file's own inside the run folder. `Bun.WebView` never removes the temporary profile that it makes
under `bun test` ([oven-sh/bun#45389](https://github.com/oven-sh/bun/issues/45389)), so a Chrome on
its own profile would leave a folder per file.

### Run and stop

The run is `bun test --parallel=1` over the suites, with the lane's preload and the lane's limit.
Afterwards the lane removes both run folders, unless it could not stop a process group, because that
group can still write there and a later sweep needs its record.

### Process groups and the sweep

Each command, the build and the tests, runs in a process group of its own, because both start
processes, such as Chrome, that a signal to the command alone leaves running. The command's shell
records its group by moving the lane's pending record for that command to the group ID. An abort
sends the group SIGTERM, then SIGKILL after a deadline, and the lane waits until no member of the
group runs.

A run that SIGKILL stops leaves its groups running and its folders in place. The next run's sweep
removes a run folder only when the run's process and every group it recorded have exited. The
pending records make that decision sound: the sweep removes an exited run's pending records before
it reads the groups, and a command starts only after it claims its record, so no command of an
exited run can record a group after the sweep has read the run. A zombie counts as exited, because a
host whose first process never reaps its orphans keeps them forever.

The lane runs under `diet`, and never under `ulimit -v`. Chrome's V8 sandbox reserves far more
address space than it uses and stops when it cannot, and no flag turns the sandbox off, so Chrome
fails under a cap that the lane's memory use never reaches. A cgroup cap counts only the memory a
process uses. The recorded shell runs `bash` on `diet`'s script, which rig resolves from its own
`@zgeoff/diet` dependency, so a repo's `PATH` never decides which cap runs.

## One source for the limits

`@zgeoff/oxlint-config` reads `rig.config.ts` when oxlint loads its plugin. Its `max-test-timeout`
and `test-beside-module` rules then take each lane's limit and suffix from the resolved table, so a
limit changes in one file. oxlint runs a plugin under Node, which strips the types of a `.ts` file
from version 22.18, and rig's package therefore ships a built Node entry that the config's
`@zgeoff/rig` import resolves to. Bun resolves the same import to the source. A repo with a
`rig.config.ts` that also sets the rules' `lanes` option gets one config error from each rule, and a
repo without the file keeps the rules' own table. The plugin fails to load, with the import error as
its cause, when Node cannot read the file.
