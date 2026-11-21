// oxlint-disable unicorn/no-array-callback-reference -- time.find looks up a reference, and is no iterator method
import { buildFadeIn, buildFadeOut } from '../animation/build-animation.ts';
import type { ActingSpan, SceneTime } from '../types.ts';
import type { Timeline } from './types.ts';

export function buildSceneTime(
  timeline: Timeline,
  key: string,
  acting: readonly ActingSpan[],
): SceneTime {
  return {
    loopS: timeline.loopS,
    reset: timeline.resetS,
    key,
    acting,
    find: (reference) => timeline.find(reference),
    fadeIn: (at) => buildFadeIn(at),
    fadeOut: (at) => buildFadeOut(at),
  };
}
