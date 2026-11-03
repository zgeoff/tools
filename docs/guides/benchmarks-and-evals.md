# Benchmarks and evaluations

`rig bench` and `rig eval` run the benchmarks and evaluation suites of a repo.

## Benchmarks

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

`budget` is a duration string written like a lane `limit`. `rig bench` imports each tracked
`**/bench/*.bench.ts` file in a folder that holds a `package.json`, or at the root of a
single-package repo. It calls `setup` once, runs `run` 5 times to warm up, then 20 times measured,
prints the median and the budget, and fails when the median is over the budget. `rig bench <name>`
runs the benchmark file with that name, such as `boil` for `bench/boil.bench.ts`. A benchmark that
needs a running system sets `bench: { lane: 'kiln' }` in `rig.config.ts`: `rig bench` then runs that
lane's `start` hook first, hands its environment to the benchmarks, and runs its `stop` hook after.

Before the benchmarks run, `rig bench` builds each program in `programs` in `rig.config.ts` once, as
`rig e2e` does, and sets `RIG_PROGRAM_<NAME>` to each artifact path. A failed build fails the run,
with the program's name, and runs no benchmark. So a benchmark of a running program can start it
with `startProgram` from `@zgeoff/rig/e2e`, and gets the built artifact in CI too.

After the measured runs, `rig bench` disposes of the `setup` result: when the result has a
`Symbol.asyncDispose` method, `rig bench` calls it, even when a run throws. A `setup` that returns
the handle from `startProgram` stops the program this way:

```ts
import { defineBench } from '@zgeoff/rig/bench';
import { startProgram } from '@zgeoff/rig/e2e';

export default defineBench({
  name: 'health check',
  budget: '20ms',
  setup: () => startProgram('kettle-server', { ready: { url: '/health' } }),
  run: async (kettle) => {
    await fetch(`${kettle.url}/health`);
  },
});
```

A `src/<module>.bench.ts` benchmark beside its module is a module benchmark, which `rig bench`
leaves alone.

## Evaluations

An evaluation suite is a `run-<name>-eval.ts` script in `evals/<name>/`. `rig eval` runs each
tracked `**/evals/<name>/run-<name>-eval.ts` with `bun`, from the repo root, one after another, and
exits non-zero when any run fails. `rig eval <name>` runs one.
