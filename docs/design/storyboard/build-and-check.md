# Building and checking scenes

- **Status:** draft

The [README's words](./README.md#words) define scene, lane, hard cut, ambient loop and the other
terms this doc uses. A developer in a repo whose README shows a scene runs `storyboard build` to
write the scene's dark and light SVG files, and commits them. Two test suites in that repo check the
files: a unit suite that reads their source text, and a browser suite that renders their frames.
[authoring.md](./authoring.md) holds the contracts of the files a scene author writes.

## Commands

```bash
storyboard build         # renders every scene in scripts/storyboard/ and writes its two files
storyboard new <scene>   # writes tokens.ts, kit.ts and scene.tsx in scripts/storyboard/<scene>/
```

`storyboard build` runs from any folder in the repo. It takes the git root as the repo root, and
each subfolder of `scripts/storyboard/` that holds a `scene.tsx` as a scene. Each scene's
`defineScene` call gives an `out` path, relative to the repo root, that the build adds `-dark.svg`
and `-light.svg` to: `docs/assets/hero` writes `docs/assets/hero-dark.svg` and
`docs/assets/hero-light.svg`.

On a repo's first scene, `storyboard new` also writes the two suites that [The suites](#the-suites)
shows and adds `"storyboard": "storyboard build"` to the root `package.json`. It installs nothing
and edits no other file. It prints the steps that remain:

1. Run `bun add -d @zgeoff/storyboard @zgeoff/rig`.
2. When the root `package.json` has no `test:browser` script, stage the new files with `git add`,
   then run `bunx rig init`. rig adds the browser lane only for a `.browser.test.ts` file that git
   tracks.
3. When the repo's tsconfig has no `jsx` option, add `"jsx": "react-jsx"` to it, so the type check
   reads the JSX.

## The suites

```ts
// scripts/storyboard/storyboard.test.ts
import { describeSceneChecks } from '@zgeoff/storyboard/checks';
describeSceneChecks(import.meta.dir); // one test per scene per rule
```

```ts
// scripts/storyboard/storyboard.browser.test.ts
import { describeFrameChecks } from '@zgeoff/storyboard/browser';
describeFrameChecks(import.meta.dir); // one test per scene and file, inside the lane's 10 s limit
```

Each suite finds every scene folder under the folder it is given, so a new scene needs no edit to
either one. A developer runs them with `bun run test` and `bun run test:browser`. In CI, the shared
bun-checks workflow runs both, because it runs a repo's `test` and `test:browser` scripts whenever
the repo defines them. A repo with a CI workflow of its own, such as atc, adds a step that runs
`bun run test:browser`.

## Output rules

- A build of an unchanged scene writes the same bytes. A render never reads a clock or a random
  number, so a scene author writes the positions of scattered parts, such as stars, as data.
- `storyboard build` renders every scene in memory, and writes nothing when any scene fails. It
  names the failed scene in its error.
- The package renders the scene's JSX tree once, then writes it twice, with the dark and then the
  light value of each token. The two files differ only where a token has a `{ dark, light }` pair.
- Times appear in a file only as SMIL attribute values. The package writes each time in `keyTimes`
  as a fraction of the loop, with 4 decimals, and every animation on the loop, other than an ambient
  loop, has a `dur` equal to the loop and repeats forever. The build fails when rounding puts two
  `keyTimes` out of order.

## The unit suite

The unit suite reads each scene's two SVG files and its source folder. It fails the scene when:

- an SVG file uses an element or an attribute outside the allow-list;
- a `<style>` holds an `@` rule, a `url()`, or an `animation` or `transition` property;
- an `href` or a `url()` points anywhere but an `#id` in the same file, or the file holds a
  `<script>` or an `on…` attribute;
- an SVG file is over 150,000 bytes;
- a source file in the scene's folder, other than `tokens.ts`, holds a hex colour;
- a committed SVG file differs from what `storyboard build` would write.

The allow-list holds these elements: `svg`, `g`, `defs`, `style`, `rect`, `circle`, `ellipse`,
`line`, `polyline`, `polygon`, `path`, `text`, `tspan`, `linearGradient`, `radialGradient`, `stop`,
`filter`, `feGaussianBlur`, `feMerge`, `feMergeNode`, `clipPath`, `animate`, `animateTransform` and
`animateMotion`. Its attributes are the ones that atc's committed hero files use on those elements,
plus `role`, `aria-label` and `data-ambient`.

## The browser suite

The browser suite loads each SVG file into a page in the browser lane's Chrome, pauses its
animations with `pauseAnimations()`, and moves it with `setCurrentTime()` to each multiple of 0.25
s, from 0 s and stopping before the loop's end: 144 frames for a 36 s loop. It fails the scene when:

- at one frame, two visible text boxes overlap by more than 1 square pixel;
- at one frame, a visible text box reaches outside the file's view box;
- the frame at one hard cut, 0.03 s, before the loop's end differs from the frame at 0 s. The suite
  renders this one extra frame for the check.

For the last check, the suite first removes every element marked `data-ambient`, because an ambient
loop's period need not divide the loop. The suite reads the text boxes of every frame in one call
into the page, so a test stays inside the lane's limit. It takes the two frames for the last check
with `Bun.WebView`'s `screenshot()`, and they match when at most 0.5% of their pixels differ by more
than 10% in any colour channel.

The suite takes a text's box from `getBoundingClientRect()` on its `<text>` element, which gives the
box after the element's transforms. A text is visible when its own opacity, multiplied by the
opacity of every ancestor, is over 0.01, and some of its box lies inside its clip paths.

## Builder decides

- How the browser suite loads a file and reads its text boxes, through rig's `runInPage`.
- The test fixtures, which are invented scenes.

## Open questions

- **Is 0.5% of pixels at 10% the right rule for two matching frames?** A measurement settles it.
  When atc moves its hero onto the package, a one-off run compares each frame of the new files with
  atc's committed hero files, and the developer who runs it sets the two numbers from what it finds.
  The browser suite uses 0.5% at 10% for its last-frame check meanwhile.
