const RULES_PATH = '.claude/skill-gate.json';

export function pickRulesRepair(code: string | null, isTracked: boolean): string {
  if (code === 'EISDIR' && isTracked) {
    return `mv ${RULES_PATH} ${RULES_PATH}.broken && git checkout -- ${RULES_PATH}`;
  }

  if (code === 'EACCES') {
    return `chmod u+r ${RULES_PATH}`;
  }

  return `Move whatever is at ${RULES_PATH} aside and put the repo's rules file back in its place. Removing the path without putting the file back turns the gate off.`;
}
