import { readLoadLedger } from './read-load-ledger.ts';
import type { SessionLoads } from './types.ts';
import { withLedgerLock } from './with-ledger-lock.ts';
import { writeLoadLedger } from './write-load-ledger.ts';

export async function addLedgerLoads(
  ledgerPath: string | null,
  loads: Pick<SessionLoads, 'skills' | 'readPaths'>,
): Promise<void> {
  await withLedgerLock(ledgerPath, async () => {
    const ledger = await readLoadLedger(ledgerPath);

    await writeLoadLedger(ledgerPath, addLoads(ledger, loads));
  });
}

function addLoads(
  ledger: SessionLoads,
  loads: Pick<SessionLoads, 'skills' | 'readPaths'>,
): SessionLoads {
  return {
    skills: [...new Set([...ledger.skills, ...loads.skills])],
    readPaths: [...new Set([...ledger.readPaths, ...loads.readPaths])],
    compacted: ledger.compacted,
  };
}
