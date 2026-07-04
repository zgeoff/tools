import type { BenchStats, FileReport } from '../types.ts';

export function buildBenchStatsFromReports(reports: readonly FileReport[], ms: number): BenchStats {
  const bytes = reports.reduce((sum, r) => sum + r.bytes, 0);
  const parsed = reports.filter((r) => r.parsed).length;

  return {
    files: reports.length,
    parsed,
    bytes,
    ms,
    us_per_file: Math.round((ms * 1000) / reports.length),
    mb_per_sec: Math.round((bytes / 1024 / 1024 / (ms / 1000)) * 10) / 10,
  };
}
