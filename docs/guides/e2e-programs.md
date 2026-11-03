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

rig owns only which command runs. `resolveProgram(name)` from `@zgeoff/rig/e2e` resolves to
`{ command, cwd }`: the command that runs the program, and the repo root to run it from.
[`@zgeoff/testing`](./testing-package.md) runs that command, with the test's own arguments after it:

```ts
import { resolveProgram } from '@zgeoff/rig/e2e';
import { run, start } from '@zgeoff/testing/process';

const kettle = await resolveProgram('kettle-cli');

const { exitCode } = await run(kettle.command, { args: ['boil', '--cups=2'], cwd: kettle.cwd });

await using server = await start(kettle.command, {
  args: ['serve'],
  cwd: kettle.cwd,
  ready: { url: '/health' },
});
```

- When `RIG_PROGRAM_<NAME>` is set, the command runs that artifact: with `bun` when it ends in `.js`
  or `.ts`, otherwise as an executable.
- When it's unset and `CI` is set to a non-empty value, `resolveProgram` throws, because CI must run
  the built artifact.
- When both are unset, the command runs `bun <package>/<source>`, so a test runs under `bun test`
  with no build.

`cwd` is the repo root in each case. rig finds it by walking up from the test process's working
directory to the folder that holds `rig.config.ts`, so it throws when that directory sits outside
the repo. Add `@zgeoff/testing` to the package's dev dependencies, rather than a helper of its own
that runs the command to its exit or waits for it to be ready.
