import { isRecord } from '../../packages/std/src/is-record.ts';

export function findFirstPartyScopeDrift(
  presetText: string,
  scopes: readonly string[],
): string | undefined {
  const expected = scopes.map((scope) => `${scope}**`);
  const preset = parsePreset(presetText);

  if (preset === undefined) {
    return 'default.json is not valid JSON';
  }

  const rules = isRecord(preset) ? preset['packageRules'] : undefined;

  const exemptScopes = Array.isArray(rules)
    ? [...new Set(rules.flatMap((rule: unknown) => collectAgeExemptScopes(rule)))]
    : [];

  if (exemptScopes.length === 0) {
    return `default.json: no package rule lifts the release-age wait for a scope (${expected.join(', ')})`;
  }

  const isSameList =
    exemptScopes.length === expected.length &&
    expected.every((name) => exemptScopes.includes(name));

  if (!isSameList) {
    return `default.json: the rules that lift the release-age wait match ${exemptScopes.join(', ')}, but the dependency-gates check treats ${expected.join(', ')} as first party`;
  }

  return undefined;
}

function parsePreset(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}

const scopePattern = /^@[^/]+\/\*\*$/u;

function collectAgeExemptScopes(rule: unknown): string[] {
  if (!isRecord(rule) || rule['minimumReleaseAge'] !== null) {
    return [];
  }

  const names: unknown = rule['matchPackageNames'];

  if (!Array.isArray(names)) {
    return [];
  }

  const scopes = names.filter(
    (name: unknown): name is string => typeof name === 'string' && scopePattern.test(name),
  );

  return scopes.length > 0 && scopes.length === names.length ? scopes : [];
}
