import { expect, test } from 'bun:test';
import { parseShellWords } from './parse-shell-words.ts';

test.each([
  ['bun run lint', []],
  [`echo "a;b" 'c|d' "e && f"`, []],
  [String.raw`echo a\;b \|c`, []],
  ['bun install && bun run lint', ['&&']],
  ['bun run lint || true', ['||']],
  ['bun run lint | tee lint.log', ['|']],
  ['cd packages; bun run lint', [';']],
  ['bun run lint & bun run test', ['&']],
  ['bun run lint 2>&1 &>lint.log >&2 <&0', []],
  [String.raw`bun run lint \>& bun run test`, ['&']],
  ['echo "$(bun install && bun run lint)"', ['&&']],
  ['echo $(git log | head)', ['|']],
  ['echo "`git log; git status`"', [';']],
  [`echo "$(date '+%F; %T')"`, []],
  ['echo "$(( (1 | 2) && 3 ))"', []],
  ['echo $(( 1 | 2 )) | wc -c', ['|']],
  ['echo "$(( $(git log | wc -l) + 1 ))"', ['|']],
  ['bun run lint # then; test', []],
  ['echo ready\nbun run lint', ['\n']],
  ['echo "ready\nset"', []],
  ["echo 'ready\nset'", []],
  ['echo ready \\\nset', []],
])('it finds the operators %p holds, as %p', (command, operators) => {
  const words = parseShellWords(command);

  expect(words.filter((word) => word.isOperator).map((word) => word.text)).toStrictEqual(operators);
});

test.each([
  ['if true', { text: 'if', isQuoted: false, isOperator: false, isAssignment: false }],
  [`'if' true`, { text: 'if', isQuoted: true, isOperator: false, isAssignment: false }],
  [String.raw`\if true`, { text: 'if', isQuoted: true, isOperator: false, isAssignment: false }],
  ['"" true', { text: '', isQuoted: true, isOperator: false, isAssignment: false }],
  ['QEMU="1" bash', { text: 'QEMU=1', isQuoted: true, isOperator: false, isAssignment: true }],
  ['"QEMU=1" bash', { text: 'QEMU=1', isQuoted: true, isOperator: false, isAssignment: false }],
  [
    String.raw`QEMU\=1 bash`,
    { text: 'QEMU=1', isQuoted: true, isOperator: false, isAssignment: false },
  ],
])('it reads the first word of %p as %p', (command, first) => {
  const [word] = parseShellWords(command);

  expect(word).toStrictEqual(first);
});
