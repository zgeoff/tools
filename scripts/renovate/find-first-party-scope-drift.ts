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

  const ruleNames = Array.isArray(rules)
    ? rules.map((rule: unknown) => parseMatchPackageNames(rule))
    : [];

  const firstPartyNames = ruleNames.find((names) => names.some((name) => expected.includes(name)));

  if (firstPartyNames === undefined) {
    return `default.json: no package rule matches a first-party scope (${expected.join(', ')})`;
  }

  const isSameList =
    firstPartyNames.length === expected.length &&
    expected.every((name) => firstPartyNames.includes(name));

  if (!isSameList) {
    return `default.json: the first-party rule matches ${firstPartyNames.join(', ')}, but the dependency-gates check treats ${expected.join(', ')} as first party`;
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

function parseMatchPackageNames(rule: unknown): string[] {
  const names = isRecord(rule) ? rule['matchPackageNames'] : undefined;

  return Array.isArray(names)
    ? names.filter((name: unknown): name is string => typeof name === 'string')
    : [];
}
