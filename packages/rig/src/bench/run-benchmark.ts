import type { BenchDefinition } from './define-bench.ts';
import { pickMedian } from './pick-median.ts';

export const warmUpRuns = 5;
export const measuredRuns = 20;

export interface BenchmarkResult {
  readonly medianMs: number;
}

// `setup` runs once, then `run` warms up before the measured runs, and the median of those is the
// result.
export async function runBenchmark(
  definition: BenchDefinition,
  now: () => number,
): Promise<BenchmarkResult> {
  const context = await definition.setup?.();

  for (let index = 0; index < warmUpRuns; index += 1) {
    await definition.run(context);
  }

  const samples: number[] = [];

  for (let index = 0; index < measuredRuns; index += 1) {
    const start = now();

    await definition.run(context);

    samples.push(now() - start);
  }

  return { medianMs: pickMedian(samples) };
}
