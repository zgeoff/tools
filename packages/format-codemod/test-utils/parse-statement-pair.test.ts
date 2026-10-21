import { expect, test } from 'bun:test';
import { parseStatementPair } from './parse-statement-pair.ts';

test('it returns the function body and its first two statements', () => {
  const pair = parseStatementPair('const pot = 1;\nboil(pot);\nserve();');

  expect(pair.container).toMatchObject({ type: 'BlockStatement' });
  expect(pair.previous).toMatchObject({ type: 'VariableDeclaration' });

  expect(pair.next).toMatchObject({
    type: 'ExpressionStatement',
    expression: { callee: { name: 'boil' } },
  });
});

test('it throws when the body holds fewer than two statements', () => {
  expect(() => parseStatementPair('boil();')).toThrowWithMessage(
    TypeError,
    'fixture must parse to a function holding at least two statements',
  );
});

test('it throws when the body does not parse', () => {
  expect(() => parseStatementPair('const = (((')).toThrow(TypeError);
});
