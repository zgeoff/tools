import { statSync } from 'node:fs';
import { addLedgerLoads } from './add-ledger-loads.ts';
import { classifyCommandReads } from './classify-command-reads.ts';
import { collectCommandReads } from './collect-command-reads.ts';
import { parseSkillGateRules } from './parse-skill-gate-rules.ts';
import { resolveLedgerPath } from './resolve-state-dir.ts';
import type { HookInput } from './types.ts';

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
