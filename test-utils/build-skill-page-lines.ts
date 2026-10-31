import invariant from 'tiny-invariant';

export interface SkillPage {
  readonly name: string;
  readonly description: string;

  // The metadata kind, such as rule-set, which raises the word limits; a page without one is plain.
  readonly kind?: string;

  // The words of the body after the frontmatter, in sentences of five words.
  readonly bodyWords: number;
}

// Builds the lines of a SKILL.md whose body holds the given number of words, ten sentences a line.
export function buildSkillPageLines(page: Readonly<SkillPage>): string[] {
  invariant(page.bodyWords % 5 === 0, 'a skill page body holds whole five-word sentences');

  const sentences = page.bodyWords / 5;

  return [
    '---',
    `name: ${page.name}`,
    'description:',
    `  ${page.description}`,
    ...(page.kind === undefined ? [] : ['metadata:', `  kind: ${page.kind}`]),
    '---',
    '',
    ...Array.from({ length: Math.floor(sentences / 10) }, () =>
      'The tool reads one file. '.repeat(10).trim(),
    ),
    ...Array.from({ length: sentences % 10 }, () => 'The tool reads one file.'),
  ];
}
