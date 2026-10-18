import { expect, test } from 'bun:test';
import { parseShfmtOutput } from './parse-shfmt-output.ts';

test('it reads a clean run as no findings', () => {
  expect(parseShfmtOutput({ exitCode: 0, stdout: '', stderr: '' })).toStrictEqual([]);
});

test('it reports each hunk of each file at its first changed line', () => {
  const stdout = [
    'diff a.sh.orig a.sh',
    '--- a.sh.orig',
    '+++ a.sh',
    '@@ -1,3 +1,3 @@',
    ' #!/usr/bin/env bash',
    '-if true;then echo "one";fi',
    '+if true; then echo "one"; fi',
    ' echo "2"',
    '@@ -9,3 +9,3 @@',
    ' echo "9"',
    '-if true;then echo "ten";fi',
    '+if true; then echo "ten"; fi',
    '',
    'diff b.sh.orig b.sh',
    '--- b.sh.orig',
    '+++ b.sh',
    '@@ -2,2 +2,2 @@',
    ' echo "start"',
    '-if true;then echo "yes";fi',
    '+if true; then echo "yes"; fi',
    '',
  ].join('\n');

  expect(parseShfmtOutput({ exitCode: 1, stdout, stderr: '' })).toStrictEqual([
    {
      path: 'a.sh',
      line: 2,
      message: 'shfmt would reformat this hunk; run shfmt -w a.sh to fix it',
    },
    {
      path: 'a.sh',
      line: 10,
      message: 'shfmt would reformat this hunk; run shfmt -w a.sh to fix it',
    },
    {
      path: 'b.sh',
      line: 3,
      message: 'shfmt would reformat this hunk; run shfmt -w b.sh to fix it',
    },
  ]);
});

test('it reports a parse error at its line', () => {
  expect(
    parseShfmtOutput({
      exitCode: 1,
      stdout: '',
      stderr: 'broken.sh:2:1: "if" must be followed by "then"\n',
    }),
  ).toStrictEqual([
    {
      path: 'broken.sh',
      line: 2,
      message: 'shfmt cannot parse the file: "if" must be followed by "then"',
    },
  ]);
});

test.each([
  [
    'an exit above 1 after a diff',
    {
      exitCode: 2,
      stdout: '--- a.sh.orig\n+++ a.sh\n@@ -1,1 +1,1 @@\n-echo\n+echo \n',
      stderr: 'fatal: out of memory\n',
    },
    'shell: shfmt failed: fatal: out of memory',
  ],
  [
    'a stderr line that is not a parse error beside a parse error',
    {
      exitCode: 1,
      stdout: '',
      stderr:
        'broken.sh:2:1: "if" must be followed by "then"\nopen gone.sh: no such file or directory\n',
    },
    'shell: shfmt failed: broken.sh:2:1: "if" must be followed by "then"\nopen gone.sh: no such file or directory',
  ],
  [
    'an exit of 1 with neither a diff nor a parse error',
    { exitCode: 1, stdout: '', stderr: '' },
    'shell: shfmt failed: ',
  ],
])('it throws on %s', (_label, result, message) => {
  expect(() => parseShfmtOutput(result)).toThrowWithMessage(Error, message);
});
