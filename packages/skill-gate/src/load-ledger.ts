import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { SessionLoads } from './types.ts';

const loadLedgerSchema = z.object({
  skills: z.array(z.string()),
  readPaths: z.array(z.string()),
  compacted: z.boolean(),
});

export const EMPTY_LEDGER: SessionLoads = { skills: [], readPaths: [], compacted: false };

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

export function addLoads(
  ledger: SessionLoads,
  loads: Pick<SessionLoads, 'skills' | 'readPaths'>,
): SessionLoads {
  return {
    skills: [...new Set([...ledger.skills, ...loads.skills])],
    readPaths: [...new Set([...ledger.readPaths, ...loads.readPaths])],
    compacted: ledger.compacted,
  };
}

// A compaction voids earlier loads and reads, as it does in a Claude Code transcript.
export function voidLoads(): SessionLoads {
  return { skills: [], readPaths: [], compacted: true };
}
