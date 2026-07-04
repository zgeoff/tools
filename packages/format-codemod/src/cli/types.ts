import type { TransformResult } from '../types.ts';

export type CliMode = 'write' | 'check' | 'dry';

export type FileOutcome = 'ok' | 'changed' | 'failed' | 'skipped';

// Everything the entry needs to report one file: the outcome for exit-code
// logic, sizes for --bench, and the text to print — modules below the entry
// never write to stdout/stderr themselves.
export interface FileReport {
  readonly outcome: FileOutcome;
  readonly bytes: number;
  readonly parsed: boolean;
  readonly message: string | null;
  readonly stdout: string | null;
}

export interface FileEdit {
  readonly file: string;
  readonly src: string;
  readonly result: TransformResult;
}

export interface BenchStats {
  readonly files: number;
  readonly parsed: number;
  readonly bytes: number;
  readonly ms: number;
  readonly us_per_file: number;
  readonly mb_per_sec: number;
}
