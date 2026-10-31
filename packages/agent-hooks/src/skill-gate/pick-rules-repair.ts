import { match } from 'ts-pattern';
import type { UnreadableRulesCause } from './types.ts';

const RULES_PATH = '.claude/skill-gate.json';

export function pickRulesRepair(cause: UnreadableRulesCause, isTrackedFile: boolean): string {
  const plainRepair = `Move whatever is at ${RULES_PATH} aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.`;

  return match(cause)
    .with('folder', () =>
      isTrackedFile
        ? `mv ${RULES_PATH} ${RULES_PATH}.broken && git checkout -- ${RULES_PATH}`
        : plainRepair,
    )
    .with('file-permission', () => `chmod u+r ${RULES_PATH}`)
    .with('other', () => plainRepair)
    .exhaustive();
}
