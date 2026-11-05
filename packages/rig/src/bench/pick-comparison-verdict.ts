import { collectBenchComparison } from './collect-bench-comparison.ts';
import { formatBenchComparison } from './format-bench-comparison.ts';
import type { ParsedBenchReport } from './parse-bench-report.ts';
import { pickBenchExitCode } from './pick-bench-exit-code.ts';
import type { BenchVerdict } from './types.ts';

export interface BenchSideOutcome {
  readonly exitCode: number;

  readonly report: ParsedBenchReport;
}

export function pickComparisonVerdict(
  base: BenchSideOutcome,
  head: BenchSideOutcome,
): BenchVerdict {
  if (base.report.kind === 'refused') {
    return { output: [{ stream: 'err', text: `rig bench: ${base.report.reason}\n` }], exitCode: 1 };
  }

  if (head.report.kind === 'refused') {
    return { output: [{ stream: 'err', text: `rig bench: ${head.report.reason}\n` }], exitCode: 1 };
  }

  return {
    output: [
      {
        stream: 'out',
        text: formatBenchComparison(
          collectBenchComparison(base.report.entries, head.report.entries),
        ),
      },
    ],
    exitCode: pickBenchExitCode([head.exitCode, base.exitCode], head.report.entries),
  };
}
