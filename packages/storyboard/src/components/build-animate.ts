import type { AnimateNode, AnimateProps } from '../types.ts';

export function buildAnimate(props: AnimateProps): AnimateNode {
  return { node: 'animate', props };
}
