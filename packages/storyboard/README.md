<div align="center">
  <h1>@zgeoff/storyboard</h1>

  <p>
    <a href="https://www.npmjs.com/package/@zgeoff/storyboard"><img src="https://img.shields.io/npm/v/@zgeoff/storyboard" alt="npm version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
  </p>

  <p>
    <a href="../../docs/README.md">Documentation</a> •
    <a href="../../docs/design/storyboard/authoring.md">Authoring a scene</a> •
    <a href="../../docs/design/storyboard/build-and-check.md">Build and check</a>
  </p>
</div>

Build the animated SVG at the top of a README from one JSX scene, and check it.

You write a scene as JSX: terminals, lines, statuses and flights, grouped into stages.
`storyboard build` places each change on a half-second grid, checks the timing rules, and writes a
dark and a light SVG from one render. The files use SMIL, so they animate where a README shows them,
with no script.

## Install

```sh
bun add -d @zgeoff/storyboard @zgeoff/rig
bunx storyboard new hero
bun run storyboard
```

`storyboard new <scene>` writes the scene under `scripts/storyboard/<scene>/`, and on a repo's first
scene it also writes the two check suites and a `storyboard` script. `@zgeoff/rig` is an optional
peer dependency that only the browser suite imports.

## Features

- A JSX runtime (`@zgeoff/storyboard/jsx-runtime`) that builds a tree, so a scene needs no React.
- A two-pass timeline that fails the build, naming the change, when a timing rule breaks.
  [Authoring a scene](../../docs/design/storyboard/authoring.md) lists the rules.
- Terminals, lines, typed prompts, statuses, alerts, flights, pulses, cursors and stamps, and
  `defineHost` and `defineEffect` for parts of your own.
- Output that is byte-stable: a second build writes the same bytes, and nothing is written when a
  scene fails.
- `@zgeoff/storyboard/checks`: a unit suite that checks each committed file against an allow-list,
  its size, and whether it is stale.
- `@zgeoff/storyboard/browser`: a browser suite that steps each file through its frames in Chrome
  and fails on overlapping text, text outside the view box, and a loop whose last frame differs from
  its first. [Build and check](../../docs/design/storyboard/build-and-check.md) describes both
  suites.

## Documentation

The [docs index](../../docs/README.md) links the design.
