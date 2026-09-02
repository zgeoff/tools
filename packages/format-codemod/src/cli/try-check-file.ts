import { checkFile } from './check-file.ts';
import type { CLIMode, FileReport } from './types.ts';

export function tryCheckFile(file: string, mode: CLIMode): FileReport {
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
