export function isConditionMet(condition: string, values: ReadonlyMap<string, string>): boolean {
  return parseAlternatives(condition).some((alternative) =>
    alternative.every((comparison) => isComparisonMet(comparison, values)),
  );
}

interface Comparison {
  readonly expression: string;

  readonly equal: boolean;

  readonly expected: string;
}

// Reads the comparisons one at a time from the start, so a ` && ` or ` || `
// inside a quoted value stays part of that value. `&&` binds tighter than
// `||`, as in GitHub's expressions.
function parseAlternatives(condition: string): Comparison[][] {
  const comparisonPattern = /(?<expression>[\w.-]+) (?<operator>==|!=) '(?<expected>[^']*)'/uy;
  const alternatives: Comparison[][] = [];
  let comparisons: Comparison[] = [];
  let index = 0;

  while (true) {
    comparisonPattern.lastIndex = index;

    const groups = comparisonPattern.exec(condition)?.groups;

    if (groups === undefined) {
      throw new Error(`unsupported condition: ${condition}`);
    }

    comparisons.push({
      expression: groups['expression'] ?? '',
      equal: groups['operator'] === '==',
      expected: groups['expected'] ?? '',
    });

    index = comparisonPattern.lastIndex;

    if (index === condition.length) {
      return [...alternatives, comparisons];
    }

    if (condition.startsWith(' || ', index)) {
      alternatives.push(comparisons);

      comparisons = [];
    } else if (!condition.startsWith(' && ', index)) {
      throw new Error(`unsupported condition: ${condition}`);
    }

    index += ' && '.length;
  }
}

function isComparisonMet(comparison: Comparison, values: ReadonlyMap<string, string>): boolean {
  const value = values.get(comparison.expression);

  if (value === undefined) {
    throw new Error(`no value for ${comparison.expression}`);
  }

  return (value === comparison.expected) === comparison.equal;
}
