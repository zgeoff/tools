import type { AnimationKeys, AnimationNode, Span, Transform } from '../types.ts';
import { CUT_S, FADE_S, GRID_S } from './constants.ts';

interface AnimationSpec {
  readonly attribute: string;
  readonly startS: number;
  readonly durS: number;
  readonly keys: AnimationKeys;
  readonly transform?: Transform;
  readonly path?: string;
  readonly isInternal?: boolean;
}

export function buildAnimation(spec: AnimationSpec): AnimationNode {
  return {
    node: 'animation',
    attribute: spec.attribute,
    startS: spec.startS,
    durS: spec.durS,
    keys: spec.keys,
    transform: spec.transform,
    path: spec.path,
    isInternal: spec.isInternal ?? false,
  };
}

export function toSpanS(span: Span): number {
  if (span === 'fade') {
    return FADE_S;
  }

  if (span === 'cut') {
    return CUT_S;
  }

  return span.steps * GRID_S;
}

export function buildFadeIn(atS: number): AnimationNode {
  return buildAnimation({
    attribute: 'opacity',
    startS: atS,
    durS: FADE_S,
    keys: [
      [0, 0],
      [1, 1],
    ],
  });
}

export function buildFadeOut(atS: number): AnimationNode {
  return buildAnimation({
    attribute: 'opacity',
    startS: atS,
    durS: FADE_S,
    keys: [
      [0, 1],
      [1, 0],
    ],
  });
}
