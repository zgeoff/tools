import { mkdir, rmdir, stat } from 'node:fs/promises';
import path from 'node:path';

export async function withLedgerLock<Result>(
  ledgerPath: string | null,
  job: () => Promise<Result>,
): Promise<Result> {
  if (ledgerPath === null) {
    return job();
  }

  const lockPath = `${ledgerPath}.lock`;

  const held = await acquireLock(lockPath);

  try {
    return await job();
  } finally {
    if (held) {
      await rmdir(lockPath).catch(() => null);
    }
  }
}

const RETRY_MS = 10;
const GIVE_UP_MS = 5000;

// A holder runs for milliseconds, so a lock this old belongs to a hook that died.
const STALE_MS = 30_000;

// mkdir fails when the folder exists, which makes the claim atomic across hook processes. A lock
// that cannot be had in time is skipped, since a stuck hook must not hang the session.
async function acquireLock(lockPath: string): Promise<boolean> {
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
  } catch {
    return false;
  }

  const deadline = Date.now() + GIVE_UP_MS;

  while (Date.now() < deadline) {
    try {
      await mkdir(lockPath);

      return true;
    } catch {
      const info = await stat(lockPath).catch(() => null);

      const isStale = info !== null && Date.now() - info.mtimeMs > STALE_MS;

      await (isStale ? rmdir(lockPath).catch(() => null) : Bun.sleep(RETRY_MS));
    }
  }

  return false;
}
