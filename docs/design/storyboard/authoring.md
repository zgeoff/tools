# Writing a scene

- **Status:** draft

The [README's words](./README.md#words) define scene, stage, part, change, grid, reading time, host,
token and kit, and its Shape section says what a drawing is. The card is the image's rectangle,
below its caption band. This doc calls `storyboard build`, and the package code it runs, the build.
A scene author writes the files of one scene folder: `tokens.ts`, `kit.ts`, `scene.tsx`, and a
`.tsx` file for each drawing that the scene makes for itself. This doc holds each file's contract
and the timing rules that the build enforces. The examples come from the hero scene of the
[atc](https://github.com/zgeoff/atc) repo. [build-and-check.md](./build-and-check.md) holds what
`storyboard build` writes from these files.

## Tokens

`storyboard build` writes two SVG files for each scene, a dark one and a light one. Each token is
one named colour, with one value for both files or a value for each.

```ts
// scripts/storyboard/hero/tokens.ts in atc
export default defineTokens({
  slateTop: '#46548a', // one colour, written in both files
  claudeFace: '#4cc9a2',
  teal: { dark: '#2bb59a', light: '#1a8a74' }, // a pair, which replaces the package's default teal
});
```

```ts
// storyboard module
type TokenValue = string | { dark: string; light: string }; // each string is a 6-digit hex colour
type BaseTokenName =
  | 'captionText' // the caption band's sentence
  | 'captionLit' // the dot of the current stage
  | 'captionAhead' // the dot of a stage still to come
  | 'terminalFill'
  | 'terminalStroke'
  | 'text'
  | 'dimText'
  | 'veil'
  | 'teal'
  | 'amber'
  | 'blue'
  | 'violet'
  | 'green';
interface Tokens<K extends string> {
  values: Record<K | BaseTokenName, TokenValue>; // the base tokens, with the scene's added or overriding
}
```

The package defines the base tokens, which its own components draw with, and holds their default
values in its source, copied from atc's hero files. `captionText`, `captionLit` and `captionAhead`
are pairs, with one value for the dark file and one for the light file. Every other base token is
one colour. A scene's tokens are visible only to that scene.

## The kit

A scene's `kit.ts` builds the kit once from the scene's tokens, and each drawing imports its
components from there. Every `tone` prop and every `getColor` call takes a name from those tokens.

```ts
// scripts/storyboard/hero/kit.ts in atc
import tokens from './tokens.ts';
export const {
  Stage,
  Beat,
  buildTerminal,
  Line,
  Type,
  Status,
  Alert,
  Flight,
  Pulse,
  Cursor,
  Stamp,
  Def,
  Animate,
  Ambient,
  getColor,
  getID,
  getURL,
  defineHost,
  defineEffect,
} = buildSceneKit(tokens);
```

## The scene

A scene's `render` returns one JSX tree. The hosts and the drawings in it place things on the card.
Its `<Stage>` elements, one for each stage of the loop and in the order they play, set what happens
when. Each direct child of a `Stage` is one change, and a `<Beat>` groups several parts into one
change. A part with `at` is the exception: it joins the change or mark it names, by the rules in
[Timing rules](#timing-rules). A drawing such as `Islands` runs once, before the build knows any
time, so it reaches a time only through the parts and the `Animate`s it returns.

```tsx
// scripts/storyboard/hero/scene.tsx in atc
/** @jsxImportSource @zgeoff/storyboard */
import { buildBowPath, defineScene } from '@zgeoff/storyboard';
import { Islands } from './islands.tsx';
import { Beat, buildTerminal, Flight, getColor, Line, Stage, Status, Type } from './kit.ts';

// A text that two terminals show is written once.
const ask = '/orders shape?';
const answer = '[{ id, total }]';

const orchestrator = buildTerminal({
  title: 'orchestrator · laptop',
  box: { x: 24, y: 400, width: 300 },
  status: 'ready',
});
const builderUI = buildTerminal({
  title: 'builder-ui · sprites',
  box: { x: 470, y: 448, width: 274 },
  opens: 'spawnLanded', // hidden until that change, then fades in
  status: { text: 'starting', tone: 'violet' },
});
const builderAPI = buildTerminal({
  title: 'builder-api · impz',
  box: { x: 724, y: 132, width: 256 },
  status: { text: 'working', tone: 'teal' },
  lines: ['› /orders API'], // shown from the first frame
});

export default defineScene({
  out: 'docs/assets/hero', // from the repo root: hero-dark.svg and hero-light.svg
  stageS: 6,
  card: { width: 1000, height: 620, cornerRadius: 12 }, // the package clips the card and puts the caption band above it
  description: 'An animated diagram of atc. You ask an orchestrator on your laptop…', // the file's aria-label
  styles: { name: { 'font-size': 12.5, 'font-weight': 700, fill: getColor('text') } }, // CSS classes for drawings
  render: () => (
    <>
      <Islands />
      {orchestrator}
      {builderUI}
      {builderAPI}

      <Stage caption="You ask your orchestrator for an orders page.">
        {/* 0.5 s. One change with two marks: typing ends 3 steps in (2 s), the prompt is sent 4
            steps in (2.5 s). Its reading, 7 words, starts with the typing and ends at 2.75 s. */}
        <Type id="prompt" on={orchestrator} typing={{ steps: 3 }} sends={{ steps: 4 }}>
          build the orders page on a sprite
        </Type>
        <Status on={orchestrator} at="prompt.sent">
          thinking
        </Status>
        {/* 3 s: one step after the sent mark, and after the prompt's reading */}
        <Beat>
          <Line on={orchestrator}>On it.</Line>
          <Status on={orchestrator} tone="teal">
            working
          </Status>
        </Beat>
      </Stage>

      <Stage caption="It spawns a builder on another machine.">
        {/* …ends with the change that has id="spawnLanded", at 8.5 s */}
      </Stage>

      <Stage caption="Agents talk to each other directly.">
        {/* 12.5 s: the start of the stage's action window */}
        <Beat>
          <Line on={builderUI} head="→ builder-api: " tone="blue">
            {ask}
          </Line>
          <Status on={builderUI} tone="blue">
            asking
          </Status>
        </Beat>
        {/* 13.5 s: the ask takes 1 s to read, and the flight's 0.75 s fits after 12.5 s */}
        <Beat id="askLanded">
          <Flight from={builderUI} to={builderAPI} tone="blue" />
          <Line on={builderAPI} head="← builder-ui: " tone="blue">
            {ask}
          </Line>
          <Status on={builderAPI}>thinking</Status>
        </Beat>
        {/* 14.5 s: builder-api reads the ask first */}
        <Line on={builderAPI} head="→ builder-ui: " tone="blue">
          {answer}
        </Line>
        {/* 15.5 s */}
        <Beat>
          <Flight from={builderAPI} to={builderUI} tone="blue" />
          <Line on={builderUI} head="← builder-api: " tone="blue">
            {answer}
          </Line>
        </Beat>
      </Stage>

      {/* …stages 4 to 6 */}
    </>
  ),
});
```

A function such as `buildTerminal` makes a host and returns a handle, and the scene puts the handle
in its tree where the host is drawn. An effect is a part that takes the timing props `id`, `after`
and `at`. An effect that writes to a host, such as `Line`, names its host with `on={handle}`; an
effect such as `Flight` draws in place. The handle's type carries the host's kind, so a `Line` sent
to a host of another kind fails the type check. TypeScript gives every JSX element one type, so only
a function call can return a typed handle.

Give a change an `id` when another part has to point at it. A reference is a string: a change's id,
a mark inside it such as `prompt.sent`, or a built-in instant. The build catches a reference that
matches nothing. The built-in instants are `start` at 0 s, `stage2` to `stageN` where each later
stage begins and its caption swaps, and `reset`, 1 s before the loop ends.

The build writes the file's one `<style>` block: the monospace font stack, the classes its
components use, and each class in `styles`. A number on a length property in `styles`, such as
`font-size`, is in pixels.

The scene draws the card's background itself. The caption band above the card has no background, so
the page that shows the image, such as atc's README, shows through it.

The build draws the caption band from the `Stage` captions: one centred sentence per stage, and a
dot per stage that is dim ahead, lit while current and half lit once done. At each stage start, the
old sentence fades out over 0.175 s, and the new one fades in from 0.14 s to 0.35 s after the stage
starts.

## Timing rules

The package fixes these values, and a scene sets only `stageS`:

| Value        | Seconds                              |
| ------------ | ------------------------------------ |
| grid step    | 0.5                                  |
| fade         | 0.35                                 |
| hard cut     | 0.03                                 |
| flight       | 0.75, ending at its change's instant |
| pulse        | 0.5, ending at its change's instant  |
| reading time | 0.25 per word, plus 0.5              |
| reset        | starts 1 before the loop ends        |

`stageS` is the length of one stage in seconds, a multiple of 0.5. A loop lasts `stageS` times the
number of stages. Each stage's action window runs from 0.5 s after the stage starts to 0.5 s before
it ends. In the last stage, it ends at the reset.

The package counts a run of characters between spaces as a word when it has a letter in it, so `→`,
`|` and `[{` count for nothing.

The build places each stage's changes in their JSX order. A change lands on the first grid step that
comes at or after each of these:

- the start of the action window;
- one step after the previous change's last instant, marks included;
- the end of every reading so far in the stage;
- the previous change's instant plus this change's lead, which is the motion that ends on it, such
  as a flight's 0.75 s;
- whole steps after the change it names in `after`: `after={{ change: 'askLanded', steps: 4 }}`
  lands at least 2 s after `askLanded`, whatever changes come between.

The parts of one change count as one reading: their words added up, plus one 0.5 s base. A `Line`
counts its text and never its `head`. A `Type` counts its text, and its reading starts when its
typing starts. A `Status` counts nothing unless it has `read`, so a status that repeats what a line
has just said adds no wait. A `Stamp` counts its word. A part with `at` joins the change or mark it
names, and its words add to that change's reading.

The build fails, naming the change, when:

- a change, its marks included, lands outside its stage's action window. The error gives the
  smallest `stageS` that would fit, in seconds;
- a reading runs past the end of its stage;
- a reference matches no change, mark or built-in instant;
- `after` names a change below this one;
- two changes share an id, or a change takes a built-in instant's name, such as `reset`;
- a change has two marks of one name;
- a part with `at` sits below a later change in the JSX. The build placed that later change without
  counting the part's words, so it would land before they are read;
- an effect sits outside every `Stage`, or a `Stage` sits inside another;
- a component breaks a rule in [The components](#the-components).

The build names a change that has no `id` by its stage, its position, its component and its text,
such as `stage 1, change 3 <Line> "On it."`.

Every time inside the package is in seconds.

## The components

The veil dims each host to 40% while it isn't acting. A host acts from a change that writes to it
until a change writes to another host. A `Beat` with `focus={handle}` picks the acting host when it
writes to several or to none.

```ts
// storyboard module. K is the scene's token names. Every effect also takes `id`, `after` and `at`,
// as TimedProps adds them.
type Reference = string; // a change id, `<id>.<mark>`, `start`, `stage<N>` or `reset`
type After = { change: Reference; steps: number }; // whole steps after that change's instant
type Steps = { steps: number };
type TimedProps<P> = P & { id?: string; after?: After; at?: Reference };
type Host<M> = StoryNode & { readonly kind: HostKind<M> }; // a handle, typed by what its host accepts

interface SceneKit<K extends string> {
  Stage(props: { caption: string; children?: StoryNode }): StoryNode;
  Beat(props: TimedProps<{ focus?: Host<unknown>; children: StoryNode }>): StoryNode;

  buildTerminal(props: {
    title: string;
    box: { x: number; y: number; width: number };
    opens?: Reference; // absent: shown from the first frame
    status?: string | { text: string; tone?: K }; // its first status; absent tone: dimText
    lines?: readonly (string | { text: string; tone?: K })[]; // shown from the first frame
  }): Host<TerminalMail>;

  // Effects that write to a terminal.
  Line(
    props: TimedProps<{ on: Host<TerminalMail>; head?: string; tone?: K; children: string }>,
  ): StoryNode; // the text in italics after a plain head; leading spaces in head indent it
  Type(
    props: TimedProps<{ on: Host<TerminalMail>; typing: Steps; sends: Steps; children: string }>,
  ): StoryNode; // marks: typed, sent
  Status(
    props: TimedProps<{ on: Host<TerminalMail>; tone?: K; read?: boolean; children: string }>,
  ): StoryNode; // runs until the next Status on that host
  Alert(props: TimedProps<{ on: Host<TerminalMail>; tone: K; until: Reference }>): StoryNode; // a flashing border

  // Effects that draw in place.
  Flight(
    props: TimedProps<
      { from: Host<unknown>; to: Host<unknown>; tone: K } | { path: string; tone: K }
    >,
  ): StoryNode; // a dot with a trail; lead 0.75 s
  Pulse(props: TimedProps<{ stops: readonly Point[]; tone: K }>): StoryNode; // straight hops at one speed; lead 0.5 s; marks: stop1 to stopN
  // The pointing hand: it glides from `from` over `glide`, reaches `target` half a fade before the
  // change, presses on it, and glides back at `leaves`. Its lead is the glide.
  Cursor(
    props: TimedProps<{ from: Point; target: Point; glide: Steps; leaves: Reference }>,
  ): StoryNode;
  Stamp(
    props: TimedProps<{ point: Point; tone: K; until: Reference; children: string }>,
  ): StoryNode; // a word in a box that slams on, such as CLEARED

  Def(props: { children: StoryNode }): StoryNode; // gathered into the file's one <defs>

  // The one way to animate on the loop. It reads a time and makes no change.
  Animate(props: {
    attribute: string;
    at: Reference;
    lead?: 'fade' | 'cut' | Steps; // the span starts this long before `at`; absent: on `at`
    span: 'fade' | 'cut' | Steps; // the span lasts a fade, a cut or whole grid steps
    keys: readonly (readonly [fraction: number, value: string | number])[]; // fractions 0 to 1 of the span
    transform?: 'translate' | 'scale' | 'rotate'; // writes <animateTransform>
    path?: string; // writes <animateMotion> along this path; keys then hold distances 0 to 1
  }): StoryNode;

  // An ambient loop. Its period need not divide the loop.
  Ambient(props: {
    attribute: string;
    periodS: number;
    values: readonly (string | number)[];
    keyFractions?: readonly number[]; // absent: evenly spaced
    ease?: 'linear' | 'smooth'; // absent: linear; smooth is an ease-in-out spline
    phaseS?: number; // starts this far into its period
    transform?: 'translate' | 'scale' | 'rotate';
  }): StoryNode;

  getColor(token: K): TokenReference; // the package writes the token's colour for each file
  getID(name: string): IDReference; // the package writes the scene's name and this name, so ids stay unique
  getURL(name: string): IDReference; // `url(#…)` of that id, for a fill, a filter or a clip path

  defineHost<P, M>(definition: HostDefinition<P, M>): (props: P) => Host<M>;
  defineEffect<P, M>(
    definition: EffectDefinition<P, M> & { host: (props: never) => Host<M> },
  ): (props: TimedProps<P & { on: Host<M> }>) => StoryNode; // writes to a host, so it takes `on`
  defineEffect<P>(definition: EffectDefinition<P, never>): (props: TimedProps<P>) => StoryNode; // draws in place
}
```

The build renders the components by these rules:

- An `Animate` or an `Ambient` animates the element it sits inside.

- A terminal grows by one row over one fade as each line enters, so its height always fits the lines
  shown. Its veil and its alert border grow with it.
- The package merges every `Animate` on one element and attribute into one SMIL element. Before the
  first span, the attribute holds the value the element sets. After each span, it holds that span's
  last value. The build fails when two spans on one attribute overlap, or when an `Ambient` and an
  `Animate` share one attribute.
- The package wraps an element in a `<g>` of its own for each `Animate` that has a `transform`, so
  two transforms never replace each other or the element's own `transform`.
- At `reset`, every animated attribute returns to its first-frame value over one fade, so the loop's
  last frame matches its first. Terminal lines, status texts and stamps fade out over that fade,
  then each terminal shrinks back to its first height over one more fade. Ambient loops keep
  running. The build fails when a span crosses the reset.
- The package marks each `Ambient` with a `data-ambient` attribute, so the
  [browser suite](./build-and-check.md#the-browser-suite) can leave ambient loops out when it
  compares the loop's last frame with its first.
- The JSX element types leave out `<animate>`, `<animateTransform>` and `<animateMotion>`, so only
  `Animate`, `Ambient` and the package's components write SMIL.
- The build fails when two `Def`s share an id and differ in content.

## A new kind of part

A scene author defines a new host with `defineHost` and a new effect with `defineEffect`, in a
`.tsx` file in the scene's folder. The package builds its terminal and its other components with the
same two functions, so a new kind of part can do what a terminal does, and needs no change to the
package.

```tsx
// scripts/storyboard/release/chat.tsx in an invented repo
/** @jsxImportSource @zgeoff/storyboard */
import { countReadingWords } from '@zgeoff/storyboard';
import { defineEffect, defineHost, getColor } from './kit.ts';

interface BubbleMail {
  speaker: string;
  text: string;
}

// A panel that stacks the bubbles sent to it.
export const buildChat = defineHost<{ box: { x: number; y: number; width: number } }, BubbleMail>({
  name: 'Chat',
  render: (props, deliveries, time) => (
    <g>
      {deliveries.map((delivery, row) => (
        <text x={props.box.x} y={props.box.y + row * 22} fill={getColor('text')} opacity={0}>
          {delivery.payload.speaker}: {delivery.payload.text}
          {time.fadeIn(delivery.at)}
        </text>
      ))}
    </g>
  ),
});

// One bubble, timed by its own words. `on` takes only a Chat handle.
export const Bubble = defineEffect<{ speaker: string; children: string }, BubbleMail>({
  name: 'Bubble',
  host: buildChat,
  need: (props) => ({ words: countReadingWords(props.children) }),
  deliver: (props) => ({ speaker: props.speaker, text: props.children }),
});
```

```ts
// storyboard module
interface Need {
  words?: number; // the words a reader reads on this part
  lead?: number; // seconds of motion that end on the change
  marks?: Record<string, number>; // named instants inside the change, as seconds after it
}

interface EffectDefinition<P, M> {
  name: string; // the component's name in errors
  need(props: P): Need; // runs before any time exists, so it reads only its props
  host?: (props: never) => Host<M>; // the function that makes its host; with it, the effect takes `on`; absent: it draws in place
  deliver?(props: P): M; // what it hands its host
  render?(props: P, placed: { at: number; mark(name: string): number }, time: SceneTime): StoryNode; // a part that draws in place
}

interface HostDefinition<P, M> {
  name: string;
  render(props: P, deliveries: readonly { at: number; payload: M }[], time: SceneTime): StoryNode; // deliveries in time order
}

interface SceneTime {
  loopS: number;
  reset: number;
  find(reference: Reference): number; // fails the build, naming the reference, when it matches nothing
  fadeIn(at: number): StoryNode; // the package's fade on opacity, as an Animate
  fadeOut(at: number): StoryNode;
}
```

The package resets a host's deliveries itself: every element a host renders returns to its
first-frame value at `reset`, by the rules in [The components](#the-components).

The build reads the tree in two passes. The first calls each of the scene's own function components,
such as `Islands`, and each part's `need`, before any time exists, then places the changes. The
second renders each part with its times, into the tree the first pass kept. So a scene's own
component runs once, and it can't read a time: it gets times only through the parts and `Animate`s
it returns.
