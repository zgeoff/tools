export function parseTextRecord(text: string): Record<string, string> | null {
  const parsed = parseJSON(text);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const entries: [string, unknown][] = Object.entries(parsed);

  const textEntries = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return textEntries.length === entries.length ? Object.fromEntries(textEntries) : null;
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}
