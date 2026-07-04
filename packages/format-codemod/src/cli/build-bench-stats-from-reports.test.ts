import { expect, test } from 'bun:test';
import { buildBenchStatsFromReports } from './build-bench-stats-from-reports.ts';

test('it sums bytes and counts parsed files across reports', () => {
  const reports = [
    { outcome: 'ok', bytes: 100, parsed: true, message: null, stdout: null },
    { outcome: 'failed', bytes: 50, parsed: false, message: 'PARSE-ERR x', stdout: null },
    { outcome: 'changed', bytes: 200, parsed: true, message: null, stdout: null },
  ] as const;

  const stats = buildBenchStatsFromReports(reports, 10);

  expect(stats).toMatchObject({ files: 3, parsed: 2, bytes: 350, ms: 10 });
});

test('it derives per-file and throughput figures from the elapsed time', () => {
  const reports = [
    { outcome: 'ok', bytes: 1024 * 1024, parsed: true, message: null, stdout: null },
    { outcome: 'ok', bytes: 1024 * 1024, parsed: true, message: null, stdout: null },
  ] as const;

  const stats = buildBenchStatsFromReports(reports, 1000);

  expect(stats).toMatchObject({ us_per_file: 500_000, mb_per_sec: 2 });
});
