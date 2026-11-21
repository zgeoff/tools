// oxlint-disable eslint/id-length -- SVG names its attributes d and r with one letter
import { buildAnimation } from '../animation/build-animation.ts';
import { CUT_S } from '../animation/constants.ts';
import { buildElement } from '../jsx/build-element.ts';
import type { AnimationNode, IDReference, StoryNode, TokenReference } from '../types.ts';
import { buildDef } from './build-def.ts';

export interface TravelInput {
  readonly path: string;
  readonly color: TokenReference;
  readonly whiteColor: TokenReference;
  readonly glowFilterID: IDReference;
  readonly glowFilterURL: IDReference;
  readonly startS: number;
  readonly endS: number;
  readonly trailWidth: number;
  readonly dashLength: number;
}

// A dot with a trail that moves along a path and ends on `endS`: the trail is a dash that runs
// along the path, and the dot rides the same path.
export function renderTravel(input: TravelInput): StoryNode {
  const durS = input.endS - input.startS;

  const trailOffset = buildAnimation({
    attribute: 'stroke-dashoffset',
    startS: input.startS,
    durS,
    keys: [
      [0, input.dashLength],
      [1, input.dashLength - 1],
    ],
  });

  const trail = buildElement(
    'path',
    {
      d: input.path,
      fill: 'none',
      stroke: input.color,
      'stroke-width': input.trailWidth,
      'stroke-linecap': 'round',
      pathLength: 1,
      'stroke-dasharray': `${input.dashLength} 2`,
      'stroke-dashoffset': input.dashLength,
      opacity: 0,
    },
    [trailOffset, buildFade(input.startS, 0, 0.8), buildFade(input.endS, 0.8, 0)],
  );

  const ride = buildAnimation({
    attribute: 'motion',
    startS: input.startS,
    durS,
    path: input.path,
    keys: [
      [0, 0],
      [1, 1],
    ],
  });

  const core = buildElement('circle', { r: 3, fill: input.whiteColor }, null);

  const ring = buildElement(
    'circle',
    { r: 4.6, fill: 'none', stroke: input.color, 'stroke-width': 1.6 },
    null,
  );

  const dot = buildElement('g', {}, [core, ring, ride]);

  const head = buildElement('g', { opacity: 0, filter: input.glowFilterURL }, [
    dot,
    buildFade(input.startS, 0, 1),
    buildFade(input.endS, 1, 0),
  ]);

  return [buildGlowFilter(input.glowFilterID), trail, head];
}

function buildFade(startS: number, from: number, to: number): AnimationNode {
  return buildAnimation({
    attribute: 'opacity',
    startS,
    durS: CUT_S,
    keys: [
      [0, from],
      [1, to],
    ],
  });
}

function buildGlowFilter(glowFilterID: IDReference): StoryNode {
  const blur = buildElement('feGaussianBlur', { stdDeviation: 2.6, result: 'b' }, null);
  const blurred = buildElement('feMergeNode', { in: 'b' }, null);
  const source = buildElement('feMergeNode', { in: 'SourceGraphic' }, null);
  const merge = buildElement('feMerge', {}, [blurred, blurred, source]);

  const filter = buildElement(
    'filter',
    { id: glowFilterID, x: '-200%', y: '-200%', width: '500%', height: '500%' },
    [blur, merge],
  );

  return buildDef({ children: filter });
}
