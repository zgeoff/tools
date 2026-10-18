import { expect, test } from 'bun:test';
import { parseShellcheckOutput } from './parse-shellcheck-output.ts';

test('it reads a clean run as no findings', () => {
  expect(parseShellcheckOutput({ exitCode: 0, stdout: '', stderr: '' })).toStrictEqual([]);
});

test('it reports each problem at its path and line', () => {
  const stdout = [
    'a.sh:2:6: note: Double quote to prevent globbing and word splitting. [SC2086]',
    'b.sh:4:1: warning: Use cd ... || exit in case cd fails. [SC2164]',
    '',
  ].join('\n');

  expect(parseShellcheckOutput({ exitCode: 1, stdout, stderr: '' })).toStrictEqual([
    {
      path: 'a.sh',
      line: 2,
      message: 'shellcheck note: Double quote to prevent globbing and word splitting. [SC2086]',
    },
    {
      path: 'b.sh',
      line: 4,
      message: 'shellcheck warning: Use cd ... || exit in case cd fails. [SC2164]',
    },
  ]);
});

test.each([
  [
    'an exit above 1',
    { exitCode: 2, stdout: '', stderr: 'gone.sh: openBinaryFile: does not exist\n' },
    'shell: shellcheck failed: gone.sh: openBinaryFile: does not exist',
  ],
  [
    'an exit of 1 with no problem it can read',
    { exitCode: 1, stdout: 'Segmentation fault\n', stderr: 'out of memory\n' },
    'shell: shellcheck failed: out of memory',
  ],
  [
    'an exit of 1 with no output',
    { exitCode: 1, stdout: '', stderr: '' },
    'shell: shellcheck failed: ',
  ],
])('it throws on %s', (_label, result, message) => {
  expect(() => parseShellcheckOutput(result)).toThrowWithMessage(Error, message);
});
