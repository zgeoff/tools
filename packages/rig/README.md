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
- `rig init` writes the `test`, `test:related` and `test:<lane>` scripts and a starter config.

`rig unit` and the lane commands pass every argument after the command on to `bun test`, so
`bun run test --seed=1` replays a run's order, and rig drops one `--` among them. `rig related`
takes changed file paths only, and exits 2 on an option.

Among those arguments, a path keeps only the lane's own files that it selects: a file, the files
under a folder, or, for a bare word, the files whose path holds it. rig resolves a path, with its
`.` and `..` segments, against the repo root, and a path outside the repo selects nothing. When the
paths select no file of the lane, as `rig unit ./src/oven.host.test.ts` does, rig names them and
exits 1. An option takes its value after `=`, as in `--timeout=9000`, because rig reads every
argument that does not start with `-` as a path. So `--timeout 9000` makes `9000` a path, which
selects no file and fails the run.

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
