// Throws rather than return an empty list, which would let the ban test pass with nothing to check.
export function collectBannedVerbs(markdown: string): string[] {
  const list = findNestedList(markdown) ?? findInlineList(markdown);

  if (list === undefined) {
    throw new Error(
      "the code-style skill has no banned-verb bullet: neither '- Never start a name with one of these verbs.' with a nested list, nor '- Never start a name with' a list up to 'These verbs say nothing'",
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

const nestedBulletPattern =
  /\n- Never start a name with one of these verbs\.[^\n]*\n(?<items>(?: {2}[^\n]*(?:\n|$))+)/u;

// The skill follows an item's verbs with advice that names other code spans, such as `read`.
function findNestedList(markdown: string): string | undefined {
  const items = nestedBulletPattern.exec(markdown)?.groups?.['items'];

  return items
    ?.split(/\n\s*- /u)
    .map((item) => item.split(/[.;]/u)[0] ?? '')
    .join('\n');
}

// Markdown may wrap the closing sentence at any space.
const inlineBulletPattern =
  /\n- Never start a name with (?<list>`[\s\S]*?)These\s+verbs\s+say\s+nothing/u;

function findInlineList(markdown: string): string | undefined {
  return inlineBulletPattern.exec(markdown)?.groups?.['list'];
}
