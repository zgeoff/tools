# Writing a scene

- **Status:** draft

The [README's words](./README.md#words) define scene, stage, beat, grid, token, kit and the other
terms this doc uses. A scene author writes the files of one scene folder: `tokens.ts`, `story.ts`,
`kit.ts`, `scene.tsx`, and a `.tsx` file for each drawing that the scene makes for itself. This doc
holds each file's contract and the timing rules that `defineStory` enforces. The examples come from
the hero scene of the [atc](https://github.com/zgeoff/atc) repo, such as its `islands.tsx` drawing.
[build-and-check.md](./build-and-check.md) holds what `storyboard build` writes from these files.

## Tokens

`storyboard build` writes two SVG files for each scene, a dark one and a light one. Each token is
one named colour, with one value for both files or a value for each.

```ts
// scripts/storyboard/hero/tokens.ts in atc
export default defineTokens({
  slateTop: '#46548a', // one colour, written in both files
  claudeFace: '#4cc9a2',
  captionText: { dark: '#e6edf3', light: '#1f2328' }, // a pair, which overrides one of the package's tokens
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

The package defines the base tokens, which its own components draw with. Their default values are
the colours of atc's hero files: `captionText`, `captionLit` and `captionAhead` are pairs, with the
hero's light-file colours as their light half, and every other base token is one colour. A scene's
tokens are visible only to that scene.

## The story

`stageS` is the length of one stage in seconds, and a story has one caption per stage, so a loop
lasts `stageS` times the number of captions. A stage starts with its caption. Its action window
starts 0.5 s later, and every beat of the stage lands inside that window, on a step of the grid.

```ts
// scripts/storyboard/hero/story.ts in atc
import tokens from './tokens.ts';

export default defineStory({
  tokens,
  stageS: 6, // a multiple of 0.5
  captions: [
    'You ask your orchestrator for an orders page.',
    'It spawns a builder on another machine.',
    'Agents talk to each other directly.',
    // …three more, one per stage
  ],

  // Each text whose reading time sets a beat, by name.
  lines: {
    prompt: 'build the orders page on a sprite',
    reply: 'On it.',
    ask: '/orders shape?',
    answer: '[{ id, total }]',
  },

  // Resolved in this order: a rule refers only to beats above it.
  beats: {
    typeStart: { kind: 'step', stage: 1, step: 0 }, // 0.5 s
    typed: { kind: 'step', stage: 1, step: 3 }, // 2 s
    sent: { kind: 'step', stage: 1, step: 4 }, // 2.5 s
    replied: {
      kind: 'latest',
      rules: [
        { kind: 'after', beat: 'sent', steps: 1 },
        { kind: 'reading', lines: ['prompt'], from: 'typeStart' },
      ],
    }, // 7 words after 0.5 s is 2.75 s, which moves to 3 s; both rules give 3 s
    askWritten: { kind: 'step', stage: 3, step: 0 }, // 12.5 s
    askLanded: { kind: 'reading', lines: ['ask'], from: 'askWritten' }, // 2 words, 1 s: 13.5 s
    answerWritten: { kind: 'reading', lines: ['ask'], from: 'askLanded' }, // builder-api reads the ask first: 14.5 s
    answerLanded: { kind: 'reading', lines: ['answer'], from: 'answerWritten' }, // 15.5 s
    // …spawnLanded in stage 2, needsYou in stage 4, cleared in stage 5, and the beats of stage 6
  },

  terminals: {
    builderUI: {
      title: 'builder-ui · sprites',
      opens: 'spawnLanded', // hidden until this beat, then fades in
      lines: [
        { kind: 'message', head: '→ builder-api: ', line: 'ask', at: 'askWritten', tone: 'blue' },
        {
          kind: 'message',
          head: '← builder-api: ',
          line: 'answer',
          at: 'answerLanded',
          tone: 'blue',
        },
      ],
      status: [
        { text: 'working', from: 'start', tone: 'teal' }, // each state runs until the next starts
        { text: 'asking', from: 'askWritten', tone: 'blue' },
      ],
      // The terminal acts in these windows. Outside them, a dark veil covers it at 60% opacity.
      acting: [
        ['askWritten', 'askLanded'],
        ['answerLanded', 'stage4'],
      ],
      alerts: [{ from: 'needsYou', until: 'cleared', tone: 'amber' }], // a flashing border
    },
    // …orchestrator and builderAPI
  },
});
```

```ts
// storyboard module. Every reference is NoInfer, so TypeScript takes B from the keys of `beats`
// alone and L from the keys of `lines`.
type BeatRule<B extends string, L extends string> =
  | { kind: 'step'; stage: number; step: number } // stage 1 to N; step 0 is the start of the stage's action window
  | { kind: 'after'; beat: NoInfer<B>; steps: number } // whole steps after an earlier beat
  | { kind: 'reading'; lines: readonly NoInfer<L>[]; from: NoInfer<B> } // the lines' reading time after an earlier beat
  | { kind: 'latest'; rules: readonly Exclude<BeatRule<B, L>, { kind: 'latest' }>[] };

// Built-in beats: `start` is 0 s; `stage2` to `stageN` are the instants each later stage begins and
// its caption swaps; `reset` is where the loop starts to fade back to its first frame.
type BeatName<B extends string> = B | 'start' | `stage${number}` | 'reset';

type TerminalLine<B extends string, L extends string, K extends string> =
  | { kind: 'text'; text: string; at: BeatName<B>; tone?: K }
  | { kind: 'message'; head: string; line: L; at: BeatName<B>; tone?: K } // the line in italics after a plain head; leading spaces in head indent it
  | { kind: 'typed'; line: L; from: BeatName<B>; to: BeatName<B>; sentAt: BeatName<B> }; // typed in from `from` to `to`, highlighted at `sentAt`

interface TerminalSession<B extends string, L extends string, K extends string> {
  title: string;
  opens?: BeatName<B>; // absent: shown from the first frame
  lines: readonly TerminalLine<B, L, K>[];
  status: readonly { text: string; from: BeatName<B>; tone?: K }[]; // absent tone: dimText
  acting?: readonly (readonly [BeatName<B>, BeatName<B>])[]; // absent: never veiled
  alerts?: readonly { from: BeatName<B>; until: BeatName<B>; tone: K }[];
}
```

`defineStory` returns the story with every beat's time worked out. Every `tone` in a story is a name
from its tokens.

## Timing rules

The package fixes these values, and a story sets only `stageS`:

| Value        | Seconds                              |
| ------------ | ------------------------------------ |
| grid step    | 0.5                                  |
| fade         | 0.35                                 |
| hard cut     | 0.03                                 |
| flight       | 0.75, ending on the beat it lands on |
| pulse        | 0.5, ending on the beat it lands on  |
| reading time | 0.25 per word, plus 0.5              |
| reset        | starts 1 before the loop ends        |

Each stage's action window runs from 0.5 s after the stage starts to 0.5 s before it ends. In the
last stage, it ends at the reset.

The package counts a run of characters between spaces as a word when it has a letter in it, so `→`,
`|` and `[{` count for nothing.

`defineStory` resolves the beats and checks them:

- It moves an `after` or `reading` beat forward to the next grid step. A beat that lands on a step
  keeps its place. A `latest` beat takes the latest of its rules once each one has moved.
- An `after`, `reading` or `latest` beat belongs to the stage of the beat it starts from, and must
  land inside that stage's action window.
- It fails when a beat lands outside its stage's action window. In its error message, `defineStory`
  gives the beat, its stage, and the smallest `stageS`, in seconds and a multiple of 0.5, that would
  fit the beat.
- It fails when two of the story's beats land on the same instant. The built-in beats are exempt
  from this rule and from the action window.
- It fails when a rule refers to a beat declared below it, to a line missing from `lines`, or to a
  stage past the number of captions.
- It fails when a reader would miss a line. The lines that appear on one beat count as one reading:
  their words added up, plus one 0.5 s base. A `text` line counts the words of its `text`, a
  `message` line counts the words of its `line` and never its `head`, and a `typed` line's reading
  starts when its typing starts. `defineStory` fails when the next lines, in any terminal, appear
  before that reading ends, or when a reading runs past the end of its stage. Lines at `start` are
  exempt.

Every time inside the package is in seconds.

## The kit and the components

A scene's `kit.ts` builds the kit once, and each drawing imports its components from there.

```ts
// scripts/storyboard/hero/kit.ts in atc
import story from './story.ts';
export const {
  Terminal,
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
} = buildSceneKit(story);
```

```tsx
// scripts/storyboard/hero/islands.tsx in atc
/** @jsxImportSource @zgeoff/storyboard */
import type { Point, StoryNode } from '@zgeoff/storyboard';
import { Animate, Def, getColor, getID, getURL } from './kit.ts';

export function Islands(): StoryNode {
  return <Island at={{ x: 842, y: 346 }} />; // …and the laptop and sprites islands
}

function Island({ at }: { at: Point }): StoryNode {
  return (
    <g>
      <Def>
        <linearGradient id={getID('slate')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color={getColor('slateTop')} />
        </linearGradient>
      </Def>
      <polygon points="…" fill={getURL('slate')} />
      <ellipse cx={at.x} cy={at.y} rx={31} ry={16} fill={getColor('teal')} opacity={0}>
        <Animate
          attribute="opacity"
          at="askLanded"
          span={{ steps: 2 }}
          keys={[
            [0, 0],
            [0.2, 0.8],
            [1, 0],
          ]}
        />
      </ellipse>
    </g>
  );
}
```

```ts
// storyboard module. B, T and K are the story's beat, terminal and token names. Every beat prop
// takes the built-in beats too.
interface SceneKit<B extends string, T extends string, K extends string> {
  Terminal(props: { session: T; box: { x: number; y: number; width: number } }): StoryNode;
  Flight(props: { path: string; lands: BeatName<B>; tone: K }): StoryNode; // a dot with a trail
  Pulse(props: { stops: readonly Point[]; lands: BeatName<B>; tone: K }): StoryNode; // straight hops at one speed; stop 0 is the first point
  // The pointing hand: it glides from `from` at `glides`, reaches `target` half a fade before
  // `presses`, and glides back to `from` at `leaves`.
  Cursor(props: {
    from: Point;
    target: Point;
    glides: BeatName<B>;
    presses: BeatName<B>;
    leaves: BeatName<B>;
  }): StoryNode;
  // A word in a box that slams on at `lands` and fades out at `until`, such as CLEARED.
  Stamp(props: {
    at: Point;
    lands: BeatName<B>;
    until: BeatName<B>;
    text: string;
    tone: K;
  }): StoryNode;
  Def(props: { children: StoryNode }): StoryNode; // gathered into the file's one <defs>

  // The one way to animate on the loop.
  Animate(props: {
    attribute: string;
    at: BeatName<B> | { pulseLands: B; stop: number }; // a beat, or when the one pulse landing on that beat reaches a stop
    lead?: 'fade' | 'cut' | { steps: number }; // the span starts this long before `at`; absent: on `at`
    span: 'fade' | 'cut' | { steps: number }; // the span lasts a fade, a cut or whole grid steps
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
}
```

The package renders the components by these rules:

- A `Terminal` grows by one row over one fade as each line enters, so its height always fits the
  lines shown. Its veil and its alert border grow with it.
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
  `Animate` and `Ambient` write SMIL.
- The build fails when two `Def`s share an id and differ in content.

## The scene

```tsx
// scripts/storyboard/hero/scene.tsx in atc
/** @jsxImportSource @zgeoff/storyboard */
import { buildBowPath, defineScene } from '@zgeoff/storyboard';
import { Islands } from './islands.tsx';
import { Flight, getColor, Terminal } from './kit.ts';
import story from './story.ts';

export default defineScene({
  story,
  out: 'docs/assets/hero', // from the repo root: hero-dark.svg and hero-light.svg
  card: { width: 1000, height: 620, cornerRadius: 12 }, // the package clips the card and puts the caption band above it
  description: 'An animated diagram of atc. You ask an orchestrator on your laptop…', // the file's aria-label
  styles: { name: { 'font-size': 12.5, 'font-weight': 700, fill: getColor('text') } }, // CSS classes for drawings
  render: () => (
    <>
      <Islands />
      <Flight
        path={buildBowPath({ x: 376, y: 479 }, { x: 848, y: 329 }, -14)}
        lands="askLanded"
        tone="blue"
      />
      <Terminal session="builderAPI" box={{ x: 724, y: 132, width: 256 }} />
    </>
  ),
});
```

The package writes the file's one `<style>` block: the monospace font stack, the classes its
components use, and each class in `styles`. A number on a length property in `styles`, such as
`font-size`, is in pixels.

The scene draws the card's background itself. The caption band above the card has no background, so
the page that shows the image, such as atc's README, shows through it.

The package draws the caption band from `story.captions`: one centred sentence per stage, and a dot
per stage that is dim ahead, lit while current and half lit once done. At each stage start, the old
sentence fades out over the first half of a fade, and the new one fades in from 40% of that fade to
its end.
