import type { CliMode, FileReport } from '../types.ts';
import { checkFile } from './check-file.ts';

// A failed file must fail the batch: --check would otherwise exit 0 having
// validated nothing, and a throw would kill the process mid-batch with the
// remaining files silently skipped.
export function processFile(file: string, mode: CliMode): FileReport {
  if (file.endsWith('.d.ts')) {
    return { outcome: 'skipped', bytes: 0, parsed: false };
  }

  try {
    return checkFile(file, mode);
  } catch (error) {
    console.error(`ERROR ${file}  ${error instanceof Error ? error.message : String(error)}`);

    return { outcome: 'failed', bytes: 0, parsed: false };
  }
}
