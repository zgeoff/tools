import { z } from 'zod';
import type { SessionLoads } from './types.ts';

const loadLedgerSchema = z.object({
  skills: z.array(z.string()),
  readPaths: z.array(z.string()),
  compacted: z.boolean(),
});

const EMPTY_LEDGER: SessionLoads = { skills: [], readPaths: [], compacted: false };

export async function readLoadLedger(ledgerPath: string | null): Promise<SessionLoads> {
  if (ledgerPath === null) {
    return EMPTY_LEDGER;
  }

  const text = await Bun.file(ledgerPath)
    .text()
    .catch(() => null);

  if (text === null) {
    return EMPTY_LEDGER;
  }

  try {
    const parsed = loadLedgerSchema.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : EMPTY_LEDGER;
  } catch {
    return EMPTY_LEDGER;
  }
}
