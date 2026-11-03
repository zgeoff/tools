# Programs in e2e tests

An e2e test runs the program it checks. [`@zgeoff/rig`](../../packages/rig/README.md) builds each
program that `rig.config.ts` declares and finds it again from the test.

## Declare a program

Every package with an `e2e/` folder needs a program:

```ts
export default defineRig({
  programs: {
    'kettle-cli': {
      package: 'packages/kettle',
      source: 'src/cli.ts',
      build: 'bun build src/cli.ts --outfile dist/cli.js',
      artifact: 'dist/cli.js',
    },
  },
});
```

- `package` is the package folder, relative to the repo root.
- `source` is the entry file, relative to the package.
- `build` is a shell command that rig runs from the package folder.
- `artifact` is the built file, relative to the package.

A program name is lowercase letters, digits and dashes, starting with a letter. Before the e2e
lane's tests run, `rig e2e` runs each program's `build` once. A failed build fails the lane and
prints the program's name and the build's output. The tests' environment then holds
`RIG_PROGRAM_<NAME>`, the name in upper case with dashes as underscores, set to the absolute path of
the artifact. `rig e2e` exits 2 when an `e2e/` folder sits in a package that no program names.

## Run a program in a test

`@zgeoff/rig/e2e` runs a declared program from an e2e test:

```ts
import { runProgram, startProgram } from '@zgeoff/rig/e2e';

const result = await runProgram('kettle-cli', { args: ['boil', '--cups=2'] });

await using server = await startProgram('kettle-server', { ready: { url: '/health' } });
const response = await fetch(`${server.url}/health`);
```

Both find the program through `RIG_PROGRAM_<NAME>`, which `rig e2e` sets. A program run to the end
returns its exit code, stdout and stderr:

- `runProgram(name, { args?, env?, cwd? })` resolves to `{ exitCode, stdout, stderr }`.
- `startProgram(name, { args?, env?, ready? })` passes a free port as `PORT`, waits for `ready`, and
  resolves to a handle with `url`, `port`, `stop(signal?)`, `output()` and `Symbol.asyncDispose`.
  `ready.url` is polled, resolved against the handle's `url`, until it answers 2xx. `ready.stdout`
  waits for a matching output line. Either throws with the program's output when the program exits
  first or the wait passes 10 s. `stop` sends `SIGTERM` by default and returns the exit code, which
  is 128 plus the signal number when the signal killed the program. Disposing a handle stops it with
  `SIGKILL`.

With `RIG_PROGRAM_<NAME>` unset, a run with `CI` set to a non-empty value throws, because CI must
run the built artifact. A run without `CI` runs `bun <package>/<source>` from the repo root, so a
test runs under `bun test` with no build.
