import { expect, test } from 'bun:test';
import type { ParsedSource } from '../types.ts';
import { buildEditsFromAST } from './build-edits-from-ast.ts';
import { parseSource } from './parse-source.ts';

/**
 * Narrows the parser's ParsedSource-or-error-message union for fixtures that
 * are known-valid TypeScript, sparing every test the same narrowing dance.
 * The throw is unreachable today but makes a fixture that stops parsing fail
 * loudly with the parser's own message.
 */
function parse(src: string): ParsedSource {
  const parsed = parseSource(src, 'file.ts');

  if (typeof parsed === 'string') {
    throw new TypeError(parsed);
  }

  return parsed;
}

test('it returns edits sorted last-to-first', () => {
  const src = 'const a = 1;\nuse(a);\nconst b = 2;\nuse(b);\n';
  const edits = buildEditsFromAST(src, parse(src));

  expect(edits).toHaveLength(3);
  expect(edits.map((e) => e.start)).toEqual([33, 20, 12]);
});

test('it collects edits from statement lists nested inside functions and blocks', () => {
  const src = 'function f() {\n  if (x) {\n    const a = 1;\n    use(a);\n  }\n}\n';
  const edits = buildEditsFromAST(src, parse(src));

  expect(edits).toEqual([{ start: 42, end: 47, replacement: '\n\n    ' }]);
});

test('it returns no edits for already-compliant source', () => {
  const src = 'const a = 1;\n\nuse(a);\n';

  expect(buildEditsFromAST(src, parse(src))).toBeEmpty();
});

test('it does not match exported declarations', () => {
  const src = 'export const a = 1;\nuse(a);\n';

  expect(buildEditsFromAST(src, parse(src))).toBeEmpty();
});

test('it does not pad between adjacent imports even when one is multiline', () => {
  const src = "import {\n  a,\n  b,\n} from 'x';\nimport { c } from 'y';\n";

  expect(buildEditsFromAST(src, parse(src))).toBeEmpty();
});

test('it pads between the last import and the first statement', () => {
  const src = "import {\n  a,\n  b,\n} from 'x';\nuse(a);\n";
  const edits = buildEditsFromAST(src, parse(src));

  expect(edits).toEqual([{ start: 30, end: 31, replacement: '\n\n' }]);
});
