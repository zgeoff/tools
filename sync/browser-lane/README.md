# Browser lane

This folder holds the browser lane, which the `browser-lane` entry of repo-sync delivers to a repo's
`scripts/browser-lane/` folder. The lane runs the repo's `.browser.test.ts` suites, each file in its
own process, against Chrome through `Bun.WebView`. It has three parts: the lane script, which
prepares the run and starts `bun test`, the shared browser preload, which starts Chrome in each
file's process, and the `runInPage` helper, which runs a suite's page code. The
[testing skill](../skills/testing/references/system-tests.md#browser-suites) holds the rules for the
suites themselves.

## The lane script

The repo's `test:browser` script runs the lane script under the memory cap. The lane script imports
ts-pattern, so a repo that takes the entry lists ts-pattern in its dev dependencies. The lane script
does these steps in order:

1. It removes the run folders of older runs whose lane process and recorded process groups have all
   exited, as the testing skill's [Per-run templates](../skills/testing/SKILL.md#per-run-templates)
   describes for every per-run folder. Each command starts only after it claims a pending record
   that the lane made for it, and the sweep removes an exited lane's pending records before it reads
   the groups, so no older command starts after the sweep has read its run.
2. It makes the run ID from its own process ID and passes it to the test processes in an environment
   variable. The preload runs again in each file's process, so an ID that the preload made would
   differ in each file.
3. It runs the repo's `build:browser` script once for the run, when the repo defines one, with the
   path of the run's build folder in `BROWSER_LANE_BUILD_DIR`. A build in the preload would run
   again in each file's process, because `--parallel=1` isolates each file. The suites read the
   build from the same variable.
4. It sets a short `TMPDIR` for the test processes, inside a private folder of the user's own, which
   the lane checks before it writes there. Chrome stops at startup when its socket path under
   `TMPDIR` is too long for a Unix socket, and the suites then fail with
   `Chrome process closed the pipe`.
5. It runs `bun test --parallel=1` with the preload over the arguments it takes, then removes the
   run's folders, whether the tests pass or fail, or SIGINT, SIGTERM or SIGHUP stops the run. A run
   that another signal stops, such as SIGKILL, leaves its folders for the next run's sweep. So does
   a run with a process group that the lane could not stop, because the group can still write there.

## The preload

The preload runs in each file's process. It fails the file when the lane set no run ID, or when the
lane ran a build and the build folder is empty. It then starts Chrome on a profile folder of the
file's own inside the run's folder, which sits in the repo's git-ignored cache folder. `Bun.WebView`
never removes the temporary profile that it makes under `bun test`
([oven-sh/bun#45389](https://github.com/oven-sh/bun/issues/45389)), so a run that let Chrome make
its own profile would leave a folder per file behind.

Bun spawns one Chrome per process, on the options of the first view, so a suite opens its views with
`new Bun.WebView({ backend: 'chrome' })` and gets the Chrome that the preload started.

## The memory cap

The lane runs under the repo's [memory-cap script](../../docs/architecture/memory-caps.md), locally
and on CI, and never under `ulimit -v`. Chrome's V8 sandbox reserves at least 8 GB of address space
and stops when it cannot, and no flag turns the sandbox off. `ulimit -v` caps address space, so
Chrome fails under a cap that the lane's memory use never reaches. The cgroup cap counts only the
memory that a process uses, so Chrome starts under it.

## Documentation

- [Opting in to the browser lane](../../docs/runbooks/downstream-repo-setup.md#opting-in-to-the-browser-lane):
  the changes a repo makes beside the `include` line.
