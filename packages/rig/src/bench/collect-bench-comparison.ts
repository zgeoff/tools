import type { BenchComparisonRow, BenchReportEntry, BenchSideTimes } from './types.ts';

export function collectBenchComparison(
  baseEntries: readonly BenchReportEntry[],
  headEntries: readonly BenchReportEntry[],
): BenchComparisonRow[] {
  const headRows = headEntries.map((head) => {
    const base = baseEntries.find((candidate) => isSameLevel(candidate, head));

    return {
      name: head.name,
      concurrency: head.concurrency,
      base: base === undefined ? null : toSideTimes(base),
      head: toSideTimes(head),
    };
  });

  const baseOnlyRows = baseEntries
    .filter((base) => !headEntries.some((head) => isSameLevel(head, base)))
    .map((base) => ({
      name: base.name,
      concurrency: base.concurrency,
      base: toSideTimes(base),
      head: null,
    }));

  return [...headRows, ...baseOnlyRows];
}

function isSameLevel(left: BenchReportEntry, right: BenchReportEntry): boolean {
  return left.name === right.name && left.concurrency === right.concurrency;
}

function toSideTimes(entry: BenchReportEntry): BenchSideTimes {
  return { medianMs: entry.medianMs, spreadMs: entry.spreadMs };
}
