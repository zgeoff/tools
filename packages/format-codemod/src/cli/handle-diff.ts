import fs from 'node:fs';
import { buildUnifiedDiff } from '../build-unified-diff.ts';
import type { CliMode, FileEdit } from '../types.ts';

// Reached only when the file needs edits: report, preview, or write per mode.
export function handleDiff(edit: FileEdit, mode: CliMode): void {
  if (mode === 'check') {
    console.error(`DIFF  ${edit.file}  ${edit.result.edits} edit(s)`);
  } else if (mode === 'dry') {
    process.stdout.write(buildUnifiedDiff(edit.src, edit.result.output, edit.file));
  } else {
    fs.writeFileSync(edit.file, edit.result.output);
    console.error(`WROTE ${edit.file}  ${edit.result.edits} edit(s)`);
  }
}
