import { buildAnimation } from '../animation/build-animation.ts';
import type { AnimationNode } from '../types.ts';

export interface StepSpec {
  readonly attribute: string;
  readonly startS: number;
  readonly durS: number;
  readonly from: number;
  readonly to: number;
  readonly isInternal?: boolean;
}

export function buildStep(spec: StepSpec): AnimationNode {
  return buildAnimation({
    attribute: spec.attribute,
    startS: spec.startS,
    durS: spec.durS,
    keys: [
      [0, spec.from],
      [1, spec.to],
    ],
    isInternal: spec.isInternal ?? false,
  });
}
