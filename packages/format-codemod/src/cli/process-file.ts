import { checkFile } from './check-file.ts';
import type { CLIMode, FileReport } from './types.ts';

// A failed file must fail the batch: --check would otherwise exit 0 having
// validated nothing, and a throw would kill the process mid-batch with the
// remaining files silently skipped.
export function processFile(file: string, mode: CLIMode): FileReport {
  if (file.endsWith('.d.ts')) {
    return { outcome: 'skipped', bytes: 0, parsed: false, message: null, stdout: null };
  }

  try {
    return checkFile(file, mode);
  } catch (error) {
    const message = `ERROR ${file}  ${error instanceof Error ? error.message : String(error)}`;

    return { outcome: 'failed', bytes: 0, parsed: false, message, stdout: null };
  }
}
