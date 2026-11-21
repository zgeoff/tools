import type { Scene, SceneSpec } from '../types.ts';

export function defineScene(spec: SceneSpec): Scene {
  return { ...spec, brand: 'storyboard-scene' };
}

export function isScene(value: unknown): value is Scene {
  return (
    typeof value === 'object' &&
    value !== null &&
    'brand' in value &&
    value.brand === 'storyboard-scene'
  );
}
