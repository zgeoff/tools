const durationPattern = /^(?<count>[1-9]\d*)(?<unit>ms|s)$/u;

// Returns null for text that is no duration, so the caller names the field it came from.
export function parseDuration(text: string): number | null {
  const groups = durationPattern.exec(text)?.groups;

  if (groups === undefined) {
    return null;
  }

  const count = Number(groups['count']);

  return groups['unit'] === 's' ? count * 1000 : count;
}
