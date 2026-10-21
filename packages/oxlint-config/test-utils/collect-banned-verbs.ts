export function collectBannedVerbs(markdown: string): string[] {
  const start = markdown.indexOf('### Banned verbs');
  const end = markdown.indexOf('### Changing the table');
  const paragraph = markdown.slice(start, end);
  const banned: string[] = [];

  for (const match of paragraph.matchAll(/`(?<verb>[a-z]+)`/gu)) {
    const preceding = paragraph.slice(0, match.index);
    const verb = match.groups?.['verb'];

    if (
      verb !== undefined &&
      countOccurrences(preceding, '(') === countOccurrences(preceding, ')')
    ) {
      banned.push(verb);
    }
  }

  return banned;
}

function countOccurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}
