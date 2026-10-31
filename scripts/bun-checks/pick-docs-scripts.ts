import { join } from 'node:path';

export const docsScriptsFolder = '.claude/skills/docs-writing/scripts';
export const visionScript = join(docsScriptsFolder, 'check-vision.sh');
export const skillScript = '.claude/skills/skill-writing/scripts/check-skill.sh';
const checkScripts = ['check-prose.sh', 'check-length.sh', 'check-links.sh'];

export interface PresentScripts {
  readonly vision: boolean;
  readonly skill: boolean;
}

// The docs-vision-check entry puts the vision check beside the docs scripts, and a repo that takes
// the skill-writing skill has the skill check, so each runs only where its entry delivered it.
export function pickDocsScripts(present: Readonly<PresentScripts>): string[] {
  return [
    ...checkScripts.map((script) => join(docsScriptsFolder, script)),
    ...(present.vision ? [visionScript] : []),
    ...(present.skill ? [skillScript] : []),
  ];
}
