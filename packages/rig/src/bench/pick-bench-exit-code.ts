import type { BenchReportEntry } from './bench-report-entry-schema.ts';

// The budget holds on the head only, so a base slower than its budget still lets the head pass.
export function pickBenchExitCode(
  sideExitCodes: readonly number[],
  headEntries: readonly BenchReportEntry[],
): number {
  const failedExitCode = sideExitCodes.find((exitCode) => exitCode !== 0);

  if (failedExitCode !== undefined) {
    return failedExitCode;
  }

  return headEntries.some((entry) => entry.medianMs > entry.budgetMs) ? 1 : 0;
}
