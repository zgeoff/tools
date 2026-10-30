import type { LaneContext } from './types.ts';

export type LaneHook = (context: LaneContext) => Promise<unknown>;

// A repo's hook module comes from outside the program, so its default export is checked before
// rig calls it.
export function parseLaneHook(loaded: unknown, path: string): LaneHook {
  const hook: unknown =
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : null;

  if (!isLaneHook(hook)) {
    throw new Error(`${path} must default-export a function that takes the lane context`);
  }

  return hook;
}

function isLaneHook(value: unknown): value is LaneHook {
  return typeof value === 'function';
}
