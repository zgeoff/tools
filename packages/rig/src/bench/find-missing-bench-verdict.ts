import { pickNamedBenchFiles } from './pick-named-bench-files.ts';
import { toBenchName } from './to-bench-name.ts';
import type { BenchVerdict } from './types.ts';

// A benchmark that only the base has still compares, so the run stops only when neither side has
// a file to run. A run with no base passes no base files.
export function findMissingBenchVerdict(
  name: string | null,
  headBenchFiles: readonly string[],
  baseBenchFiles: readonly string[],
): BenchVerdict | null {
  const benchFiles = [...headBenchFiles, ...baseBenchFiles];

  if (pickNamedBenchFiles(benchFiles, name).length > 0) {
    return null;
  }

  if (name === null) {
    return { output: [{ stream: 'out', text: 'rig: the repo has no benchmarks\n' }], exitCode: 0 };
  }

  const names = [...new Set(benchFiles.map((file) => toBenchName(file)))].join(', ');

  return {
    output: [
      {
        stream: 'err',
        text: `rig bench: no benchmark named "${name}"; the benchmarks are ${names}\n`,
      },
    ],
    exitCode: 1,
  };
}
