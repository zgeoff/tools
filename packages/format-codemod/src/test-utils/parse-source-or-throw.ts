import { parseSource } from '../transform/parse-source.ts';
import type { ParsedSource } from '../types.ts';

export function parseSourceOrThrow(source: string): ParsedSource {
  const parsed = parseSource(source, 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  return parsed;
}
