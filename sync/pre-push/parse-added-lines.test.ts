import { expect, test } from 'bun:test';
import { parseAddedLines } from './parse-added-lines.ts';

test('it reads no lines from an empty log', () => {
  expect(parseAddedLines('')).toStrictEqual([]);
});

test('it reads each added line with its commit, path and new line number', () => {
  const patch = [
    '\u00001a2b3c4',
    '',
    'diff --git a/greet.txt b/greet.txt',
    'index 1111111..2222222 100644',
    '--- a/greet.txt',
    '+++ b/greet.txt',
    '@@ -2 +2,2 @@',
    '-hello',
    '+hello there',
    '+good day',
    '@@ -9,0 +11 @@',
    '+farewell',
    '\u00005d6e7f8',
    '',
    'diff --git a/notes/new.md b/notes/new.md',
    'new file mode 100644',
    'index 0000000..3333333',
    '--- /dev/null',
    '+++ b/notes/new.md',
    '@@ -0,0 +1 @@',
    '+a new note',
    '',
  ].join('\n');

  expect(parseAddedLines(patch)).toStrictEqual([
    { hash: '1a2b3c4', path: 'greet.txt', line: 2, text: 'hello there' },
    { hash: '1a2b3c4', path: 'greet.txt', line: 3, text: 'good day' },
    { hash: '1a2b3c4', path: 'greet.txt', line: 11, text: 'farewell' },
    { hash: '5d6e7f8', path: 'notes/new.md', line: 1, text: 'a new note' },
  ]);
});

test('it counts the unchanged lines that join two hunks into one', () => {
  const patch = [
    '\u00001a2b3c4',
    '',
    'diff --git a/greet.txt b/greet.txt',
    'index 1111111..2222222 100644',
    '--- a/greet.txt',
    '+++ b/greet.txt',
    '@@ -2,4 +2,4 @@',
    '-hello',
    '+hello there',
    ' good day',
    ' good night',
    '-farewell',
    '+farewell for now',
    '',
  ].join('\n');

  expect(parseAddedLines(patch)).toStrictEqual([
    { hash: '1a2b3c4', path: 'greet.txt', line: 2, text: 'hello there' },
    { hash: '1a2b3c4', path: 'greet.txt', line: 5, text: 'farewell for now' },
  ]);
});

test('it reads an added line that starts with ++ as content, not a header', () => {
  const patch = [
    '\u00001a2b3c4',
    '',
    'diff --git a/count.c b/count.c',
    '--- a/count.c',
    '+++ b/count.c',
    '@@ -4,0 +5 @@',
    '+++count;',
    '',
  ].join('\n');

  expect(parseAddedLines(patch)).toStrictEqual([
    { hash: '1a2b3c4', path: 'count.c', line: 5, text: '++count;' },
  ]);
});

test.each([
  ['a name with a space, which git ends with a tab', '+++ b/odd name.txt\t', 'odd name.txt'],
  [
    'a quoted name with escapes',
    String.raw`+++ "b/tab\there \"q\" back\\slash \303\251.txt"`,
    'tab\there "q" back\\slash \u00E9.txt',
  ],
])('it reads the path of %s', (_label, header, path) => {
  const patch = [
    '\u00001a2b3c4',
    '',
    'diff --git a/x b/x',
    '--- /dev/null',
    header,
    '@@ -0,0 +1 @@',
    '+text',
    '',
  ].join('\n');

  expect(parseAddedLines(patch)).toStrictEqual([{ hash: '1a2b3c4', path, line: 1, text: 'text' }]);
});

test('it reads no lines from a file the commit deletes or a binary file', () => {
  const patch = [
    '\u00001a2b3c4',
    '',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-old text',
    'diff --git a/logo.png b/logo.png',
    'new file mode 100644',
    'Binary files /dev/null and b/logo.png differ',
    '',
  ].join('\n');

  expect(parseAddedLines(patch)).toStrictEqual([]);
});
