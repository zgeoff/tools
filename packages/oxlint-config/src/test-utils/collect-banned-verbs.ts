// The bullet's lead, then its list up to the sentence after it; Markdown may wrap that sentence
// at any space.
const bulletPattern = /\n- Never start a name with (?<list>[\s\S]*?)These\s+verbs\s+say\s+nothing/u;

// Collects each code-span verb of the code-style skill's banned-verb bullet. The skills repo keeps
// that lead and that sentence, so a reworded bullet throws here, where a quiet empty list would let
// the ban test pass with nothing to check.
export function collectBannedVerbs(markdown: string): string[] {
  const list = bulletPattern.exec(markdown)?.groups?.['list'];

  if (list === undefined) {
    throw new Error(
      "the code-style skill has no bullet from '- Never start a name with' to 'These verbs say nothing'",
    );
  }

  const verbs = [...list.matchAll(/`(?<verb>[a-z]+)`/gu)].map(
    (match) => match.groups?.['verb'] ?? '',
  );

  if (verbs.length === 0) {
    throw new Error('the code-style skill bans no verb in its banned-verb bullet');
  }

  return verbs;
}
