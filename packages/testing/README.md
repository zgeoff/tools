<div align="center">
  <h1>@zgeoff/testing</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/testing"><img src="https://img.shields.io/npm/v/@zgeoff/testing" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/guides/testing-package.md">Testing programs</a>
  </p>
</div>

Drive a real program from a Bun test: type into it in a terminal, or run it as a process and wait
for it to be ready.

A test passes the program's command, a `readonly string[]`, and gets back a handle that cleans up
after the test. The package knows nothing about how the command was found. In a repo that uses
[`@zgeoff/rig`](../rig/README.md), `resolveProgram` from `@zgeoff/rig/e2e` supplies it.

## Install

```sh
bun add -d @zgeoff/testing
```

The package runs under Bun and needs `bun:test`.

## Use

An interactive program runs in a pseudo-terminal. `screen` reads what a person would see, and `user`
types:

```ts
import { spawnCLI } from '@zgeoff/testing/cli';

const cli = await spawnCLI(['bun', 'src/cli.ts', 'init']);

await cli.screen.findByText('Project name?');
await cli.user.type('ledger');
await cli.user.pressEnter();

expect(await cli.result).toBe(0);
```

A server or a program with no terminal runs as a process in its own process group:

```ts
import { run, start } from '@zgeoff/testing/process';

const { exitCode, stdout } = await run(command, { args: ['--version'] });

await using ledger = await start(command, { ready: { url: '/health' } });

await fetch(`${ledger.url}/entries`);
```

Small helpers for any Bun test live in `@zgeoff/testing/helpers`. `waitFor` retries a check until it
stops throwing, and `updateEnv` overrides an environment variable that a hook restores:

```ts
import { updateEnv, waitFor } from '@zgeoff/testing/helpers';

updateEnv('LEDGER_REGION', 'north');

await waitFor(() => expect(readEntries()).toHaveLength(2), { label: 'two entries' });
```

Call `removeEnvOverrides` in an `afterEach` hook of the test preload, so no override outlives its
test:

```ts
import { afterEach } from 'bun:test';
import { removeEnvOverrides } from '@zgeoff/testing/helpers';

afterEach(removeEnvOverrides);
```

## Features

- `spawnCLI` runs a program in a pseudo-terminal, with `screen` queries, `user` keystrokes, `resize`
  and OSC 8 links.
- `run` runs a program to its exit, with `input` on stdin and a time limit.
- `start` picks a free port, waits until the program is ready, and stops the whole process group.
- Each handle kills its program when the test ends.
- `@zgeoff/testing/helpers` holds the stubs, git fixtures, run-folder names, `waitFor` and the env
  helpers that tests in several repos share.
- An exit code is 128 plus the signal number when a signal killed the program.

## Documentation

See [Testing programs](../../docs/guides/testing-package.md), and the
[docs index](../../docs/README.md).
