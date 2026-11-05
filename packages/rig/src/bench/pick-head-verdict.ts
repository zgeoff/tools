import type { ParsedBenchReport } from './parse-bench-report.ts';
import { pickBenchExitCode } from './pick-bench-exit-code.ts';
import type { BenchVerdict } from './types.ts';

export function pickHeadVerdict(report: ParsedBenchReport, headExitCode: number): BenchVerdict {
  if (report.kind === 'refused') {
    return { output: [{ stream: 'err', text: `rig bench: ${report.reason}\n` }], exitCode: 1 };
  }

  return { output: [], exitCode: pickBenchExitCode([headExitCode], report.entries) };
}
