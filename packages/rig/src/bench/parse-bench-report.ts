import type { BenchReportEntry } from './types.ts';

export type ParsedBenchReport =
  | { readonly kind: 'parsed'; readonly entries: readonly BenchReportEntry[] }
  | { readonly kind: 'refused'; readonly reason: string };

// A report holds what other processes appended, one JSON entry per line, so each line is checked
// instead of trusted.
export function parseBenchReport(text: string): ParsedBenchReport {
  const entries: BenchReportEntry[] = [];

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      continue;
    }

    const entry = parseEntry(line);

    if (entry === null) {
      return { kind: 'refused', reason: `the bench report holds a line that is no entry: ${line}` };
    }

    entries.push(entry);
  }

  return { kind: 'parsed', entries };
}

function parseEntry(line: string): BenchReportEntry | null {
  let value: unknown;

  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const file: unknown = Reflect.get(value, 'file');
  const name: unknown = Reflect.get(value, 'name');
  const concurrency: unknown = Reflect.get(value, 'concurrency');
  const medianMs: unknown = Reflect.get(value, 'medianMs');
  const spreadMs: unknown = Reflect.get(value, 'spreadMs');
  const budgetMs: unknown = Reflect.get(value, 'budgetMs');

  if (
    typeof file !== 'string' ||
    typeof name !== 'string' ||
    typeof concurrency !== 'number' ||
    typeof medianMs !== 'number' ||
    typeof spreadMs !== 'number' ||
    typeof budgetMs !== 'number'
  ) {
    return null;
  }

  return { file, name, concurrency, medianMs, spreadMs, budgetMs };
}
