// Collects each code-span verb of the code-style skill's `- Banned:` bullet, up to the end of its
// first sentence, where the free verbs begin.
export function collectBannedVerbs(markdown: string): string[] {
  const start = markdown.indexOf('\n- Banned:');

  if (start === -1) {
    return [];
  }

  const bullet = markdown.slice(start + 1).split(/\n(?:- |\n)/u)[0] ?? '';
  const [sentence] = bullet.split(/\.\s/u);

  return [...(sentence ?? '').matchAll(/`(?<verb>[a-z]+)`/gu)].map(
    (match) => match.groups?.['verb'] ?? '',
  );
}
