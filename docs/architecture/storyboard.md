# storyboard

`@zgeoff/storyboard` builds the animated SVG at the top of a README from one JSX scene, and checks
it. A repo writes each scene in `scripts/storyboard/<scene>/`, and `storyboard build` writes a dark
and a light file from it. The files animate with SMIL, the animation elements built into SVG,
because GitHub shows a README image through `<img>`, which runs no script and no external
stylesheet. Whoever writes a scene never writes a time: the package works out when each change
happens from the order of the changes and the number of words each one puts on screen. The
[package README](../../packages/storyboard/README.md) shows how to start a scene.

## Terms

- A **scene** is one image: a loop of **stages** of equal length, each with a caption. The scene
  sets the stage length.
- The **reset** is the last second of the loop, where every animation returns to its first frame.
- A **change** is one child of a stage: one moment where something happens, such as a terminal line
  appearing. A change lands at one time.
- A **part** is a piece of a change, such as a line, a flight or a status. Each part has a count of
  the words it shows, and a **lead**, the time it needs before its change lands, such as a flight's
  travel. A change's lead is the largest lead of its parts.
- A **mark** is a named moment a fixed time after a change, such as each stop of a pulse.
- A **reading** is the time a viewer needs to read what a change shows.
- A **host** is an element that parts draw into, such as a terminal window.
- A **span** is one part's animation of one attribute, from its start to its end.
- A **token** is a named colour with a dark and a light value. The scene's colours live only in its
  `tokens.ts`.
- `Beat` groups a change's parts without adding a caption. `Ambient` is a loop that runs on its own
  period, such as a twinkle, apart from the stages.

The step, the half-second grid that every time sits on, and the fade are in
[`animation/constants.ts`](../../packages/storyboard/src/animation/constants.ts).

## From scene to files

A build reads the tree in three passes. First it collects the changes and their parts' words and
leads. Then it places each change in time. Last it resolves the tree, and each part draws its
animation at the time it was given. A scene's own components run once, before any time exists, so
they never read a time.

The package renders the tree once and serializes it twice, with each token's dark and then its light
value, so the two files differ only in their colours. It writes nothing until every scene renders,
and a second build writes the same bytes, because nothing in a build reads a clock or a random
number. A committed file that differs from a fresh build counts as stale, and the unit suite in
[The checks](#the-checks) fails on it.

## Placing changes

Each change lands on a multiple of the step, inside its stage's action window. The window starts one
step after the stage starts and ends one step before the next stage, or at the reset in the last
stage, so a caption swap never shares a moment with a change. A change lands on the first step at or
after the latest of these:

- the start of the window;
- the end of every reading so far in its stage;
- the previous change's time plus this change's lead;
- one step after the previous change's last mark;
- when the change has an `after` prop, the time of the earlier change it gives, plus the number of
  steps it gives.

A reading lasts half a step for each word the change shows, plus one step. Readings keep a running
maximum, so a short change after a long one still waits for the long one to be read. When a change
cannot fit its window, the build fails and reports the smallest stage length that would fit. A part
with an `at` prop does not make a change of its own: it lands at the change or the mark that `at`
gives, and its words count toward that change.

The SVG file stores each time as a fraction of the loop, to 4 decimal places. When the rounding
would reorder two times on one animation, the build fails rather than write an animation that runs
backwards.

## The veil

One host acts at a time: from the first change that draws into that host alone, or that a `Beat`
focuses on it, until another host acts. The package dims every other host with a veil over it. It
lifts a host's veil one fade before the host acts, so the eye moves before the text arrives. The
last host's turn ends at the reset, and the first host to act is lit from the start of the loop, so
the loop's last frame matches its first.

## Animations

The build merges every span on one attribute of one element into one `<animate>` that repeats with
the loop. Between spans the attribute holds the value it last reached. When that value differs from
the attribute's value at the start of the loop, the attribute fades back to it during the reset, so
the loop joins without a jump. Two spans that overlap on one attribute fail the build. A span with a
transform or a motion path gets its own wrapping group, so two transforms never replace each other.
The package marks each `Ambient` loop with `data-ambient`.

## The checks

The package's checks are test suites that a repo runs in its own `test` and `test:browser` scripts,
so a repo with a scene adds no CI job. The shared `bun-checks` workflow, in
[`.github/workflows/`](../../.github/workflows/bun-checks.yml), runs both scripts when a repo
defines them.

- **The unit suite** (`@zgeoff/storyboard/checks`) fails a file that holds an element or an
  attribute outside the SMIL allow-list, a CSS animation or at-rule, a script, an event handler, a
  link that leaves the file, or more than 150,000 bytes, and a file that is stale. It also fails a
  hex colour anywhere in the scene's code outside `tokens.ts`, so every colour has a dark and a
  light value.
- **The browser suite** (`@zgeoff/storyboard/browser`) pauses each file every quarter second of its
  loop in Chrome. It fails when two texts overlap, when a text leaves the view box, and when the
  loop's last frame differs from its first. That last check removes every ambient element from both
  frames first, so an ambient period need not divide the loop.

The browser suite drives Chrome through the browser lane of [`@zgeoff/rig`](./rig.md). Only that
suite imports rig, so rig is an optional peer dependency of the package.

## Exports and setup

The package ships its TypeScript source. `./checks` and `./browser` export only under the `bun`
condition, so only Bun can import them, which is where `bun test` runs them.
`storyboard new <scene>` writes a scene and, when the repo has no scene yet, the two suites and the
`storyboard` script.
