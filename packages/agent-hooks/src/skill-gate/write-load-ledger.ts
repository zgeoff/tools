import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { SessionLoads } from './types.ts';

export async function writeLoadLedger(
  ledgerPath: string | null,
  ledger: SessionLoads,
): Promise<void> {
  if (ledgerPath === null) {
    return;
  }

  try {
    await mkdir(path.dirname(ledgerPath), { recursive: true });

    // A reader outside the lock must never see a half-written file, which it would read as empty.
    const tempPath = `${ledgerPath}.${process.pid}.tmp`;

    await Bun.write(tempPath, JSON.stringify(ledger));

    await rename(tempPath, ledgerPath);
  } catch {
    // A ledger that cannot be written leaves the session's loads uncounted, and the gate then
    // denies the edit and names the skills to load again.
  }
}
