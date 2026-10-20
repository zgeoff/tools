import { expect, test } from 'bun:test';
import { parseCheckLengthOutput } from './parse-check-length-output.ts';

test('it reads a clean run as no findings', () => {
  const stdout = [
    'README.md: 40 lines (plain repo README; target 50, limit 60)',
    '',
    'check-prose: clean (candidates above, if any, need judgment only)',
    '',
    'check-skill: 1 skills, 0 errors, 0 warnings',
    '',
  ].join('\n');

  expect(parseCheckLengthOutput({ exitCode: 0, stdout, stderr: '' })).toStrictEqual([]);
});

test('it reports each failure of the length, prose and skill checks and drops every warning', () => {
  const stdout = [
    'README.md: 61 lines, over the plain repo README limit of 60 (target 50)',
    'packages/clock/README.md: 125 lines, over the package README target of 120 (limit 130; warning)',
    'tools/README.md: 40 lines (sub-package README; target 60, limit 70)',
    'docs/guide.md: 260 lines, over the docs cap of 250 (warning: cut points, then split at a code boundary)',
    '',
    'Banned words:',
    'docs/guide.md:4:Each city gets its own surface.',
    '',
    'Horizontal rules outside YAML frontmatter:',
    'docs/guide.md: 9',
    '',
    'Paragraphs over 250 words in a changed file (split each one; lists, tables and code blocks are exempt):',
    'docs/guide.md:12:300 words',
    '',
    'Paragraphs over 150 words in a changed file (warning; reread each one and split it where it defends a decision):',
    'README.md:20:180 words',
    '',
    'Candidates — filler words with term-of-art uses; cull the filler, keep the terms:',
    'README.md:3:Lantern is simple to run.',
    '',
    '',
    '.claude/skills/weather/SKILL.md: name forecast does not match the folder weather',
    '.claude/skills/weather/SKILL.md:8: link ../a.md#L3 has a line anchor; name the target in the link text instead',
    '.claude/skills/weather/SKILL.md: 520 lines, over 500; check that each section is one most tasks need (warning)',
    'check-skill: 1 skills, 2 errors, 1 warnings',
    '',
  ].join('\n');

  expect(parseCheckLengthOutput({ exitCode: 1, stdout, stderr: '' })).toStrictEqual([
    {
      path: 'README.md',
      line: 1,
      message: 'check-length: 61 lines, over the plain repo README limit of 60 (target 50)',
    },
    { path: 'docs/guide.md', line: 4, message: 'check-prose: Banned words' },
    {
      path: 'docs/guide.md',
      line: 9,
      message: 'check-prose: Horizontal rules outside YAML frontmatter',
    },
    {
      path: 'docs/guide.md',
      line: 12,
      message:
        'check-prose: Paragraphs over 250 words in a changed file (split each one; lists, tables and code blocks are exempt)',
    },
    {
      path: '.claude/skills/weather/SKILL.md',
      line: 1,
      message: 'check-skill: name forecast does not match the folder weather',
    },
    {
      path: '.claude/skills/weather/SKILL.md',
      line: 8,
      message:
        'check-skill: link ../a.md#L3 has a line anchor; name the target in the link text instead',
    },
  ]);
});

test('it throws with the reason when check-length exits on a bad argument', () => {
  expect(() =>
    parseCheckLengthOutput({
      exitCode: 2,
      stdout: '',
      stderr: 'usage: check-length.sh [--package <readme>]...\n',
    }),
  ).toThrowWithMessage(
    Error,
    'docs: check-length failed: usage: check-length.sh [--package <readme>]...',
  );
});

test('it throws with what check-length printed when it fails and prints no problem it can read', () => {
  expect(() =>
    parseCheckLengthOutput({
      exitCode: 1,
      stdout: 'README.md: 40 lines (plain repo README; target 50, limit 60)\n\n',
      stderr: 'bash: check-prose.sh: No such file or directory\n',
    }),
  ).toThrowWithMessage(
    Error,
    'docs: check-length failed, and it printed no problem the check can read:\nREADME.md: 40 lines (plain repo README; target 50, limit 60)\nbash: check-prose.sh: No such file or directory',
  );
});
