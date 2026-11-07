import path from 'node:path';
import { match } from 'ts-pattern';
import { addLedgerLoads } from './add-ledger-loads.ts';
import { collectPromptSkills } from './collect-prompt-skills.ts';
import { readAvailableSkills } from './read-available-skills.ts';
import { resolveLedgerPath } from './resolve-state-dir.ts';
import type { LifecycleInput, SessionLoads } from './types.ts';
import { withLedgerLock } from './with-ledger-lock.ts';
import { writeLoadLedger } from './write-load-ledger.ts';

export async function recordLifecycle(input: LifecycleInput, projectDir: string): Promise<void> {
  const ledgerPath = resolveLedgerPath(input);

  await match(input.event)
    .with('PostCompact', () =>
      withLedgerLock(ledgerPath, () => writeLoadLedger(ledgerPath, voidLoads())),
    )
    .with('UserPromptSubmit', async () => {
      const mentioned = collectPromptSkills(input.prompt ?? '');

      if (mentioned.length === 0) {
        return;
      }

      const present = new Set([
        ...(await readAvailableSkills(path.join(projectDir, '.agents', 'skills'))),
        ...(await readAvailableSkills(path.join(projectDir, '.claude', 'skills'))),
      ]);

      const skills = mentioned.filter((skill) => present.has(skill));

      if (skills.length > 0) {
        await addLedgerLoads(ledgerPath, { skills, readPaths: [] });
      }
    })
    .exhaustive();
}

// A compaction voids earlier loads and reads, as it does in a Claude Code transcript.
function voidLoads(): SessionLoads {
  return { skills: [], readPaths: [], compacted: true };
}
