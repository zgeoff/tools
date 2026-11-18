import { isRecord } from './is-record.ts';

export interface AgeGate {
  readonly isOn: boolean;

  // The gate in seconds; 0 when the gate is off.
  readonly seconds: number;
  readonly excludes: readonly string[];
}

export function parseAgeGate(bunfig: string): AgeGate {
  const parsed: unknown = Bun.TOML.parse(bunfig);
  const install = isRecord(parsed) ? parsed['install'] : undefined;
  const minimumReleaseAge = isRecord(install) ? install['minimumReleaseAge'] : undefined;
  const excludes = isRecord(install) ? install['minimumReleaseAgeExcludes'] : undefined;

  if (excludes !== undefined && !isStringList(excludes)) {
    throw new TypeError('bunfig.toml sets a minimumReleaseAgeExcludes that is not a list of names');
  }

  const seconds = parseGateSeconds(minimumReleaseAge);

  return {
    isOn: seconds > 0,
    seconds,
    excludes: excludes ?? [],
  };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

const unitSeconds = new Map([
  ['s', 1],
  ['m', 60],
  ['h', 3600],
  ['d', 86_400],
  ['w', 604_800],
]);

function parseGateSeconds(value: unknown): number {
  if (value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  const match = typeof value === 'string' ? /^(?<count>\d+)(?<unit>[smhdw]?)$/u.exec(value) : null;
  const count = match?.groups?.['count'];

  if (count === undefined) {
    throw new TypeError('bunfig.toml sets a minimumReleaseAge that is not a number of seconds');
  }

  return Number(count) * (unitSeconds.get(match?.groups?.['unit'] ?? '') ?? 1);
}
