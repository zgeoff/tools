import type { BenchReportEntry } from './bench-report-entry-schema.ts';
import type { BenchComparisonRow, BenchSideTimes } from './types.ts';

// Each side's entries name their bench file relative to that side's root, so the same file matches
// on both sides.
export function collectBenchComparison(
  baseEntries: readonly BenchReportEntry[],
  headEntries: readonly BenchReportEntry[],
): BenchComparisonRow[] {
  const headRows = headEntries.map((head) => {
    const base = baseEntries.find((candidate) => isSameLevel(candidate, head));

    return {
      file: head.file,
      name: head.name,
      concurrency: head.concurrency,
      base: base === undefined ? null : toSideTimes(base),
      head: toSideTimes(head),
    };
  });

  const baseOnlyRows = baseEntries
    .filter((base) => !headEntries.some((head) => isSameLevel(head, base)))
    .map((base) => ({
      file: base.file,
      name: base.name,
      concurrency: base.concurrency,
      base: toSideTimes(base),
      head: null,
    }));

  return [...headRows, ...baseOnlyRows];
}

function isSameLevel(left: BenchReportEntry, right: BenchReportEntry): boolean {
  return (
    left.file === right.file && left.name === right.name && left.concurrency === right.concurrency
  );
}

function toSideTimes(entry: BenchReportEntry): BenchSideTimes {
  return { medianMs: entry.medianMs, spreadMs: entry.spreadMs };
}
