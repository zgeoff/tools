// Formats skill names for a deny reason: "the `testing` skill", or "the `testing` and
// `project-testing` skills" without the leading article.
export function formatSkillList(skills: readonly string[]): string {
  const names = skills.map((skill) => `\`${skill}\``);
  const noun = names.length === 1 ? 'skill' : 'skills';

  if (names.length === 1) {
    return `${names[0]} ${noun}`;
  }

  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} ${noun}`;
}
