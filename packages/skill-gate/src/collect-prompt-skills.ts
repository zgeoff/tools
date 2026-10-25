const SKILL_MENTION = /(?<![\w$])\$(?<skill>[\w][\w:.-]*)/gu;

// Codex loads a skill into the session when the prompt names it as $name.
export function collectPromptSkills(prompt: string): readonly string[] {
  const names = [...prompt.matchAll(SKILL_MENTION)].flatMap((found) => {
    const name = found.groups?.['skill']?.replace(/[.:-]+$/u, '');

    return name === undefined || name === '' ? [] : [name];
  });

  return [...new Set(names)];
}
