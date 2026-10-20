import { expect, test } from 'bun:test';
import { parseCommitlintOutput } from './parse-commitlint-output.ts';

test('it reads a clean run as no findings', () => {
  expect(parseCommitlintOutput('1a2b3c4', { exitCode: 0, stdout: '', stderr: '' })).toStrictEqual(
    [],
  );
});

test('it reports each problem at line 1 of the commit', () => {
  const stdout = [
    '⧗   --- input ---',
    'Add the greeting',
    '✖   subject may not be empty [subject-empty]',
    '✖   type may not be empty [type-empty]',
    '',
    '✖   found 2 problems, 0 warnings',
    'ⓘ   Get help: https://github.com/conventional-changelog/commitlint/#what-is-commitlint',
    '',
  ].join('\n');

  expect(parseCommitlintOutput('1a2b3c4', { exitCode: 1, stdout, stderr: '' })).toStrictEqual([
    { path: '1a2b3c4', line: 1, message: 'commitlint: subject may not be empty [subject-empty]' },
    { path: '1a2b3c4', line: 1, message: 'commitlint: type may not be empty [type-empty]' },
  ]);
});

test.each([
  [
    'an exit above 1',
    {
      exitCode: 9,
      stdout: '✖   Please add rules to your `commitlint.config.js` [empty-rules]\n',
      stderr: '',
    },
    'commits: commitlint failed: ✖   Please add rules to your `commitlint.config.js` [empty-rules]',
  ],
  [
    'an exit of 1 with no problem it can read',
    { exitCode: 1, stdout: '', stderr: 'Error: Cannot find module "/gone.js"\n' },
    'commits: commitlint failed: Error: Cannot find module "/gone.js"',
  ],
])('it throws on %s', (_label, result, message) => {
  expect(() => parseCommitlintOutput('1a2b3c4', result)).toThrowWithMessage(Error, message);
});
