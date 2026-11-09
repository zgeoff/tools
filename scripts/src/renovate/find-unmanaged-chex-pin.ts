import { isRecord } from '../../../packages/std/src/is-record.ts';

export const chexPinPath = '.github/workflows/bun-checks.yml';

// Returns the fault when no custom manager of renovate.json captures the chex pin, so Renovate
// would never bump it.
export function findUnmanagedChexPin(
  renovateText: string,
  workflowText: string,
): string | undefined {
  const config = parseConfig(renovateText);

  if (config === undefined) {
    return 'renovate.json is not valid JSON';
  }

  const managers = isRecord(config) ? config['customManagers'] : undefined;

  const pins = Array.isArray(managers)
    ? managers.flatMap((manager: unknown) => collectChexPins(manager, workflowText))
    : [];

  return pins.length > 0
    ? undefined
    : `renovate.json: no custom manager captures the @zgeoff/chex pin in ${chexPinPath}, so Renovate never bumps it`;
}

function parseConfig(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

function collectChexPins(manager: unknown, workflowText: string): string[] {
  if (!isRecord(manager) || manager['customType'] !== 'regex') {
    return [];
  }

  const filePatterns = collectStrings(manager['managerFilePatterns']);

  if (!filePatterns.some((pattern) => isPathMatch(pattern, chexPinPath))) {
    return [];
  }

  return collectStrings(manager['matchStrings']).flatMap((matchString) => {
    const groups = parseRegExp(matchString)?.exec(workflowText)?.groups;
    const version = groups?.['currentValue'];

    return groups?.['depName'] === '@zgeoff/chex' && version !== undefined ? [version] : [];
  });
}

function collectStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item: unknown): item is string => typeof item === 'string')
    : [];
}

// Renovate reads a file pattern between slashes as a regex, and any other as a glob.
function isPathMatch(pattern: string, path: string): boolean {
  if (pattern.length > 1 && pattern.startsWith('/') && pattern.endsWith('/')) {
    return parseRegExp(pattern.slice(1, -1))?.test(path) ?? false;
  }

  return new Bun.Glob(pattern).match(path);
}

function parseRegExp(source: string): RegExp | undefined {
  try {
    return new RegExp(source, 'u');
  } catch {
    return undefined;
  }
}
