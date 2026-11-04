// Collects each code-span verb of the code-style skill's banned-verb bullet, in either shape the
// skills repo has written it. A bullet in neither shape throws here, where a quiet empty list would
// let the ban test pass with nothing to check.
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

// The lead, then one indented item per line or wrapped line, up to the next line that is not
// indented.
const nestedBulletPattern =
  /\n- Never start a name with one of these verbs\.[^\n]*\n(?<items>(?: {2}[^\n]*(?:\n|$))+)/u;

// Each item names its verbs before its first full stop or semicolon; the text after it, such as
// `read` in the advice on a database read, is no banned verb.
function findNestedList(markdown: string): string | undefined {
  const items = nestedBulletPattern.exec(markdown)?.groups?.['items'];

  return items
    ?.split(/\n\s*- /u)
    .map((item) => item.split(/[.;]/u)[0] ?? '')
    .join('\n');
}

// The lead, then its list up to the sentence after it; Markdown may wrap that sentence at any
// space.
const inlineBulletPattern =
  /\n- Never start a name with (?<list>`[\s\S]*?)These\s+verbs\s+say\s+nothing/u;

function findInlineList(markdown: string): string | undefined {
  return inlineBulletPattern.exec(markdown)?.groups?.['list'];
}
