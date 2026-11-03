<div align="center">
  <h1>@zgeoff/rig</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/rig"><img src="https://img.shields.io/npm/v/@zgeoff/rig" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/architecture/rig.md">How rig works</a> •
    <a href="../../docs/guides/browser-lane.md">Browser lane</a>
  </p>
</div>

Run every test lane of a Bun repo from one declaration of its limits, with a browser lane built in.

A repo's tests split into lanes: the unit run, `e2e/` folders, and suites that need a real system,
such as a browser or a container. `rig` runs each lane with its own timeout, worker count and memory
cap, and the unit run leaves every lane out, so a lane never runs by mistake. The same declaration
sets the limits that the `@zgeoff/oxlint-config` rules check. To start, run `rig init`, then
`rig unit`.

## Install

```sh
bun add -d @zgeoff/rig
bunx rig init
```

`rig` runs under Bun. It runs each command under [`@zgeoff/diet`](../diet/README.md), a dependency,
so a run that outgrows its memory budget fails alone when `diet` finds a
[cap mode](../../docs/architecture/memory-caps.md#the-modes) that the host supports. With
`DIET_MODE=none`, or on a host with no supported mode, the command runs uncapped.

## Commands

- `rig unit` runs the unit tests in random order with the host's worker count, with `--no-isolate`
  so the files of a worker share one module graph. Pass `--isolate` to turn that off.
- `rig related <paths...>` runs the unit tests beside the changed files, for a pre-push hook.
- `rig <lane>` runs one lane: `e2e`, `browser`, `docker`, `host`, `agent-sdk`, `model-api`, or a
  lane the repo declares.
- `rig bench [name]` runs the benchmarks in the `bench/` folders, or the one named `name`.
- `rig eval [name]` runs the evaluation suites in the `evals/` folders, or the one named `name`.
- `rig init` writes the `test`, `test:related` and `test:<lane>` scripts, the `bench` and `eval`
  scripts for a repo with `bench/` or `evals/` folders, and a starter config.

`rig unit` and the lane commands pass every argument after the command on to `bun test`, so
`bun run test --seed=1` replays a run's order, and rig drops one `--` among them. The exception is
`--timeout`: the lane's limit in `rig.config.ts` is its one per-test timeout, so rig exits 2 on a
`--timeout` or `--timeout=<ms>` argument and runs nothing. `rig related` takes changed file paths
only, and exits 2 on an option.

An `e2e/` folder counts as the e2e lane's when it sits in a folder that holds a `package.json`, and
at the repo root only when the root `package.json` has no `workspaces` field. A folder named `*-e2e`
no longer counts.

Among those arguments, a path keeps only the lane's own files that it selects: a file, the files
under a folder, or, for a bare word, the files whose path holds it. rig resolves a path, with its
`.` and `..` segments, against the repo root, and a path outside the repo selects nothing. When the
paths select no file of the lane, as `rig unit ./src/oven.host.test.ts` does, rig names them and
exits 1. An option takes its value after `=`, as in `--rerun-each=2`, because rig reads every
argument that does not start with `-` as a path. So `--rerun-each 2` makes `2` a path, which selects
no file and fails the run.

## Configuration

`rig.config.ts` at the repo root declares what differs from the built-in lanes:

```ts
import { defineRig } from '@zgeoff/rig';

export default defineRig({
  lanes: { kiln: { suffix: '.kiln', limit: '15s', start: './test-utils/start-kiln.ts' } },
});
```

Oxlint's plugin reads this file under Node 22.18 or later, or under Bun, because it imports the
config to take the limits from it.

### Programs

An e2e test runs the program it checks, so `rig.config.ts` declares each program that an `e2e/`
folder runs, and every package with an `e2e/` folder needs one:

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

### Running a program in a test

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

## Benchmarks and evaluations

A benchmark is a `bench/<name>.bench.ts` file in a package whose default export is a `defineBench`
result:

```ts
import { defineBench } from '@zgeoff/rig/bench';

export default defineBench({
  name: 'boil one cup',
  budget: '50ms',
  setup: async () => buildKettle(),
  run: async (kettle) => kettle.boil(1),
});
```

`budget` is a duration such as `'50ms'` or `'2s'`. `rig bench` imports each tracked
`**/bench/*.bench.ts` file in a folder that holds a `package.json`, or at the root of a
single-package repo. It calls `setup` once, runs `run` 5 times to warm up, then 20 times measured,
prints the median and the budget, and fails when the median is over the budget. `rig bench <name>`
runs the benchmark file with that name, such as `boil` for `bench/boil.bench.ts`. A benchmark that
needs a running system sets `bench: { lane: 'kiln' }` in `rig.config.ts`: `rig bench` then runs that
lane's `start` hook first, hands its environment to the benchmarks, and runs its `stop` hook after.
A `src/<module>.bench.ts` benchmark beside its module is a module benchmark, which `rig bench`
leaves alone.

An evaluation suite is a `run-<name>-eval.ts` script in `evals/<name>/`. `rig eval` runs each
tracked `**/evals/<name>/run-<name>-eval.ts` with `bun`, from the repo root, one after another, and
exits non-zero when any run fails. `rig eval <name>` runs one.

## Testing in a page

A `.browser.test.ts` suite runs in Chrome through `Bun.WebView`. `runInPage` runs a real function in
the page and parses its result with a schema:

```ts
import { runInPage } from '@zgeoff/rig';
import { z } from 'zod';

const title = await runInPage(view, () => document.title, undefined, z.string());
```

## Documentation

[How rig works](../../docs/architecture/rig.md) describes the lane table, a lane's run, the browser
lane and the limits mechanism.
