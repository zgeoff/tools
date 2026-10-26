import { expect, test } from 'bun:test';
import type { ShellActionHandlers, ShellContextTable } from './parse-shell-words.ts';
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
  ['echo ready >|output.txt', []],
  ['echo ready >| output.txt | cat', ['|']],
  ['bun run lint >>lint.log &>>all.log', []],
  ['bun run lint <&3 >&- 3<&-', []],
  ['exec 3<>state.txt', []],
  ['bun run lint < input.txt > output.txt', []],
  ['cat <<< "a | b"', []],
  [String.raw`bun run lint \>& bun run test`, ['&']],
  ['echo "$(bun install && bun run lint)"', ['&&']],
  ['echo $(git log | head)', ['|']],
  ['echo "`git log; git status`"', [';']],
  [`echo "$(date '+%F; %T')"`, []],
  ['echo "$(( (1 | 2) && 3 ))"', []],
  ['echo $(( 1 | 2 )) | wc -c', ['|']],
  ['echo "$(( $(git log | wc -l) + 1 ))"', ['|']],
  ['bun run lint # then; test', []],
  ['bun run lint # then; test\nbun run test', ['\n']],
  ['# prepare | build\nbun run lint', ['\n']],
  [`echo \${VALUE:-a;b}`, []],
  [`echo "\${VALUE:-a | b}" && true`, ['&&']],
  [`echo \${VALUE:-$(git log | head)}`, ['|']],
  [`echo \${VALUE:-'a}b'} ; true`, [';']],
  ['echo ready\nbun run lint', ['\n']],
  ['echo `git log; git status`', [';']],
  [`echo \${VALUE:-\`echo one; echo two\`}`, [';']],
  [`echo "\${VALUE:-\`echo one; echo two\`}"`, [';']],
  [`echo \${VALUE:-$(( 1 | 2 ))} ; true`, [';']],
  [`echo "\${VALUE:-$(( 1 | 2 ))}" ; true`, [';']],
  [`echo "\${VALUE:-$(echo one; echo two)}"`, [';']],
  ['echo $(echo $(git log; git status))', [';']],
  ['echo $(echo `git log; git status`)', [';']],
  ['echo $(echo $(( 1 | 2 )); true)', [';']],
  [`echo $(echo \${VALUE:-a;b})`, []],
  ['echo `echo $(git log; git status)`', [';']],
  ['echo `echo $(( 1 | 2 ))` ; true', [';']],
  [`echo \`echo \${VALUE:-a;b}\``, []],
  ['echo `echo "a;b"`', []],
  ['echo $(( `git log | wc -l` + 1 ))', ['|']],
  ['echo $(( ( `git log | wc -l` ) + 1 ))', ['|']],
  ['echo $(( $(( 1 | 2 )) + 1 )) | cat', ['|']],
  [`echo $(( \${COUNT:-1} + 1 )) | cat`, ['|']],
  [`echo \${VALUE:-\${OTHER:-a;b}} ; true`, [';']],
  ['echo $(git log) | head', ['|']],
  ['echo "$( (true) "|" ) a"', []],
  ['echo "$( ( (true) ) "|" )"', []],
  ['echo `date` # a | b', []],
  ['echo $(( (1 + 2) * 3 )) | wc -c', ['|']],
  ['echo $( (cd docs; ls) | wc -l ) && true', [';', '|', '&&']],
  ['echo `git log | head` ; true', ['|', ';']],
  ['echo $(git log\ngit status)', ['\n']],
  [String.raw`echo "a \" | b" | cat`, ['|']],
  [String.raw`echo 'a\' | cat`, ['|']],
  [`echo \${VALUE:-"a}b"} ; true`, [';']],
  [`echo \${VALUE:-a\\}b;c} ; true`, [';']],
  [`echo $(( \${COUNT:-1} | 2 )) | wc -c`, ['|']],
  ['echo a#b | cat', ['|']],
  ['cat <<EOF\nready | set\nEOF', ['\n', '|', '\n']],
  ['echo "ready\nset"', []],
  ["echo 'ready\nset'", []],
  ['echo ready \\\nset', []],
])('it finds the operators %p holds, as %p', (command, operators) => {
  const words = parseShellWords(command);

  expect(words.filter((word) => word.isOperator).map((word) => word.text)).toStrictEqual(operators);
});

test.each([
  ['if true', { text: 'if', isQuoted: false, isOperator: false, isAssignment: false }],
  ['$(date)x y', { text: '$(date)x', isQuoted: false, isOperator: false, isAssignment: false }],
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

// Each row follows a rule of the Bash manual's Quoting section.
test.each([
  [String.raw`echo \;ls`, ['echo', ';ls']],
  ['echo a\\\nb', ['echo', 'ab']],
  [String.raw`echo 'a\b'`, ['echo', String.raw`a\b`]],
  [String.raw`echo 'a\'`, ['echo', 'a\\']],
  [String.raw`echo "a\;b"`, ['echo', String.raw`a\;b`]],
  [String.raw`echo "\$HOME \` \" \\"`, ['echo', '$HOME ` " \\']],
  ['echo "a\\\nb"', ['echo', 'ab']],
  [String.raw`echo $'can\'t'`, ['echo', "can't"]],
  [String.raw`echo $'a\tb\x41\101\u00e9\cA\z\\'`, ['echo', 'a\tbAA\u00E9\u0001\\z\\']],
  [`echo "$'a'"`, ['echo', "$'a'"]],
  [String.raw`$"bun" run lint`, ['bun', 'run', 'lint']],
  [String.raw`echo $'./caf\303\251.sh' $'\xc3\xa9'`, ['echo', './café.sh', 'é']],
  [String.raw`echo $'./lint.sh\0ignored\'more'x $'a\c@b'`, ['echo', './lint.shx', 'a']],
  [`echo "\${VALUE:-\\;'a'}"`, ['echo', `\${VALUE:-\\;'a'}`]],
  [`echo \${VALUE:-\\;'a'}`, ['echo', `\${VALUE:-;a}`]],
])('it reads the words of %p as %p', (command, texts) => {
  const words = parseShellWords(command);

  expect(words.filter((word) => !word.isOperator).map((word) => word.text)).toStrictEqual(texts);
});

test.each([
  [String.raw`echo $'can\'t' && bun run lint`, ['&&']],
  [String.raw`echo $'a\\' ; true`, [';']],
  [String.raw`echo $'a\0;b' ; true`, [';']],
  [`echo $'"a;b" \`c;d\` $(e;f) \${g;h} \\' \\\\' ; true`, [';']],
  [`echo '"a;b" \`c;d\` $(e;f) \${g;h} \\' ; true`, [';']],
  [`echo \`echo \\;\``, []],
  [`echo \`echo \\\\;\``, []],
  [`echo \`echo \\\\\\;\``, [';']],
  [`echo \`echo \\\\\\\\;\``, [';']],
  [`echo \`echo \\$(git log; git status)\``, [';']],
  [`echo \`echo \\"a;b\\"\``, [';']],
  [`echo "\`echo \\"a;b\\"\`"`, []],
])('it applies the quoting rules of %p, as %p', (command, operators) => {
  const words = parseShellWords(command);

  expect(words.filter((word) => word.isOperator).map((word) => word.text)).toStrictEqual(operators);
});

// A double quote holds no bare double quote, so that pair has its own rows.
test.each([
  ...[
    (inner: string) => inner,
    (inner: string) => `$(echo ${inner})`,
    (inner: string) => `\`echo ${inner}\``,
    (inner: string) => `\${VALUE:-${inner}}`,
    (inner: string) => `"$(echo ${inner})"`,
    (inner: string) => `"\`echo ${inner}\`"`,
    (inner: string) => `"\${VALUE:-${inner}}"`,
  ].flatMap((enclose) =>
    ["'a;b'", '"a;b"', String.raw`$'a\';b'`, '$"a;b"', String.raw`\;`].map((inner) =>
      enclose(inner),
    ),
  ),
  ...["'a;b'", String.raw`$'a\';b'`, String.raw`\;`].map((inner) => `"${inner}"`),
])('it keeps the quoted separator in %p out of the operators', (word) => {
  const words = parseShellWords(`echo ${word} ; true`);

  expect(words.filter((each) => each.isOperator).map((each) => each.text)).toStrictEqual([';']);
});

test('it fails the type check on a context table or a handler table that misses a key', () => {
  const rules: ShellContextTable['plain'] = {
    pickAction: () => ({ kind: 'break' }),
    parseEscape: () => ({ text: '', length: 1, isQuoting: false }),
    isTopLevel: false,
    isQuote: false,
  };

  // @ts-expect-error: the context table lacks the parameter context
  const contexts: ShellContextTable = {
    plain: rules,
    substitution: rules,
    group: rules,
    backtick: rules,
    'quoted-backtick': rules,
    'single-quote': rules,
    'ansi-c-quote': rules,
    'double-quote': rules,
    'quoted-parameter': rules,
    arithmetic: rules,
    'arithmetic-group': rules,
  };

  // @ts-expect-error: the handler table lacks the comment action
  const handlers: ShellActionHandlers = {
    text: () => 1,
    redirect: () => 1,
    escape: () => 2,
    open: () => 1,
    close: () => 1,
    break: () => 1,
    operator: () => 1,
  };

  expect([Object.keys(contexts).length, Object.keys(handlers).length]).toStrictEqual([11, 7]);
});
