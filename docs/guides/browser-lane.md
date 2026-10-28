# Setting up a browser lane

A repo's browser lane runs its `.browser.test.ts` suites, each in its own process, against Chrome
through `Bun.WebView`. The lane has two parts that the repo writes: the lane command, which prepares
the run and starts `bun test`, and the shared browser preload, which starts Chrome in each file's
process. The [testing skill](../../sync/skills/testing/references/system-tests.md#browser-suites)
holds the rules for the suites themselves.

## The lane command

Write the lane command as a script that the repo's `test:browser` script runs. It does these steps
in order:

1. Build what the suites load, such as the web client, once for the run. A build in the preload runs
   again in each file's process, because `--parallel=1` isolates each file and a per-process memo
   starts empty in each one.
2. Make the run ID and pass it to the test processes in an environment variable. The preload runs
   again in each file's process, so an ID that the preload makes differs in each file.
3. Set a short `TMPDIR` for the test processes, such as a folder for the run under `/tmp`. Chrome
   stops at startup when its socket path under `TMPDIR` is too long for a Unix socket, and the
   suites then fail with `Chrome process closed the pipe`.
4. Run `bun test --parallel=1` over the browser suites, inside the repo's memory-cap script, as
   [The memory cap](#the-memory-cap) describes.

## The preload

The shared browser preload runs in each file's process. It does these steps:

1. Check that the build from the lane command exists, and fail the file when it does not.
2. Read the run ID, and fail the file when the lane command set none.
3. Give the file's Chrome its own profile folder inside a folder for the run. The run's folder sits
   in the repo's git-ignored cache folder and takes its name from the run ID. `Bun.WebView` never
   removes the temporary profile that it makes under `bun test`
   ([oven-sh/bun#45389](https://github.com/oven-sh/bun/issues/45389)), so a run that lets Chrome
   make its own profile leaves a folder per file behind.
4. Start Chrome.

The start-of-run sweep removes the run folders of older runs, as the testing skill's
[Per-run templates](../../sync/skills/testing/SKILL.md#per-run-templates) describes for every
per-run folder.

## The memory cap

Run the lane under the repo's [memory-cap script](../architecture/memory-caps.md), locally and on
CI, and never under `ulimit -v`. Chrome's V8 sandbox reserves at least 8 GB of address space and
stops when it cannot, and no flag turns the sandbox off. `ulimit -v` caps address space, so Chrome
fails under a cap that the lane's memory use never reaches. The cgroup cap counts only the memory
that a process uses, so Chrome starts under it.
