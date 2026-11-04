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

- `rig unit` runs the unit tests in random order with the host's worker count.
- `rig related <paths...>` runs the unit tests beside the changed files, for a pre-push hook.
- `rig <lane>` runs one lane: `e2e`, `browser`, `docker`, `host`, `agent-sdk`, `model-api`, or a
  lane the repo declares.
- `rig bench [name]` and `rig eval [name]` run the benchmarks and the evaluation suites, or the one
  named `name`.
- `rig init` writes the `test`, `test:related`, `test:<lane>`, `bench` and `eval` scripts the repo
  has files for, and a starter config.

`rig unit` and the lane commands pass every argument after the command on to `bun test`, so
`bun run test --seed=1` replays a run's order, and rig drops one `--` among them. The exceptions are
`--timeout` and `--isolate`. The lane's limit in `rig.config.ts` is its one per-test timeout, and
every lane runs its files in random order with `--no-isolate`, so rig exits 2 on a `--timeout`,
`--timeout=<ms>` or `--isolate` argument and runs nothing. `rig related` takes changed file paths
only, and exits 2 on an option.

An `e2e/` folder is the e2e lane's in a folder that holds a `package.json`, and at the repo root
only when the root `package.json` has no `workspaces` field.

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

A repo declares the programs its `e2e/` folders and benchmarks run in `programs`, which `rig e2e`
and `rig bench` build first; `resolveProgram` gives each one's command. `rig bench` and `rig eval`
run the benchmarks and evaluation suites. [Programs in e2e tests](../../docs/guides/e2e-programs.md)
and [benchmarks and evaluations](../../docs/guides/benchmarks-and-evals.md) describe each.

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
