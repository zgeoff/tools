// oxlint-disable eslint/id-length -- SVG names its attributes d and r with one letter
import { buildAnimatedElement } from '../animation/build-animated-element.ts';
import { buildAnimation } from '../animation/build-animation.ts';
import { FADE_S } from '../animation/constants.ts';
import type { Timeline } from '../timeline/types.ts';
import type { AnimationNode, ElementNode, TokenReference } from '../types.ts';

export const CAPTION_BAND_HEIGHT = 76;
const CAPTION_Y = 34;
const DOT_Y = 56;
const DOT_SPACING = 18;
const FADE_OUT_S = 0.175;
const FADE_IN_START_S = 0.14;
const FADE_IN_END_S = 0.35;

interface CaptionInput {
  readonly timeline: Timeline;
  readonly width: number;
  readonly color: (name: string) => TokenReference;
}

// One centred sentence for each stage, and a dot for each stage that is dim ahead, lit while
// current and half lit once done. The last stage's sentence and dot start lit, so the loop's last
// frame matches its first.
export function buildCaptionBand(input: CaptionInput): ElementNode[] {
  const timing = { loopS: input.timeline.loopS, resetS: input.timeline.resetS };
  const count = input.timeline.stages.length;

  return input.timeline.stages.flatMap((stage, index) => {
    const isLast = index === count - 1;
    const nextStartS = input.timeline.stages[index + 1]?.startS;
    const dotX = input.width / 2 + (index - (count - 1) / 2) * DOT_SPACING;

    const sentence: ElementNode = {
      node: 'element',
      tag: 'text',
      attributes: {
        x: input.width / 2,
        y: CAPTION_Y,
        class: 'sb-caption',
        'text-anchor': 'middle',
        fill: input.color('captionText'),
        opacity: isLast ? 1 : 0,
      },
      children: [stage.caption],
    };

    const sentenceAnimations =
      count === 1
        ? []
        : [
            ...(isLast ? [buildSwap(0, FADE_OUT_S, 1, 0)] : []),
            buildSwap(stage.startS + FADE_IN_START_S, FADE_IN_END_S - FADE_IN_START_S, 0, 1),
            ...(nextStartS === undefined ? [] : [buildSwap(nextStartS, FADE_OUT_S, 1, 0)]),
          ];

    const dim: ElementNode = {
      node: 'element',
      tag: 'circle',
      attributes: { cx: dotX, cy: DOT_Y, r: 3.4, fill: input.color('captionAhead') },
      children: [],
    };

    const lit: ElementNode = {
      node: 'element',
      tag: 'circle',
      attributes: {
        cx: dotX,
        cy: DOT_Y,
        r: 4,
        fill: input.color('captionLit'),
        opacity: isLast ? 1 : 0,
      },
      children: [],
    };

    const litAnimations =
      count === 1
        ? []
        : [
            ...(isLast ? [buildSwap(0, FADE_S, 1, 0)] : []),
            buildSwap(stage.startS, FADE_S, 0, 1),
            ...(nextStartS === undefined ? [] : [buildSwap(nextStartS, FADE_S, 1, 0.45)]),
          ];

    return [
      buildAnimatedElement(sentence, sentenceAnimations, [], timing),
      dim,
      buildAnimatedElement(lit, litAnimations, [], timing),
    ];
  });
}

function buildSwap(startS: number, durS: number, from: number, to: number): AnimationNode {
  return buildAnimation({
    attribute: 'opacity',
    startS,
    durS,
    keys: [
      [0, from],
      [1, to],
    ],
    isInternal: true,
  });
}
