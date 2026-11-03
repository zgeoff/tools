import { expect, test } from 'bun:test';
import { parseSourceOrThrow } from './parse-source-or-throw.ts';

test('it returns the program of a source that parses', () => {
  const parsed = parseSourceOrThrow('const pot = 1;\n');

  expect(parsed.program).toMatchObject({
    type: 'Program',
    body: [{ type: 'VariableDeclaration', kind: 'const' }],
  });
});

test('it throws the parse error of a source that does not parse', () => {
  expect(() => parseSourceOrThrow('const = (((\n')).toThrow(TypeError);
});
