import type { BenchDefinition } from './define-bench.ts';
import type { BenchmarkResult } from './run-benchmark.ts';

export function formatBenchmarkResult(
  definition: BenchDefinition,
  results: readonly BenchmarkResult[],
): string {
  return results
    .map((result) => {
      const verdict = result.medianMs > definition.budgetMs ? 'over budget' : 'within budget';

      return `bench ${definition.name} at concurrency ${result.concurrency}: median ${result.medianMs.toFixed(2)}ms, spread ${result.spreadMs.toFixed(2)}ms, budget ${definition.budgetMs}ms, ${verdict}\n`;
    })
    .join('');
}
