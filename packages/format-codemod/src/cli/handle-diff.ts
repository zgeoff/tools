import fs from 'node:fs';
import { buildUnifiedDiff } from './build-unified-diff.ts';
import type { CliMode, FileEdit } from './types.ts';

export interface DiffOutput {
  readonly message: string | null;
  readonly stdout: string | null;
}

// Reached only when the file needs edits. Write mode saves the file here — the
// one file-system effect below the entry; what to print is returned, never
// printed, because the entry owns the output streams.
export function handleDiff(edit: FileEdit, mode: CliMode): DiffOutput {
  if (mode === 'check') {
    return { message: `DIFF  ${edit.file}  ${edit.result.edits} edit(s)`, stdout: null };
  }

  if (mode === 'dry') {
    return { message: null, stdout: buildUnifiedDiff(edit.src, edit.result.output, edit.file) };
  }
  fs.writeFileSync(edit.file, edit.result.output);

  return { message: `WROTE ${edit.file}  ${edit.result.edits} edit(s)`, stdout: null };
}
