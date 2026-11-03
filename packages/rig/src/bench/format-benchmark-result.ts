import type { BenchDefinition } from './define-bench.ts';
import type { BenchmarkResult } from './run-benchmark.ts';

export function formatBenchmarkResult(
  definition: BenchDefinition,
  result: BenchmarkResult,
): string {
  const verdict = result.medianMs > definition.budgetMs ? 'over budget' : 'within budget';

  return `bench ${definition.name}: median ${result.medianMs.toFixed(2)}ms, budget ${definition.budgetMs}ms, ${verdict}\n`;
}
