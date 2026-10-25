import path from 'node:path';

export interface ClassifiedReads {
  readonly skills: readonly string[];
  readonly readPaths: readonly string[];
}

// A skill's folder lives under .agents/skills for Codex or under .claude/skills for Claude Code,
// and the rules name a reference relative to .claude/skills.
export function classifyCommandReads(
  readFiles: readonly string[],
  projectDir: string,
  references: readonly string[],
): ClassifiedReads {
  const skillRoots = [
    path.join(projectDir, '.agents', 'skills'),
    path.join(projectDir, '.claude', 'skills'),
  ];

  const claudeRoot = path.join(projectDir, '.claude', 'skills');

  const skills = readFiles.flatMap((file) =>
    skillRoots.flatMap((root) => {
      const parts = path.relative(root, file).split(path.sep);
      const [name, fileName] = parts;

      return parts.length === 2 && name !== '..' && fileName === 'SKILL.md' && name !== undefined
        ? [name]
        : [];
    }),
  );

  const readPaths = readFiles.flatMap((file) =>
    references
      .filter((reference) => skillRoots.some((root) => path.resolve(root, reference) === file))
      .map((reference) => path.resolve(claudeRoot, reference)),
  );

  return { skills: [...new Set(skills)], readPaths: [...new Set(readPaths)] };
}
