import type { LaneParallelism, ResolvedLane, RigConfig } from './types.ts';

// The module that a config file default-exports comes from outside the program, so the loader
// parses it field by field instead of trusting its type.
export function parseRigConfig(value: unknown): RigConfig | null {
  if (typeof value !== 'object' || value === null || !('lanes' in value)) {
    return null;
  }

  const lanes: unknown = value.lanes;

  if (!Array.isArray(lanes)) {
    return null;
  }

  const parsed = lanes.map((lane: unknown) => parseResolvedLane(lane));
  const resolved = parsed.filter((lane) => lane !== null);

  return resolved.length === parsed.length ? { lanes: resolved } : null;
}

function parseResolvedLane(value: unknown): ResolvedLane | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const name: unknown = Reflect.get(value, 'name');
  const suffix: unknown = Reflect.get(value, 'suffix');
  const limitMs: unknown = Reflect.get(value, 'limitMs');
  const parallel: unknown = Reflect.get(value, 'parallel');
  const memory: unknown = Reflect.get(value, 'memory');
  const start: unknown = Reflect.get(value, 'start');
  const stop: unknown = Reflect.get(value, 'stop');

  if (
    typeof name !== 'string' ||
    !isNullableString(suffix) ||
    typeof limitMs !== 'number' ||
    !isParallelism(parallel) ||
    !isNullableString(memory) ||
    !isNullableString(start) ||
    !isNullableString(stop)
  ) {
    return null;
  }

  return { name, suffix, limitMs, parallel, memory, start, stop };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isParallelism(value: unknown): value is LaneParallelism {
  return value === 'workers' || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}
