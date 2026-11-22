// oxlint-disable unicorn/no-array-callback-reference -- time.find looks up a reference, and is no iterator method
// oxlint-disable eslint/id-length -- SVG names its attributes d and r with one letter
import { buildAnimation } from '../animation/build-animation.ts';
import { CUT_S, FADE_S, GRID_S } from '../animation/constants.ts';
import { buildElement } from '../jsx/build-element.ts';
import type {
  Host,
  Placed,
  Point,
  SceneTime,
  Steps,
  StoryNode,
  TimedProps,
  TokenReference,
} from '../types.ts';
import { buildBowPath } from '../utils/build-bow-path.ts';
import { countReadingWords } from '../utils/count-reading-words.ts';
import { formatNumber } from '../utils/format-number.ts';
import { SceneError } from '../utils/scene-error.ts';
import { buildIDReference } from './build-id-reference.ts';
import { defineEffect } from './define-effect.ts';
import { renderTravel } from './render-travel.ts';

export interface PulseProps {
  readonly stops: readonly Point[];
  readonly tone: string;
}

export interface CursorProps {
  readonly from: Point;
  readonly target: Point;
  readonly glide: Steps;
  readonly leaves: string;
}

export interface StampProps {
  readonly point: Point;
  readonly tone: string;
  readonly until: string;
  readonly children: string;
}

export interface DrawingParts {
  readonly Flight: (
    props: TimedProps<
      { from: Host<unknown>; to: Host<unknown>; tone: string } | { path: string; tone: string }
    >,
  ) => StoryNode;
  readonly Pulse: (props: TimedProps<PulseProps>) => StoryNode;
  readonly Cursor: (props: TimedProps<CursorProps>) => StoryNode;
  readonly Stamp: (props: TimedProps<StampProps>) => StoryNode;
}

const FLIGHT_S = 0.75;
const PULSE_S = 0.5;

// The parts that draw in place, built with defineEffect like any part a scene defines for itself.
export function makeDrawingParts(color: (name: string) => TokenReference): DrawingParts {
  const glowFilterID = buildIDReference('glow', false);
  const glowFilterURL = buildIDReference('glow', true);

  const Flight = defineEffect<
    { from: Host<unknown>; to: Host<unknown>; tone: string } | { path: string; tone: string }
  >({
    name: 'Flight',
    need: () => ({ lead: FLIGHT_S }),
    render: (props, placed) =>
      renderTravel({
        path: 'path' in props ? props.path : buildHostPath(props.from, props.to),
        color: color(props.tone),
        whiteColor: color('text'),
        glowFilterID,
        glowFilterURL,
        startS: placed.at - FLIGHT_S,
        endS: placed.at,
        trailWidth: 2.2,
        dashLength: 0.16,
      }),
  });

  const Pulse = defineEffect<PulseProps>({
    name: 'Pulse',
    need: (props) => ({ lead: PULSE_S, marks: buildPulseMarks(props.stops) }),
    render: (props, placed) =>
      renderTravel({
        path: buildStopsPath(props.stops),
        color: color(props.tone),
        whiteColor: color('text'),
        glowFilterID,
        glowFilterURL,
        startS: placed.at - PULSE_S,
        endS: placed.at,
        trailWidth: 1.4,
        dashLength: 0.12,
      }),
  });

  const Cursor = defineEffect<CursorProps>({
    name: 'Cursor',
    need: (props) => ({ lead: props.glide.steps * GRID_S }),
    render: (props, placed, time) => renderCursor(props, placed, time, color),
  });

  const Stamp = defineEffect<StampProps>({
    name: 'Stamp',
    need: (props) => ({ words: countReadingWords(props.children) }),
    render: (props, placed, time) => renderStamp(props, placed, time, color),
  });

  return { Flight, Pulse, Cursor, Stamp };
}

function buildHostPath(from: Host<unknown>, to: Host<unknown>): string {
  const start = from.findAnchor();
  const end = to.findAnchor();

  if (start === undefined || end === undefined) {
    throw new SceneError('bad-component', 'a <Flight> needs hosts that give an anchor, or a path');
  }

  return buildBowPath(start, end);
}

// A pulse's stops are marks, as the seconds before the change that the pulse reaches each stop.
function buildPulseMarks(stops: readonly Point[]): Record<string, number> {
  if (stops.length < 2) {
    throw new SceneError('bad-component', 'a <Pulse> needs at least two stops');
  }

  const lengths = stops.slice(1).map((stop, index) => {
    const previous = stops[index];

    return previous === undefined ? 0 : Math.hypot(stop.x - previous.x, stop.y - previous.y);
  });

  const total = lengths.reduce((sum, length) => sum + length, 0);
  const marks: Record<string, number> = { stop1: -PULSE_S };
  let travelled = 0;

  lengths.forEach((length, index) => {
    travelled += length;
    marks[`stop${index + 2}`] = total === 0 ? 0 : -PULSE_S * (1 - travelled / total);
  });

  return marks;
}

function buildStopsPath(stops: readonly Point[]): string {
  return stops
    .map(
      (stop, index) => `${index === 0 ? 'M' : 'L'}${formatNumber(stop.x)} ${formatNumber(stop.y)}`,
    )
    .join(' ');
}

const HAND_OUTLINE =
  'M-1.5 1.6C-1.5 .6 -.8 0 0 0C.8 0 1.5 .6 1.5 1.6V8.6C1.5 7.8 2.1 7.2 2.9 7.2C3.7 7.2 4.3 7.8 4.3 8.6V9.6C4.3 8.8 4.9 8.3 5.7 8.3C6.5 8.3 7.1 8.9 7.1 9.7V10.6C7.1 9.9 7.7 9.5 8.4 9.5C9.1 9.5 9.7 10.1 9.7 10.8V16C9.7 19.4 7.6 21.6 4.6 21.6H2.2C.2 21.6 -1.1 20.7 -2.2 19.2L-6 13.8C-6.6 13 -6.4 11.9 -5.6 11.4C-4.8 10.9 -3.8 11.1 -3.2 11.8L-1.5 14Z';

const HAND_FINGERS = 'M1.5 8.6V12.4M4.3 9.6V12.6M7.1 10.6V13';

// The hand glides from `from` to `target`, reaches it half a fade before the change, presses on
// it, and glides back at `leaves`.
function renderCursor(
  props: CursorProps,
  placed: Placed,
  time: SceneTime,
  color: (name: string) => TokenReference,
): StoryNode {
  const glideS = props.glide.steps * GRID_S;
  const arriveS = placed.at - FADE_S / 2;
  const startS = arriveS - glideS;
  const leavesS = time.find(props.leaves);
  const endS = leavesS + glideS;

  if (leavesS < arriveS) {
    throw new SceneError(
      'bad-component',
      `a <Cursor> leaves at ${props.leaves}, before it arrives`,
    );
  }

  const spanS = endS - startS;

  const glide = buildAnimation({
    attribute: 'transform',
    transform: 'translate',
    startS,
    durS: spanS,
    keys: [
      [0, formatPoint(props.from)],
      [glideS / spanS, formatPoint(props.target)],
      [(leavesS - startS) / spanS, formatPoint(props.target)],
      [1, formatPoint(props.from)],
    ],
  });

  const press = buildAnimation({
    attribute: 'transform',
    transform: 'scale',
    startS: arriveS,
    durS: FADE_S,
    keys: [
      [0, 1],
      [0.5, 0.85],
      [1, 1],
    ],
  });

  const outline = buildElement(
    'path',
    {
      d: HAND_OUTLINE,
      fill: color('terminalStroke'),
      stroke: color('terminalFill'),
      'stroke-width': 1.3,
      'stroke-linejoin': 'round',
    },
    null,
  );

  const fingers = buildElement(
    'path',
    {
      d: HAND_FINGERS,
      fill: 'none',
      stroke: color('terminalFill'),
      'stroke-width': 1,
      'stroke-linecap': 'round',
    },
    null,
  );

  // The fingertip is the origin, so the hand presses on the point it glides to.
  const tilted = buildElement('g', { transform: 'scale(1.45) rotate(-14)' }, [outline, fingers]);
  const hand = buildElement('g', {}, [buildElement('g', {}, [tilted, press]), glide]);

  return buildElement('g', { opacity: 0 }, [hand, time.fadeIn(startS), time.fadeOut(endS)]);
}

function formatPoint(point: Point): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

// A word in a box that slams on at its change and goes at `until`.
function renderStamp(
  props: StampProps,
  placed: Placed,
  time: SceneTime,
  color: (name: string) => TokenReference,
): StoryNode {
  const charWidth = 7.4;
  const width = props.children.length * charWidth + 18;

  const slam = buildAnimation({
    attribute: 'transform',
    transform: 'scale',
    startS: placed.at,
    durS: FADE_S,
    keys: [
      [0, 1.7],
      [0.32, 0.88],
      [0.68, 1.05],
      [1, 1],
    ],
  });

  const box = buildElement(
    'rect',
    {
      x: -width / 2,
      y: -9.5,
      width,
      height: 19,
      rx: 3,
      fill: color('terminalFill'),
      stroke: color(props.tone),
      'stroke-width': 1.6,
    },
    null,
  );

  const word = buildElement(
    'text',
    { x: 0, y: 3.8, class: 'sb-stamp', 'text-anchor': 'middle', fill: color(props.tone) },
    props.children,
  );

  const slammed = buildElement('g', {}, [box, word, slam]);

  const placement = buildElement(
    'g',
    { transform: `translate(${formatPoint(props.point)}) rotate(-6)` },
    slammed,
  );

  // The stamp cuts in as it slams, and fades over half a fade when it goes.
  const cutsIn = buildAnimation({
    attribute: 'opacity',
    startS: placed.at,
    durS: CUT_S,
    keys: [
      [0, 0],
      [1, 1],
    ],
  });

  const goes = buildAnimation({
    attribute: 'opacity',
    startS: time.find(props.until),
    durS: FADE_S / 2,
    keys: [
      [0, 1],
      [1, 0],
    ],
  });

  return buildElement('g', { opacity: 0 }, [placement, cutsIn, goes]);
}
