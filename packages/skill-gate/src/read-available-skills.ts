import path from 'node:path';

export async function readAvailableSkills(skillsDir: string): Promise<readonly string[]> {
  const skills: string[] = [];

  const scan = new Bun.Glob('*/SKILL.md').scan({ cwd: skillsDir, followSymlinks: true });

  try {
    for await (const skillFile of scan) {
      skills.push(path.dirname(skillFile));
    }
  } catch {
    // Bun's glob scan throws when the skills folder is missing, and such a repo has no skills.
  }

  return skills;
}
