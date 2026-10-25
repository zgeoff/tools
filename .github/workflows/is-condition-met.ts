export function isConditionMet(condition: string, values: ReadonlyMap<string, string>): boolean {
  return condition.split(' && ').every((comparison) => isComparisonMet(comparison, values));
}

function isComparisonMet(comparison: string, values: ReadonlyMap<string, string>): boolean {
  const match = /^(?<expression>[\w.-]+) (?<operator>==|!=) '(?<expected>[^']*)'$/u.exec(
    comparison,
  );

  if (match?.groups === undefined) {
    throw new Error(`unsupported condition: ${comparison}`);
  }

  const expression = match.groups['expression'] ?? '';
  const value = values.get(expression);

  if (value === undefined) {
    throw new Error(`no value for ${expression}`);
  }

  return (value === match.groups['expected']) === (match.groups['operator'] === '==');
}
