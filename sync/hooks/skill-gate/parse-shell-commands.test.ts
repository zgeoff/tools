import { expect, test } from 'bun:test';
import { parseShellCommands } from './parse-shell-commands.ts';

test('it splits a command line into simple commands at each separator', () => {
  expect(parseShellCommands('cd src && ls || head -n 1; pwd')).toStrictEqual([
    {
      words: [
        { text: 'cd', literal: true },
        { text: 'src', literal: true },
      ],
      redirects: [],
      stdin: null,
      enters: 0,
      leaves: 0,
    },
    { words: [{ text: 'ls', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
    {
      words: [
        { text: 'head', literal: true },
        { text: '-n', literal: true },
        { text: '1', literal: true },
      ],
      redirects: [],
      stdin: null,
      enters: 0,
      leaves: 0,
    },
    { words: [{ text: 'pwd', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
  ]);
});

test('it removes quotes and escapes from a word', () => {
  expect(parseShellCommands(`echo 'a b' "c \\"d\\"" e\\ f`)).toStrictEqual([
    {
      words: [
        { text: 'echo', literal: true },
        { text: 'a b', literal: true },
        { text: 'c "d"', literal: true },
        { text: 'e f', literal: true },
      ],
      redirects: [],
      stdin: null,
      enters: 0,
      leaves: 0,
    },
  ]);
});

test('it marks a word with a parameter, a substitution or a glob as not literal', () => {
  expect(parseShellCommands('ls "$HOME" $(pwd)/a `pwd` *.ts ~/a')).toStrictEqual([
    {
      words: [
        { text: 'ls', literal: true },
        { text: '', literal: false },
        { text: '/a', literal: false },
        { text: '', literal: false },
        { text: '*.ts', literal: false },
        { text: '~/a', literal: false },
      ],
      redirects: [],
      stdin: null,
      enters: 0,
      leaves: 0,
    },
  ]);
});

test('it attaches each redirect to its command and drops the file descriptor number', () => {
  expect(parseShellCommands('bun test 2>err.log >>out.log 2>&1')).toStrictEqual([
    {
      words: [
        { text: 'bun', literal: true },
        { text: 'test', literal: true },
      ],
      redirects: [
        { operator: '>', target: { text: 'err.log', literal: true } },
        { operator: '>>', target: { text: 'out.log', literal: true } },
        { operator: '>&', target: { text: '1', literal: true } },
      ],
      stdin: null,
      enters: 0,
      leaves: 0,
    },
  ]);
});

test('it takes a here document as the stdin of its command and skips its body', () => {
  expect(parseShellCommands("cat <<-'EOF' > a.txt\n\tx > b.txt\n\tEOF\npwd")).toStrictEqual([
    {
      words: [{ text: 'cat', literal: true }],
      redirects: [
        { operator: '<<-', target: { text: 'EOF', literal: true } },
        { operator: '>', target: { text: 'a.txt', literal: true } },
      ],
      stdin: '\tx > b.txt\n',
      enters: 0,
      leaves: 0,
    },
    { words: [{ text: 'pwd', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
  ]);
});

test('it counts the subshells that open before a command and close after it', () => {
  expect(parseShellCommands('(cd /srv && (pwd)); ls')).toStrictEqual([
    {
      words: [
        { text: 'cd', literal: true },
        { text: '/srv', literal: true },
      ],
      redirects: [],
      stdin: null,
      enters: 1,
      leaves: 0,
    },
    { words: [{ text: 'pwd', literal: true }], redirects: [], stdin: null, enters: 1, leaves: 2 },
    { words: [{ text: 'ls', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
  ]);
});

test('it runs each side of a pipe in its own subshell', () => {
  expect(parseShellCommands('cd src | cat; pwd')).toStrictEqual([
    {
      words: [
        { text: 'cd', literal: true },
        { text: 'src', literal: true },
      ],
      redirects: [],
      stdin: null,
      enters: 1,
      leaves: 1,
    },
    { words: [{ text: 'cat', literal: true }], redirects: [], stdin: null, enters: 1, leaves: 1 },
    { words: [{ text: 'pwd', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
  ]);
});

test('it gives a here document to the command whose redirect asked for it, before a pipe', () => {
  expect(parseShellCommands("python3 - <<'EOF' | cat\nprint('x')\nEOF")).toStrictEqual([
    {
      words: [
        { text: 'python3', literal: true },
        { text: '-', literal: true },
      ],
      redirects: [{ operator: '<<', target: { text: 'EOF', literal: true } }],
      stdin: "print('x')\n",
      enters: 1,
      leaves: 1,
    },
    { words: [{ text: 'cat', literal: true }], redirects: [], stdin: null, enters: 1, leaves: 1 },
  ]);
});

test('it skips a comment to the end of its line', () => {
  expect(parseShellCommands('# echo x > a.txt\npwd')).toStrictEqual([
    { words: [{ text: 'pwd', literal: true }], redirects: [], stdin: null, enters: 0, leaves: 0 },
  ]);
});

test.each([["echo 'open"], ['echo "open'], ['echo $(pwd'], ['echo `pwd']])(
  'it returns null for the unclosed command %j',
  (command) => {
    expect(parseShellCommands(command)).toBeNull();
  },
);
