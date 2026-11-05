import { findMissingBenchVerdict } from './find-missing-bench-verdict.ts';
import { pickNamedBenchFiles } from './pick-named-bench-files.ts';
import type { BenchVerdict } from './types.ts';

export type BenchPlan =
  | { readonly kind: 'finished'; readonly verdict: BenchVerdict }
  | { readonly kind: 'head'; readonly files: readonly string[] }
  | { readonly kind: 'comparison'; readonly baseRef: string; readonly files: readonly string[] };

// With a base, whether a benchmark is missing waits for the base's files.
export function pickBenchPlan(
  name: string | null,
  baseRef: string | null,
  headBenchFiles: readonly string[],
): BenchPlan {
  const files = pickNamedBenchFiles(headBenchFiles, name);

  if (baseRef !== null) {
    return { kind: 'comparison', baseRef, files };
  }

  const missing = findMissingBenchVerdict(name, headBenchFiles, []);

  return missing === null ? { kind: 'head', files } : { kind: 'finished', verdict: missing };
}
