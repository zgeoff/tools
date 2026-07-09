import { expect, test } from 'bun:test';
import type { ASTNode } from '../types.ts';
import { collectASTNodes } from './collect-ast-nodes.ts';
import { isASTNode } from './is-ast-node.ts';
import { needsBlankLine } from './needs-blank-line.ts';
import { parseSource } from './parse-source.ts';

/**
 * Parses a two-statement fixture inside an async function body and returns
 * the block container with the first two statements, so each test can probe
 * one adjacent pair. Throws with the parser's message if the fixture is
 * broken — unreachable for the known-valid fixtures below.
 */
function parsePair(body: string): { container: ASTNode; prev: ASTNode; next: ASTNode } {
  const parsed = parseSource(`async function f(x) {\n${body}\n}`, 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  const [fn] = collectASTNodes(parsed.program.body);
  const fnBody = fn?.body;
  const container = isASTNode(fnBody) ? fnBody : undefined;
  const [prev, next] = collectASTNodes(container?.body);

  if (container === undefined || prev === undefined || next === undefined) {
    throw new TypeError('fixture must parse to a function holding at least two statements');
  }

  return { container, prev, next };
}

test('it always pads inside a class body', () => {
  const parsed = parseSource('class C {\n  a = 1;\n  b = 2;\n}', 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  const [decl] = collectASTNodes(parsed.program.body);
  const declBody = decl?.body;
  const classBody = isASTNode(declBody) ? declBody : undefined;
  const [a, b] = collectASTNodes(classBody?.body);

  if (classBody === undefined || a === undefined || b === undefined) {
    throw new TypeError('fixture must parse to a class holding two members');
  }

  expect(needsBlankLine(classBody, a, b)).toBeTrue();
});

test('it pads after a var block before a non-var statement', () => {
  const pair = parsePair('const a = 1;\nuse(a);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two var declarations', () => {
  const pair = parsePair('const a = 1;\nlet b = 2;');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads after a using declaration before a statement of another kind', () => {
  const pair = parsePair('using s = open();\nuse(s);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two plain using declarations', () => {
  const pair = parsePair('using a = openA();\nusing b = openB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it does not pad between two await using declarations', () => {
  const pair = parsePair('await using a = await openA();\nawait using b = await openB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads between an await using and a plain using declaration', () => {
  const pair = parsePair('await using a = await openA();\nusing b = openB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it treats an await using without an awaited initializer as awaited', () => {
  const pair = parsePair('await using a = openA();\nusing b = openB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it pads before a return statement', () => {
  const pair = parsePair('use(x);\nreturn x;');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it pads after a function declaration', () => {
  const pair = parsePair('function g() {}\nuse(x);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it pads on both sides of a control-flow statement', () => {
  const before = parsePair('use(x);\nif (x) { use(x); }');
  const after = parsePair('if (x) { use(x); }\nuse(x);');

  expect(needsBlankLine(before.container, before.prev, before.next)).toBeTrue();
  expect(needsBlankLine(after.container, after.prev, after.next)).toBeTrue();
});

test('it pads at the boundary between a call and a mutation', () => {
  const pair = parsePair('use(x);\nx = 1;');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two statements of the same kind', () => {
  const pair = parsePair('use(x);\nlog(x);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads at the boundary between a method call and a bare call', () => {
  const pair = parsePair("fs.writeFileSync(file, src);\nexpect(check(file)).toBe('changed');");

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two method calls', () => {
  const pair = parsePair('fs.writeFileSync(a, x);\nfs.writeFileSync(b, y);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it treats a member call chained onto a bare call result as a bare call', () => {
  const pair = parsePair('expect(a).toBe(1);\nuse(b);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it keeps the call kind through a wrapping await', () => {
  const pair = parsePair('await db.users.create(a);\nawait expect(p).toReject();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two awaited method calls', () => {
  const pair = parsePair('await db.users.create(a);\nawait db.sessions.create(b);');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads at the boundary between an instantiation and a call-headed declaration', () => {
  const pair = parsePair('const a = new Map();\nconst b = build();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two instantiation-headed declarations', () => {
  const pair = parsePair('const a = new Map();\nconst b = new Set();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads at the boundary between awaited and non-awaited declarations', () => {
  const pair = parsePair('const a = await load();\nconst b = build();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between two awaited declarations', () => {
  const pair = parsePair('const a = await loadA();\nconst b = await loadB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it treats an await inside the head chain as awaited', () => {
  const pair = parsePair('const a = (await load()).prop;\nconst b = await loadB();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it treats await in argument position as non-awaited', () => {
  const pair = parsePair('const a = build(await load());\nconst b = build();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it treats an await under a ternary head as non-awaited', () => {
  const pair = parsePair('const a = x ? await load() : build();\nconst b = build();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});

test('it pads at the boundary between awaited and non-awaited call statements', () => {
  const pair = parsePair('await warm();\nreset();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it pads at the boundary between awaited and non-awaited assignments', () => {
  const pair = parsePair('x = await load();\nx = build();');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeTrue();
});

test('it does not pad between kindless statements', () => {
  const pair = parsePair('debugger;\ndebugger;');

  expect(needsBlankLine(pair.container, pair.prev, pair.next)).toBeFalse();
});
