// PACKAGE_TARGET_RESOLVE, step for step, from https://nodejs.org/api/esm.html#resolution-algorithm-specification
// A result is a target string, `null` for a blocked import, `undefined` where
// no condition matched, or one of the two errors below.
export const invalidTarget = Symbol('Invalid Package Target');
export const invalidResolution = Symbol('Invalid Module Specifier or Package Configuration');

// `lookup` holds the active `conditions`, `default` among them, and `isImports`
export default function resolvePackageTarget(target, patternMatch, lookup) {
  if (typeof target === 'string') {
    return resolveStringTarget(target, patternMatch, lookup.isImports);
  }

  if (Array.isArray(target)) {
    return resolveArrayTarget(target, patternMatch, lookup);
  }

  if (target === null) {
    return null;
  }

  return typeof target === 'object'
    ? resolveObjectTarget(target, patternMatch, lookup)
    : invalidTarget;
}

// step 1; a bare `imports` target stays a specifier for the caller to resolve
function resolveStringTarget(target, patternMatch, isImports) {
  if (!target.startsWith('./')) {
    const isInvalid = [
      !isImports,
      target.startsWith('../'),
      target.startsWith('/'),
      URL.canParse(target),
    ].includes(true);

    return isInvalid ? invalidTarget : buildPatternTarget(target, patternMatch);
  }

  if (hasInvalidSegment(target.split(/[/\\]/u).slice(1))) {
    return invalidTarget;
  }

  if (patternMatch !== null && hasInvalidSegment(patternMatch.split(/[/\\]/u))) {
    return invalidResolution;
  }

  return buildPatternTarget(target, patternMatch);
}

function buildPatternTarget(target, patternMatch) {
  return patternMatch === null ? target : target.replaceAll('*', patternMatch);
}

const invalidSegments = new Set(['', '.', '..', 'node_modules']);

function hasInvalidSegment(segments) {
  return segments.some((segment) => invalidSegments.has(decodeSegment(segment).toLowerCase()));
}

function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// step 2
function resolveObjectTarget(target, patternMatch, lookup) {
  const keys = Object.keys(target);

  if (keys.some((key) => isArrayIndex(key))) {
    return invalidResolution;
  }

  return keys
    .filter((key) => key === 'default' || lookup.conditions.has(key))
    .map((key) => resolvePackageTarget(target[key], patternMatch, lookup))
    .find((resolved) => resolved !== undefined);
}

// ECMA-262's array index: a canonical integer below 2 ** 32 - 1
function isArrayIndex(key) {
  return /^(?:0|[1-9]\d*)$/u.test(key) && Number(key) < 2 ** 32 - 1;
}

// step 3: an invalid entry or one with no match falls back to the next, and
// the last invalid entry is the result when none resolves
function resolveArrayTarget(target, patternMatch, lookup) {
  if (target.length === 0) {
    return null;
  }

  const results = target.map((entry) => resolvePackageTarget(entry, patternMatch, lookup));
  const index = results.findIndex((result) => result !== undefined && result !== invalidTarget);

  return index === -1 ? results.findLast((result) => result === invalidTarget) : results[index];
}
