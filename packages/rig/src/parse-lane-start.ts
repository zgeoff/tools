import type { LaneStart } from './types.ts';

export function parseLaneStart(value: unknown, path: string): LaneStart {
  if (value === undefined) {
    return {};
  }

  const environment: unknown =
    typeof value === 'object' && value !== null ? Reflect.get(value, 'environment') : null;

  if (environment === undefined) {
    return {};
  }

  if (!isStringRecord(environment)) {
    throw new Error(
      `the start hook ${path} must return nothing or { environment: Record<string, string> }`,
    );
  }

  return { environment };
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry: unknown) => typeof entry === 'string')
  );
}
