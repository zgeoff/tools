import { buildAnimation } from '../animation/build-animation.ts';
import type { AnimationNode } from '../types.ts';

export interface BorderShowSpec {
  readonly at: number;
  readonly totalS: number;
  readonly resetS: number;
  readonly keys: readonly (readonly [number, number])[];
}

// The opacity span of a border. A span that would run past the loop reset stops at the reset, at the
// value it has reached there, and the reset fades the border out.
export function buildBorderShow(spec: BorderShowSpec): AnimationNode {
  const durS = Math.min(spec.totalS, spec.resetS - spec.at);

  if (durS >= spec.totalS) {
    return buildAnimation({
      attribute: 'opacity',
      startS: spec.at,
      durS: spec.totalS,
      keys: spec.keys,
    });
  }

  const cutAt = durS / spec.totalS;
  const kept = spec.keys.filter(([fraction]) => fraction < cutAt);
  const before = kept.at(-1);
  const after = spec.keys.find(([fraction]) => fraction >= cutAt);

  if (before === undefined || after === undefined) {
    throw new Error('a border span has no keys around the reset');
  }

  const [fromAt, fromValue] = before;
  const [toAt, toValue] = after;
  const reached = fromValue + ((toValue - fromValue) * (cutAt - fromAt)) / (toAt - fromAt);
  const rescaled = kept.map(([fraction, value]) => [fraction / cutAt, value] as const);

  return buildAnimation({
    attribute: 'opacity',
    startS: spec.at,
    durS,
    keys: [...rescaled, [1, reached]],
  });
}
