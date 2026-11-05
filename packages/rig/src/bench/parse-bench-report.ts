import type { BenchReportEntry } from './bench-report-entry-schema.ts';
import { benchReportEntrySchema } from './bench-report-entry-schema.ts';

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

  const parsed = benchReportEntrySchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
