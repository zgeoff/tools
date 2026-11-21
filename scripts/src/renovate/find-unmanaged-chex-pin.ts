import { isRecord } from '../../../packages/std/src/guards/is-record.ts';

// The workflows that pin the chex release, each with one pin.
export const chexPinPaths = [
  '.github/workflows/bun-checks.yml',
  '.github/workflows/pr-body-check.yml',
] as const;

// Returns the fault when no custom manager of renovate.json captures the chex pin of the workflow
// at `path`, so Renovate would never bump it.
export function findUnmanagedChexPin(
  renovateText: string,
  workflowText: string,
  path: string,
): string | undefined {
  const config = parseConfig(renovateText);

  if (config === undefined) {
    return 'renovate.json is not valid JSON';
  }

  const managers = isRecord(config) ? config['customManagers'] : undefined;

  const pins = Array.isArray(managers)
    ? managers.flatMap((manager: unknown) => collectChexPins(manager, workflowText, path))
    : [];

  return pins.length > 0
    ? undefined
    : `renovate.json: no custom manager captures the @zgeoff/chex pin in ${path}, so Renovate never bumps it`;
}

function parseConfig(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

function collectChexPins(manager: unknown, workflowText: string, path: string): string[] {
  if (!isRecord(manager) || manager['customType'] !== 'regex') {
    return [];
  }

  const filePatterns = collectStrings(manager['managerFilePatterns']);

  if (!filePatterns.some((pattern) => isPathMatch(pattern, path))) {
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
