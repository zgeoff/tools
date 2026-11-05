import type { BenchComparisonRow, BenchSideTimes } from './types.ts';

const header = [
  'bench',
  'concurrency',
  'base median',
  'base spread',
  'head median',
  'head spread',
  'change',
] as const;

export function formatBenchComparison(rows: readonly BenchComparisonRow[]): string {
  const cells: readonly (readonly string[])[] = [header, ...rows.map((row) => formatCells(row))];

  const widths = header.map((_, column) =>
    Math.max(...cells.map((line) => line[column]?.length ?? 0)),
  );

  return cells
    .map((line) =>
      line
        .map((cell, column) =>
          column === line.length - 1 ? cell : cell.padEnd((widths[column] ?? 0) + 2),
        )
        .join(''),
    )
    .map((line) => `${line}\n`)
    .join('');
}

function formatCells(row: BenchComparisonRow): readonly string[] {
  return [
    row.name,
    String(row.concurrency),
    formatTime(row.base?.medianMs),
    formatTime(row.base?.spreadMs),
    formatTime(row.head?.medianMs),
    formatTime(row.head?.spreadMs),
    formatChange(row.base, row.head),
  ];
}

function formatTime(timeMs: number | undefined): string {
  return timeMs === undefined ? '-' : `${timeMs.toFixed(2)}ms`;
}

// A base median of zero gives no ratio to show.
function formatChange(base: BenchSideTimes | null, head: BenchSideTimes | null): string {
  if (base === null || head === null || base.medianMs === 0) {
    return '-';
  }

  const changePercent = ((head.medianMs - base.medianMs) / base.medianMs) * 100;

  return `${changePercent < 0 ? '' : '+'}${changePercent.toFixed(1)}%`;
}
