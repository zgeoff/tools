import type { LaneParallelism, ResolvedLane, RigConfig } from './types.ts';

export type ParsedRigConfig =
  | { readonly kind: 'parsed'; readonly config: RigConfig }
  | { readonly kind: 'refused'; readonly reason: string };

// The module that a config file default-exports comes from outside the program, so rig's loader
// and the lint plugin's both parse it field by field instead of trusting its type.
export function parseRigConfig(value: unknown): ParsedRigConfig {
  if (typeof value !== 'object' || value === null || !('lanes' in value)) {
    return { kind: 'refused', reason: 'the default export has no lanes' };
  }

  const lanes: unknown = value.lanes;

  if (!Array.isArray(lanes)) {
    return { kind: 'refused', reason: 'its lanes are no list' };
  }

  const resolved: ResolvedLane[] = [];

  for (const [index, lane] of lanes.entries()) {
    const parsed = parseResolvedLane(lane, index);

    if (parsed.kind === 'refused') {
      return parsed;
    }

    resolved.push(parsed.lane);
  }

  return { kind: 'parsed', config: { lanes: resolved } };
}

type ParsedLane =
  | { readonly kind: 'parsed'; readonly lane: ResolvedLane }
  | { readonly kind: 'refused'; readonly reason: string };

function parseResolvedLane(value: unknown, index: number): ParsedLane {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'refused', reason: `lane ${index} is no object` };
  }

  const name: unknown = Reflect.get(value, 'name');
  const suffix: unknown = Reflect.get(value, 'suffix');
  const limitMs: unknown = Reflect.get(value, 'limitMs');
  const parallel: unknown = Reflect.get(value, 'parallel');
  const memory: unknown = Reflect.get(value, 'memory');
  const start: unknown = Reflect.get(value, 'start');
  const stop: unknown = Reflect.get(value, 'stop');

  if (typeof name !== 'string') {
    return { kind: 'refused', reason: `lane ${index} has no name` };
  }

  if (!isNullableString(suffix)) {
    return refuseField(name, 'suffix', suffix);
  }

  if (typeof limitMs !== 'number') {
    return refuseField(name, 'limitMs', limitMs);
  }

  if (!isParallelism(parallel)) {
    return refuseField(name, 'parallel', parallel);
  }

  if (!isNullableString(memory)) {
    return refuseField(name, 'memory', memory);
  }

  if (!isNullableString(start)) {
    return refuseField(name, 'start', start);
  }

  if (!isNullableString(stop)) {
    return refuseField(name, 'stop', stop);
  }

  return { kind: 'parsed', lane: { name, suffix, limitMs, parallel, memory, start, stop } };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function refuseField(lane: string, field: keyof ResolvedLane, value: unknown): ParsedLane {
  return {
    kind: 'refused',
    reason: `lane "${lane}" has the ${field} ${String(JSON.stringify(value))}, which defineRig never resolves`,
  };
}

function isParallelism(value: unknown): value is LaneParallelism {
  return value === 'workers' || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}
