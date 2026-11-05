import type { BenchDefinition, PreparedBench } from './define-bench.ts';
import { pickQuantile } from './pick-quantile.ts';

export interface BenchmarkResult {
  readonly concurrency: number;

  readonly medianMs: number;

  // The interquartile range of the measured times.
  readonly spreadMs: number;
}

// `prepare` runs once for every level, and the setup result is disposed of after the last level,
// even when a run throws.
export async function runBenchmark(
  definition: BenchDefinition,
  now: () => number,
): Promise<readonly BenchmarkResult[]> {
  const prepared = await definition.prepare();

  try {
    const results: BenchmarkResult[] = [];

    for (const concurrency of definition.concurrency) {
      const result = await runLevel(prepared, concurrency, now);

      results.push(result);
    }

    return results;
  } finally {
    await prepared.dispose();
  }
}

const warmUpRounds = 5;
const measuredRounds = 20;

async function runLevel(
  prepared: PreparedBench,
  concurrency: number,
  now: () => number,
): Promise<BenchmarkResult> {
  for (let round = 0; round < warmUpRounds; round += 1) {
    await runRound(prepared, concurrency, now);
  }

  const samples: number[] = [];

  for (let round = 0; round < measuredRounds; round += 1) {
    const roundSamples = await runRound(prepared, concurrency, now);

    samples.push(...roundSamples);
  }

  return {
    concurrency,
    medianMs: pickQuantile(samples, 0.5),
    spreadMs: pickQuantile(samples, 0.75) - pickQuantile(samples, 0.25),
  };
}

// Each call is timed on its own, so the times show how long one call waits under the load of the
// others, not how long the round took. A rejected call still waits for the rest of its round, so
// the setup result is never disposed of under a call that runs.
async function runRound(
  prepared: PreparedBench,
  concurrency: number,
  now: () => number,
): Promise<number[]> {
  const settled = await Promise.allSettled(
    Array.from({ length: concurrency }, async () => {
      const startMs = now();

      await prepared.step();

      return now() - startMs;
    }),
  );

  const rejected = settled.find((outcome) => outcome.status === 'rejected');

  if (rejected !== undefined) {
    throw rejected.reason;
  }

  return settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [outcome.value] : []));
}
