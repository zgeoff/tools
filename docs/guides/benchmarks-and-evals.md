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
A `src/<module>.bench.ts` benchmark beside its module is a module benchmark, which `rig bench`
leaves alone.

## Evaluations

An evaluation suite is a `run-<name>-eval.ts` script in `evals/<name>/`. `rig eval` runs each
tracked `**/evals/<name>/run-<name>-eval.ts` with `bun`, from the repo root, one after another, and
exits non-zero when any run fails. `rig eval <name>` runs one.
