import type { LaneParallelism, ProgramDeclaration, ResolvedLane, RigConfig } from './types.ts';

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

  const programs = parsePrograms(Reflect.get(value, 'programs'));

  if (programs === null) {
    return { kind: 'refused', reason: 'its programs are no record of program declarations' };
  }

  const benchLane: unknown = Reflect.get(value, 'benchLane');

  if (benchLane !== undefined && !isNullableString(benchLane)) {
    return { kind: 'refused', reason: `its benchLane is ${JSON.stringify(benchLane)}` };
  }

  const ignore = parseIgnore(Reflect.get(value, 'ignore'));

  if (ignore === null) {
    return { kind: 'refused', reason: 'its ignore is no list of patterns' };
  }

  return {
    kind: 'parsed',
    config: { ignore, lanes: resolved, programs, benchLane: benchLane ?? null },
  };
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
    reason: `lane "${lane}" has the ${field} ${JSON.stringify(value)}, which defineRig never resolves`,
  };
}

function isParallelism(value: unknown): value is LaneParallelism {
  return value === 'workers' || (typeof value === 'number' && Number.isInteger(value) && value > 0);
}

// A config from before programs existed has none, and means no programs.
function parsePrograms(value: unknown): Record<string, ProgramDeclaration> | null {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const programs: Record<string, ProgramDeclaration> = {};

  for (const [name, program] of Object.entries(value)) {
    const parsed = parseProgram(program);

    if (parsed === null) {
      return null;
    }

    programs[name] = parsed;
  }

  return programs;
}

function parseProgram(value: unknown): ProgramDeclaration | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const packageFolder: unknown = Reflect.get(value, 'package');
  const source: unknown = Reflect.get(value, 'source');
  const build: unknown = Reflect.get(value, 'build');
  const artifact: unknown = Reflect.get(value, 'artifact');

  if (
    typeof packageFolder !== 'string' ||
    typeof source !== 'string' ||
    typeof build !== 'string' ||
    typeof artifact !== 'string'
  ) {
    return null;
  }

  return { package: packageFolder, source, build, artifact };
}

// A config from before ignore existed has none, and means no ignored paths.
function parseIgnore(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const patterns: string[] = [];

  for (const pattern of value) {
    if (typeof pattern !== 'string') {
      return null;
    }

    patterns.push(pattern);
  }

  return patterns;
}
