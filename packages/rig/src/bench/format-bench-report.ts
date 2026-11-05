import type { BenchDefinition } from './define-bench.ts';
import type { BenchmarkResult } from './run-benchmark.ts';
import type { BenchReportEntry } from './types.ts';

export function formatBenchReport(
  definition: BenchDefinition,
  results: readonly BenchmarkResult[],
): string {
  return results
    .map((result) => {
      const entry: BenchReportEntry = {
        name: definition.name,
        concurrency: result.concurrency,
        medianMs: result.medianMs,
        spreadMs: result.spreadMs,
        budgetMs: definition.budgetMs,
      };

      return `${JSON.stringify(entry)}\n`;
    })
    .join('');
}
