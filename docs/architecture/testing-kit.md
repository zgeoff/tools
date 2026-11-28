# The testing kit

`@zgeoff/testing` is the kit of test helpers that every zgeoff repo imports in place of its own
copies. Each helper that builds a process, a port claim, a folder or an environment change undoes it
when its test ends. Each area of the kit sits in its own import path, a subpath such as
`@zgeoff/testing/git`, so a repo installs only the npm dependencies of the areas it imports. The
[testing package guide](../guides/testing-package.md) shows how to call each helper. This doc gives
the rules that span the kit's files, and why each holds.

## Subpaths and dependencies

The root path, `@zgeoff/testing`, holds the small helpers that any Bun test may need, such as
`waitFor` and `updateEnv`. It never re-exports a subpath, because each subpath brings its own npm
dependencies: `./fetch` brings msw, and `./cli` brings a pseudo-terminal. A repo that never mocks
`fetch` therefore never installs msw, which the kit lists as an optional peer dependency.

The `Clock` interface, through which code reads the time and sleeps, lives in the `@zgeoff/std`
package with the real clock, `systemClock`. The kit holds the fake clock. `@zgeoff/std` never
depends on the kit, because the kit depends on it, and `check:release-workflow` rejects a dependency
cycle. Its own tests therefore keep private copies of two kit helpers, and the
[lint rule](#the-lint-rule) that flags such a copy is off for that folder.
[Decision 0004](../decisions/0004-the-clock-interface-lives-in-std.md) gives the reason for the
Clock's home, and [decision 0005](../decisions/0005-fetch-mocking-uses-msw-3.md) the reason for
msw 3.

## Cleanup

Pass `cleanup: 'manual'` to a helper that builds a fixture in a `beforeAll` hook or at module scope,
and dispose of the fixture yourself. Each helper registers its cleanup with `registerTestCleanup`,
which adds one `onTestFinished` hook per test. Bun fires that hook at the end of the test that is
running, so without `cleanup: 'manual'` a `beforeAll` fixture is gone as soon as the `beforeAll`
ends. `spawnCLI` kills its program from an `onTestFinished` hook of its own, so a program it starts
in a `beforeAll` hook dies at the same point.

When a test ends, the hook runs every cleanup, the newest first, and runs them all even when one
throws. It then throws one error that holds every failure. Each cleanup runs at most once, so a test
may also dispose of a handle early.

List `@zgeoff/testing/preload` in the `[test] preload` of `bunfig.toml`. It puts back each variable
that `updateEnv` changed, after each test, and it covers a test file only when `bunfig.toml` lists
it.

## Waiting

`waitFor` measures time with a monotonic clock, so a change of the wall clock never moves its
deadline. A check that hangs keeps running after the wait gives up, and nothing reads its result.
When the caller passes a `progress` function, the deadline moves out each time its value changes, so
a wait that keeps making progress has no overall limit.

## Processes and ports

`run` runs a program to its exit, and `start` starts a long-running one and waits until it prints
its ready line. Both start the program as the leader of a new process group, and send every signal
to the whole group. A program that forks a child therefore cannot leave the child running after its
test. Both pass the test's current environment to the program explicitly, because Bun's default
hands over the environment from the moment the test process started, without the test's `updateEnv`
changes.

`stop` sends the signal to the group, waits for the group to empty, and kills the group after a
grace period, even when the leader ignores the signal. It then waits only a short time for the
output pipes, because a process outside the group can hold them open.

On macOS, a signal to a group whose leader has exited fails with `EPERM`. The kit treats `EPERM` the
same as `ESRCH`, "no such process", as a group that is gone.

One function turns a signal into an exit code, as 128 plus the signal number, the way a shell does,
and `run`, `start` and `spawnCLI` all use it.

The ready line and `waitForLine` match whole lines of stdout. Stderr shows in the program's output
and never matches. After the program exits, the kit checks the settled output once more, so a ready
line printed just before the exit still counts.

`start` gives the program a free port in `PORT` unless the test names one. On Linux,
`claimFreePorts` picks from a range below the kernel's ephemeral ports, so the kernel never hands
the same port to another socket, and holds each pick with an abstract unix socket named after the
port. Every test process in the same network namespace sees that hold, so two test processes never
claim one port. On other systems, the claim binds port 0 and frees it at once. Two test processes
there can still pick the same port.

## Stand-in programs

Put a stand-in from `@zgeoff/testing/bin` on `PATH` in place of a real program, such as `git` or
`gh`, to fake the program in a test. Each stand-in is a copy of one Bun script from the kit, the
stub runtime, behind a shebang that names the Bun running the test. A stand-in therefore needs Bun,
and the stub runtime imports only from Bun and Node. The stub runtime logs each call before it
answers it, so the log also holds a call that matched no answer, and that call exits 97. The kit
stages each write of a stand-in's files and renames it into place, so a stand-in that is running
never reads a half-written file.

## Files and git

The kit names each temporary folder after the test process's ID and its PID namespace. A sweep of
folders left behind by dead test runs reads those two values from each name, to find the folders
whose process is gone.

`readTemplate` builds a folder once and copies it for each test, across test processes. It keys each
template by a hash of its name and the bytes of each input file, so a change to an input builds a
new template. Each build goes into a staging folder and is renamed into place, so a reader never
sees half a template. Two processes that build the same template take turns through a lock.

The templates live in `zgeoff-testing/templates` under `$XDG_CACHE_HOME`, or under `~/.cache` when
that is unset. They stay on disk because a build such as a release bundle is large, and a cache in a
memory folder such as `/dev/shm` holds every build in RAM. The kernel's page cache keeps a template
in use fast to copy. When the home folder can't hold the cache, the kit uses the OS temp folder.

Each call takes the template's lock, marks the template as used, checks that it exists, and releases
the lock. The first call in a test process deletes each template, of any name, that no call has used
for a day, or for the hours that `ZGEOFF_TESTING_TEMPLATE_MAX_UNUSED_HOURS` sets. It looks in the
cache and in `zgeoff-testing-templates` under the OS temp folder.

The kit deletes a template only while it holds the template's lock, so it skips a template that a
build or another call holds. A call marks a template under that same lock. When the call marks
first, the delete sees a fresh mark and keeps the template. When the delete comes first, the call
finds the template gone and builds it again. The kit leaves a lock folder in place when it deletes a
template, and deletes the folder in a later prune, once the lock has gone unused for the same time.

`readGitEnv` builds the environment for every git command the kit runs. It takes only `PATH` and the
`MISE_*` folders of the mise version manager from the test process's environment. A pre-push hook
exports `GIT_DIR`, so without this rule a test's git command would act on the real repository. The
same rule keeps the developer's own git config, signing key and hooks out of the test.

`createGitRepo` writes each commit with `commit-tree` from a private index, so it never touches a
work tree, a merge commit never conflicts, and the fixed commit date gives the same commit IDs on
every run. `createGitOrigin` turns off automatic maintenance in the bare repo's own config, because
a push runs git on the origin's side without the test's git config variables.

## The fake clock

The fake clock implements `Clock`, so code that sleeps through `Clock` runs in a test without
waiting. Each `advance` picks the next due timer again after each one fires. A timer that a firing
timer schedules inside the window therefore fires in the same `advance`.

`runClockUntil` advances the fake clock until a condition the caller passes holds, or fails when
`maxMs` of fake time passes. It jumps to the next due timer, yields once so the code under test can
run, and checks the condition. With no timer pending, it waits a moment of real time so real I/O can
schedule the next sleep, and it fails after `idleMs` of real time with nothing pending. With
`stepMs`, it advances by that step whatever is pending, for code that polls on a fixed beat, and
`idleMs` does not apply.

## The test network

`createTestNetwork` mocks `fetch` for a whole test process with msw. It registers its hooks when a
test file or preload calls it, never when a file imports it. After each test, it resets the
handlers, then fails the test with a list of each request that matched none.

Before it turns msw on, the network replaces the global `fetch` with a function that rejects. msw
sends a request that a handler passes through to the `fetch` it replaced, so that request rejects
too and never reaches a real server. The network adds a catch-all handler after every handler the
test gives. It records each request that reaches it and answers with a network error. msw without it
lets requests for some asset URLs, such as `.json` files, reach the real `fetch`.

Two networks in one process would patch the same `fetch`, so a marker on `globalThis` makes a second
call throw, even from a second copy of the module. A request over a unix socket, or to a loopback
host such as `127.0.0.1`, skips msw and goes to Bun's own `fetch`, so a suite can still call a
server it started on the same host.

## The stub server

Start a stub server with `startStubServer` for code that msw cannot reach, such as another process.
It logs each request in the order it arrives, before it reads the body, so a slow body never moves a
request out of order. It never times out an idle connection, so a test's handler can hold a request
open, and its `stop` closes every open connection.

## The lint rule

The `zgeoff/use-testing-kit` lint rule flags a function in a repo's tests that has the name of a kit
helper, because such a function is a local copy that drifts from the kit. It reads the names from
the installed kit's `exports` map, so it follows each kit release with no change of its own.
[The test-file rules](./oxlint-config-tests.md) describe it in full.
