# Benchmarks and evaluations

`rig bench` and `rig eval` run the benchmarks and evaluation suites of a repo.

## Benchmarks

A benchmark is a `<name>.bench.ts` file whose default export is a `defineBench` result. A benchmark
of one module sits beside it under the package's `src/`, and a benchmark of a running program sits
in the package's `bench/` folder:

```ts
import { defineBench } from '@zgeoff/rig/bench';

export default defineBench({
  name: 'boil one cup',
  budget: '50ms',
  setup: async () => buildKettle(),
  run: async (kettle) => kettle.boil(1),
});
```

`budget` is a duration string written like a lane `limit`. `rig bench` imports each tracked
`bench/*.bench.ts` and `src/**/*.bench.ts` file of a folder that holds a `package.json`, or of the
root of a single-package repo. It calls `setup` once, runs `run` 5 times to warm up, then 20 times
measured, prints the median, the spread and the budget, and fails when the median is over the
budget. The spread is the interquartile range of the measured times. `rig bench <name>` runs the
benchmark file with that name, such as `boil` for `bench/boil.bench.ts` or `src/boil.bench.ts`. A
benchmark that needs a running system sets `bench: { lane: 'kiln' }` in `rig.config.ts`: `rig bench`
then runs that lane's `start` hook first, hands its environment to the benchmarks, and runs its
`stop` hook after.

Before the benchmarks run, `rig bench` builds each program in `programs` in `rig.config.ts` once, as
`rig e2e` does, and sets `RIG_PROGRAM_<NAME>` to each artifact path. A failed build fails the run,
with the program's name, and runs no benchmark. So a benchmark of a running program can spawn the
command that `resolveProgram` from `@zgeoff/rig/e2e` gives, and gets the built artifact in CI too.

After the measured runs, `rig bench` disposes of the `setup` result: when the result has a
`Symbol.asyncDispose` method, `rig bench` calls it, even when a run throws. A `setup` that returns a
handle to the program it started stops the program this way. Here `startKettleServer` is a helper in
the package's `src/test-utils/` that spawns the `resolveProgram` command and returns that handle:

```ts
import { defineBench } from '@zgeoff/rig/bench';
import { startKettleServer } from '../src/test-utils/start-kettle-server.ts';

export default defineBench({
  name: 'health check',
  budget: '20ms',
  setup: () => startKettleServer(),
  run: async (kettle) => {
    await fetch(`${kettle.url}/health`);
  },
});
```

### Concurrency

`concurrency` lists the numbers of `run` calls to keep in flight at once. `rig bench` measures each
level in turn, with the one `setup` result, and prints a line for each:

```ts
export default defineBench({
  name: 'pour one cup',
  budget: '80ms',
  concurrency: [1, 4, 16],
  setup: async () => buildKettle(),
  run: async (kettle) => kettle.pour(1),
});
```

At level N, each round starts N calls together, 5 rounds warm up and 20 are measured. The median and
the spread cover the time of each call, so level 4 has 80 measured times. The budget holds at every
level. A benchmark without `concurrency` runs at level 1 only.

### Compare against a base

`rig bench --base <ref>` runs the benchmarks on `<ref>` and on the working tree, and prints a table
with the median and spread of each benchmark and level on both, and the change of the median:

```text
bench         concurrency  base median  base spread  head median  head spread  change
pour one cup  1            12.10ms      0.80ms       11.50ms      0.70ms       -5.0%
pour one cup  4            30.40ms      2.10ms       33.20ms      2.40ms       +9.2%
```

`rig bench` checks `<ref>` out in a git worktree under the repo's git folder, runs
`bun install --frozen-lockfile` there. From the checkout's copy of the folder you run `rig` in, it
then builds the programs and runs the bench lane hooks with that copy's `rig.config.ts`. So a lane
that starts a server starts one from each side. The worktree is removed when the run ends. When git
can't remove it, `rig bench` keeps it, prints the `git worktree remove --force` command to run, and
exits 1. The budget holds on the head only, and a benchmark that exists on one side only shows `-`
on the other. `rig bench --base <ref> <name>` compares one benchmark file.

## Evaluations

An evaluation suite is a `run-<name>-eval.ts` script in `evals/<name>/`. `rig eval` runs each
tracked `**/evals/<name>/run-<name>-eval.ts` with `bun`, from the repo root, one after another, and
exits non-zero when any run fails. `rig eval <name>` runs one.
