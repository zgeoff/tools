import { expect, test } from 'bun:test';
import type { ParsedSource } from '../types.ts';
import { buildEditsFromAST } from './build-edits-from-ast.ts';
import { parseSource } from './parse-source.ts';

function parse(source: string): ParsedSource {
  const parsed = parseSource(source, 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  return parsed;
}

test('it returns edits sorted last-to-first', () => {
  const source = 'const a = 1;\nuse(a);\nconst b = 2;\nuse(b);\n';
  const edits = buildEditsFromAST(source, parse(source));

  expect(edits).toHaveLength(3);
  expect(edits.map((edit) => edit.start)).toEqual([33, 20, 12]);
});

test('it collects edits from statement lists nested inside functions and blocks', () => {
  const source = 'function f() {\n  if (x) {\n    const a = 1;\n    use(a);\n  }\n}\n';
  const edits = buildEditsFromAST(source, parse(source));

  expect(edits).toEqual([{ start: 42, end: 47, replacement: '\n\n    ' }]);
});

test('it returns no edits for already-compliant source', () => {
  const source = 'const a = 1;\n\nuse(a);\n';

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});

test('it does not match exported declarations', () => {
  const source = 'export const a = 1;\nuse(a);\n';

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});

test('it does not pad between adjacent imports even when one is multiline', () => {
  const source = "import {\n  a,\n  b,\n} from 'x';\nimport { c } from 'y';\n";

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});

test('it pads between the last import and the first statement', () => {
  const source = "import {\n  a,\n  b,\n} from 'x';\nuse(a);\n";
  const edits = buildEditsFromAST(source, parse(source));

  expect(edits).toEqual([{ start: 30, end: 31, replacement: '\n\n' }]);
});

test('it plans a collapse for a blank line no rule requires', () => {
  const source = 'use(a);\n\nuse(b);\n';
  const edits = buildEditsFromAST(source, parse(source));

  expect(edits).toEqual([{ start: 7, end: 9, replacement: '\n' }]);
});

test('it does not collapse a blank line between adjacent imports', () => {
  const source = "import { a } from 'x';\n\nimport { c } from 'y';\n";

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});

test('it keeps the blank line between a single-line import and the first statement', () => {
  const source = "import { a } from 'x';\n\nuse(a);\n";

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});

test('it pads between a single-line import and a flush first statement', () => {
  const source = "import { a } from 'x';\nuse(a);\n";
  const edits = buildEditsFromAST(source, parse(source));

  expect(edits).toEqual([{ start: 22, end: 23, replacement: '\n\n' }]);
});

test('it does not collapse around a multiline statement', () => {
  const source = 'use(a);\n\ncallWith(\n  argOne,\n  argTwo,\n);\n\nuse(b);\n';

  expect(buildEditsFromAST(source, parse(source))).toBeEmpty();
});
