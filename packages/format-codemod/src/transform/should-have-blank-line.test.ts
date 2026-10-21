import { expect, test } from 'bun:test';
import { parseStatementPair } from '../../test-utils/parse-statement-pair.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';
import { isASTNode } from './is-ast-node.ts';
import { parseSource } from './parse-source.ts';
import { shouldHaveBlankLine } from './should-have-blank-line.ts';

test('it always pads inside a class body', () => {
  const parsed = parseSource('class C {\n  a = 1;\n  b = 2;\n}', 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  const [decl] = collectASTNodes(parsed.program.body);
  const declBody = decl?.body;
  const classBody = isASTNode(declBody) ? declBody : undefined;
  const [first, second] = collectASTNodes(classBody?.body);

  if (classBody === undefined || first === undefined || second === undefined) {
    throw new TypeError('fixture must parse to a class holding two members');
  }

  expect(shouldHaveBlankLine(classBody, first, second)).toBeTrue();
});

test('it pads after a var block before a non-var statement', () => {
  const pair = parseStatementPair('const a = 1;\nuse(a);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two var declarations', () => {
  const pair = parseStatementPair('const a = 1;\nlet b = 2;');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads after a using declaration before a statement of another kind', () => {
  const pair = parseStatementPair('using s = open();\nuse(s);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two plain using declarations', () => {
  const pair = parseStatementPair('using a = openA();\nusing b = openB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it does not pad between two await using declarations', () => {
  const pair = parseStatementPair('await using a = await openA();\nawait using b = await openB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads between an await using and a plain using declaration', () => {
  const pair = parseStatementPair('await using a = await openA();\nusing b = openB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it treats an await using without an awaited initializer as awaited', () => {
  const pair = parseStatementPair('await using a = openA();\nusing b = openB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads before a return statement', () => {
  const pair = parseStatementPair('use(x);\nreturn x;');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads after a function declaration', () => {
  const pair = parseStatementPair('function g() {}\nuse(x);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads on both sides of a control-flow statement', () => {
  const before = parseStatementPair('use(x);\nif (x) { use(x); }');
  const after = parseStatementPair('if (x) { use(x); }\nuse(x);');

  expect(shouldHaveBlankLine(before.container, before.previous, before.next)).toBeTrue();
  expect(shouldHaveBlankLine(after.container, after.previous, after.next)).toBeTrue();
});

test('it pads at the boundary between a call and a mutation', () => {
  const pair = parseStatementPair('use(x);\nx = 1;');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two statements of the same kind', () => {
  const pair = parseStatementPair('use(x);\nlog(x);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads at the boundary between a method call and a bare call', () => {
  const pair = parseStatementPair('fs.writeFileSync(file, src);\ncheck(file);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two method calls', () => {
  const pair = parseStatementPair('fs.writeFileSync(a, x);\nfs.writeFileSync(b, y);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats a member call chained onto a bare call result as a bare call', () => {
  const pair = parseStatementPair('parse(a).check();\nuse(b);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it keeps the call kind through a wrapping await', () => {
  const pair = parseStatementPair('await db.users.create(a);\nawait expect(p).toReject();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two awaited method calls', () => {
  const pair = parseStatementPair('await db.users.create(a);\nawait db.sessions.create(b);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads between two adjacent type aliases', () => {
  const pair = parseStatementPair("type A = 'x' | 'y';\ntype B = 'z';");

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads between two adjacent exported type aliases', () => {
  const pair = parseStatementPair("export type A = 'x' | 'y';\nexport type B = 'z';");

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads on both sides of an interface declaration', () => {
  const before = parseStatementPair('use(x);\ninterface A { x: number }');
  const after = parseStatementPair('interface A { x: number }\nuse(x);');

  expect(shouldHaveBlankLine(before.container, before.previous, before.next)).toBeTrue();
  expect(shouldHaveBlankLine(after.container, after.previous, after.next)).toBeTrue();
});

test('it pads at the boundary between an instantiation and a call-headed declaration', () => {
  const pair = parseStatementPair('const a = new Map();\nconst b = build();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two instantiation-headed declarations', () => {
  const pair = parseStatementPair('const a = new Map();\nconst b = new Set();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads at the boundary between awaited and non-awaited declarations', () => {
  const pair = parseStatementPair('const a = await load();\nconst b = build();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between two awaited declarations', () => {
  const pair = parseStatementPair('const a = await loadA();\nconst b = await loadB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats an await inside the head chain as awaited', () => {
  const pair = parseStatementPair('const a = (await load()).prop;\nconst b = await loadB();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats await in argument position as non-awaited', () => {
  const pair = parseStatementPair('const a = build(await load());\nconst b = build();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats an await under a ternary head as non-awaited', () => {
  const pair = parseStatementPair('const a = x ? await load() : build();\nconst b = build();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads at the boundary between awaited and non-awaited call statements', () => {
  const pair = parseStatementPair('await warm();\nreset();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it pads at the boundary between awaited and non-awaited assignments', () => {
  const pair = parseStatementPair('x = await load();\nx = build();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it does not pad between kindless statements', () => {
  const pair = parseStatementPair('debugger;\ndebugger;');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads at the boundary between a bare call and an expect statement', () => {
  const before = parseStatementPair('advance();\nexpect(x).toBe(1);');
  const after = parseStatementPair('expect(x).toBe(1);\nadvance();');

  expect(shouldHaveBlankLine(before.container, before.previous, before.next)).toBeTrue();
  expect(shouldHaveBlankLine(after.container, after.previous, after.next)).toBeTrue();
});

test('it does not pad between two expect statements', () => {
  const pair = parseStatementPair('expect(x).toBe(1);\nexpect(x).toBeFalse();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats an expect.* helper call as an expect statement', () => {
  const pair = parseStatementPair('expect.assertions(1);\nexpect(x).toBe(1);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it pads at the boundary between a method call and an expect.* helper call', () => {
  const pair = parseStatementPair('store.reset();\nexpect.assertions(1);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeTrue();
});

test('it treats a wrapping await as not changing the expect kind', () => {
  const pair = parseStatementPair('await expect(p).toReject();\nawait expect(q).toReject();');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});

test('it treats expect in argument position as not making an expect statement', () => {
  const pair = parseStatementPair('use(expect(x));\nrun(y);');

  expect(shouldHaveBlankLine(pair.container, pair.previous, pair.next)).toBeFalse();
});
