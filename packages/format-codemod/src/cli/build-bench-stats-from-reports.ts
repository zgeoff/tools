import type { BenchStats, FileReport } from './types.ts';

export function buildBenchStatsFromReports(
  reports: readonly FileReport[],
  elapsedMs: number,
): BenchStats {
  const bytes = reports.reduce((sum, report) => sum + report.bytes, 0);
  const parsed = reports.filter((report) => report.parsed).length;

  return {
    files: reports.length,
    parsed,
    bytes,
    elapsed_ms: elapsedMs,
    us_per_file: Math.round((elapsedMs * 1000) / reports.length),
    mb_per_sec: Math.round((bytes / 1024 / 1024 / (elapsedMs / 1000)) * 10) / 10,
  };
}
