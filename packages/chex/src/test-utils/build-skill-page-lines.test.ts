import { expect, test } from 'bun:test';
import { buildSkillPageLines } from './build-skill-page-lines.ts';

test('it builds the frontmatter and a body of the given words, ten sentences a line', () => {
  const lines = buildSkillPageLines({
    name: 'kettle',
    description: 'Boils water for the team.',
    bodyWords: 60,
  });

  expect(lines).toStrictEqual([
    '---',
    'name: kettle',
    'description:',
    '  Boils water for the team.',
    '---',
    '',
    'The tool reads one file. '.repeat(10).trim(),
    'The tool reads one file.',
    'The tool reads one file.',
  ]);
});

test('it writes the metadata kind into the frontmatter', () => {
  const lines = buildSkillPageLines({
    name: 'kettle',
    description: 'Rules for every kettle change.',
    kind: 'rule-set',
    bodyWords: 5,
  });

  expect(lines.slice(4, 6)).toStrictEqual(['metadata:', '  kind: rule-set']);
});

test('it refuses a word count that is not whole five-word sentences', () => {
  expect(() =>
    buildSkillPageLines({ name: 'kettle', description: 'Boils water.', bodyWords: 7 }),
  ).toThrow('a skill page body holds whole five-word sentences');
});
