export function parseTextList(text: string): string[] | null {
  const parsed = parseJSON(text);

  if (!Array.isArray(parsed)) {
    return null;
  }

  const values = parsed.filter((value): value is string => typeof value === 'string');

  return values.length === parsed.length ? values : null;
}

function parseJSON(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);

    return parsed;
  } catch {
    return undefined;
  }
}
