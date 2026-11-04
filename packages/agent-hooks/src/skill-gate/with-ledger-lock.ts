import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withFileLock } from '@zgeoff/std/with-file-lock';

// A holder runs for milliseconds, so a lock still held after this long belongs to a stuck hook.
const waitMs = 5000;

// The job runs without the lock when the lock stays busy or cannot be made, since a stuck hook
// must not hang the session. The lock file's name differs from the older hooks' lock folder.
export async function withLedgerLock<Result>(
  ledgerPath: string | null,
  job: () => Promise<Result>,
): Promise<Result> {
  if (ledgerPath === null) {
    return job();
  }

  const run = { isStarted: false };

  const startJob = (): Promise<Result> => {
    run.isStarted = true;

    return job();
  };

  try {
    await mkdir(path.dirname(ledgerPath), { recursive: true });

    const result = await withFileLock(`${ledgerPath}.flock`, startJob, { waitMs });

    return result.kind === 'ran' ? result.value : await startJob();
  } catch (error) {
    if (run.isStarted) {
      throw error;
    }

    return job();
  }
}
