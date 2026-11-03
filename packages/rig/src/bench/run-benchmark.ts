import type { BenchDefinition } from './define-bench.ts';
import { pickMedian } from './pick-median.ts';

export const warmUpRuns = 5;
export const measuredRuns = 20;

export interface BenchmarkResult {
  readonly medianMs: number;
}

// `prepare` runs once, then `run` warms up before the measured runs, and the median of those is the
// result. The setup result is disposed of after the measured runs, even when a run throws.
export async function runBenchmark(
  definition: BenchDefinition,
  now: () => number,
): Promise<BenchmarkResult> {
  const prepared = await definition.prepare();

  try {
    for (let index = 0; index < warmUpRuns; index += 1) {
      await prepared.step();
    }

    const samples: number[] = [];

    for (let index = 0; index < measuredRuns; index += 1) {
      const start = now();

      await prepared.step();

      samples.push(now() - start);
    }

    return { medianMs: pickMedian(samples) };
  } finally {
    await prepared.dispose();
  }
}
