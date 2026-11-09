import { join } from 'node:path';

export const docsScriptsFolder = '.claude/skills/docs-writing/scripts';
export const visionScript = join(docsScriptsFolder, 'check-vision.sh');
export const skillScript = '.claude/skills/skill-writing/scripts/check-skill.sh';

// The READMEs and the other docs that check-prose.sh reads when it gets no path. A check-prose.sh
// that repo-sync delivered before chex refuses a run with no path, so the runner names them.
export const readmePathspecs = [
  ':(glob)**/README.md',
  ':(exclude,glob).claude/**',
  ':(exclude,glob).agents/**',
];

export const prosePathspecs = [
  ':(glob)docs/**/*.md',
  ':(glob)**/results.md',
  ':(glob).agents/skills/**/*.md',
  ':(glob).claude/skills/**/*.md',
  ':(glob)skills/**/*.md',
  ':(glob)sync/skills/**/*.md',
];

export interface DocsCommandsInput {
  readonly vision: boolean;
  readonly skill: boolean;

  // The READMEs that readmePathspecs lists in the repo.
  readonly readmes: readonly string[];
}

export interface DocsCommand {
  readonly script: string;
  readonly args: readonly string[];
}

// The docs-vision-check entry puts the vision check beside the docs scripts, and a repo that takes
// the skill-writing skill has the skill check, so each runs only where its entry delivered it.
export function buildDocsCommands(input: Readonly<DocsCommandsInput>): DocsCommand[] {
  return [
    {
      script: join(docsScriptsFolder, 'check-prose.sh'),
      args: [...input.readmes, ...prosePathspecs],
    },
    { script: join(docsScriptsFolder, 'check-length.sh'), args: [] },
    { script: join(docsScriptsFolder, 'check-links.sh'), args: [] },
    ...(input.vision ? [{ script: visionScript, args: [] }] : []),
    ...(input.skill ? [{ script: skillScript, args: [] }] : []),
  ];
}
