# Testing a program with @zgeoff/testing

[`@zgeoff/testing`](../../packages/testing/README.md) drives a real program from a Bun test. It
takes the program's command, a `readonly string[]`, and a `cwd`, and it never looks the program up.
In a repo that uses [`@zgeoff/rig`](../../packages/rig/README.md), `resolveProgram` from
`@zgeoff/rig/e2e` returns the command:

```ts
import { resolveProgram } from '@zgeoff/rig/e2e';
import { start } from '@zgeoff/testing/process';

await using ledger = await start(await resolveProgram('ledger'), { ready: { url: '/health' } });
```

Put these tests in `e2e/`, as the
[testing skill](https://github.com/zgeoff/skills/blob/main/skills/testing/references/system-tests.md#end-to-end-suites)
says. Every call needs `bun:test`, because each handle registers its cleanup with `onTestFinished`.

## Choose the entry point

| The program                                 | Use                       |
| ------------------------------------------- | ------------------------- |
| asks questions or redraws a screen          | `spawnCLI`, in a terminal |
| runs and exits, and a test reads its output | `run`                     |
| keeps running, such as a server or a worker | `start`                   |

## Drive a terminal program

`spawnCLI` from `@zgeoff/testing/cli` runs the program in a pseudo-terminal of 80 by 24 characters,
with `TERM=xterm-256color`.

```ts
import { spawnCLI } from '@zgeoff/testing/cli';

await using cli = await spawnCLI(command, { args: ['init'] });

await cli.screen.findByText('Project name?');
await cli.user.type('ledger');
await cli.user.pressEnter();
await cli.screen.findByText(/created ledger/u);

expect(await cli.result).toBe(0);
```

- `screen` queries the lines of what a person sees. A program that redraws a line, such as a
  spinner, leaves one line on the screen, and escape sequences are gone. `findByText` waits 5 s by
  default. A string matches a substring of a line, and a RegExp matches by `test`. When no line
  matches, `getByText` and `findByText` throw with the screen text.
- `screen.links()` returns the OSC 8 hyperlinks, each with its text, `href` and params.
- `user.press` takes `up`, `down`, `left`, `right`, `space`, `enter`, `tab`, `escape` or
  `backspace`. `user.cancel()` writes Ctrl+C. Each call waits one macrotask, so the program reads
  the keys before the test goes on.
- `resize(cols, rows)` changes the terminal size, and `cols` and `rows` set the starting size.
- `silent: false` also prints the program's output to the test runner's terminal, to watch a failing
  run.

## Run a program to its exit

`run` from `@zgeoff/testing/process` returns the exit code, stdout and stderr. It writes `input` to
stdin and then closes stdin. When `timeoutMs` passes, it sends SIGKILL to the program's whole
process group and throws with the output so far.

```ts
const { exitCode, stdout } = await run(command, { args: ['--version'], timeoutMs: 5000 });
```

## Start a long-running program

`start` picks a free port, or takes `port`, and sets `PORT`. A program that takes its port another
way reads it from `args` or `env`, written as functions of the port. The program runs as the leader
of its own process group, and `start` waits for `ready`:

| `ready`                     | The program is ready when                    |
| --------------------------- | -------------------------------------------- |
| `{ url: '/health' }`        | the URL, resolved against `url`, answers 2xx |
| `{ stdout: /^listening/u }` | a whole stdout line matches                  |
| `{ check: () => ... }`      | the function returns true                    |

`start` throws with the program's output when the program exits first, or when `readyTimeoutMs` (10
s by default) passes. In both cases the program is gone when the error reaches the test.

The handle holds `pid`, `port`, `url`, `readyLine` (the line that `ready.stdout` matched),
`write(text)` for stdin, and `output()`. `waitForLine(pattern)` resolves with the next matching
stdout line after the last line that it or `ready.stdout` matched, so two calls in a row read two
lines.

`stop(signal)` signals the whole group, waits for the program to exit and the group to empty, and
sends SIGKILL to what is left after 5 s. It returns the exit code. Disposing the handle with
`await using` stops a running program with SIGKILL, so a child that the program forked never
outlives the test.

## Exit codes

When a signal killed the program, its exit code is 128 plus the signal number: 143 for SIGTERM and
137 for SIGKILL.
