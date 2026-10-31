import { statSync } from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';
import { classifyCommandReads } from './classify-command-reads.ts';
import { collectCommandReads } from './collect-command-reads.ts';
import { collectPromptSkills } from './collect-prompt-skills.ts';
import { addLoads, readLoadLedger, voidLoads, writeLoadLedger } from './load-ledger.ts';
import { parseSkillGateRules } from './parse-skill-gate-rules.ts';
import { readAvailableSkills } from './read-available-skills.ts';
import { resolveLedgerPath } from './resolve-state-dir.ts';
import type { HookInput, LifecycleInput, SessionLoads } from './types.ts';
import { withLedgerLock } from './with-ledger-lock.ts';

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

// A Bash command that reads a skill's SKILL.md, or a file that a tool gate names as a reference,
// is how Codex loads a skill, since it has no Skill tool or Read tool.
export async function recordCommandReads(
  input: HookInput,
  command: string,
  projectDir: string,
  rulesText: string,
): Promise<void> {
  const parsedRules = parseSkillGateRules(rulesText);
  const references = parsedRules.ok ? parsedRules.tools.flatMap((gate) => gate.references) : [];

  const readFiles = collectCommandReads(command, input.cwd).filter(
    (file) => statSync(file, { throwIfNoEntry: false })?.isFile() === true,
  );

  const reads = classifyCommandReads(readFiles, projectDir, references);

  if (reads.skills.length === 0 && reads.readPaths.length === 0) {
    return;
  }

  await addLedgerLoads(resolveLedgerPath(input), reads);
}

async function addLedgerLoads(
  ledgerPath: string | null,
  loads: Pick<SessionLoads, 'skills' | 'readPaths'>,
): Promise<void> {
  await withLedgerLock(ledgerPath, async () => {
    const ledger = await readLoadLedger(ledgerPath);

    await writeLoadLedger(ledgerPath, addLoads(ledger, loads));
  });
}
