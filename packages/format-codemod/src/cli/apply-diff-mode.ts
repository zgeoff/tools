import fs from 'node:fs';
import { buildUnifiedDiff } from './build-unified-diff.ts';
import type { CLIMode, FileEdit } from './types.ts';

export interface DiffOutput {
  readonly message: string | null;
  readonly stdout: string | null;
}

export function applyDiffMode(edit: FileEdit, mode: CLIMode): DiffOutput {
  if (mode === 'check') {
    return { message: `DIFF  ${edit.file}  ${edit.result.edits} edit(s)`, stdout: null };
  }

  if (mode === 'dry') {
    return { message: null, stdout: buildUnifiedDiff(edit.src, edit.result.output, edit.file) };
  }

  fs.writeFileSync(edit.file, edit.result.output);

  return { message: `WROTE ${edit.file}  ${edit.result.edits} edit(s)`, stdout: null };
}
