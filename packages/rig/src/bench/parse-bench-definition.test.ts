import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';
import { parseBenchDefinition } from './parse-bench-definition.ts';

test('it accepts what defineBench returns', () => {
  const parsed = parseBenchDefinition(defineBench({ name: 'boil', budget: '5ms', run: () => {} }));

  expect(parsed.kind).toBe('parsed');
});

test.each([
  ['null', null],
  ['a string', 'boil'],
  ['an object with no run', { name: 'boil', budgetMs: 5, setup: null }],
  ['an object whose budget is text', { name: 'boil', budgetMs: '5ms', setup: null, run: () => 1 }],
])('it refuses %s', (_title, value) => {
  expect(parseBenchDefinition(value)).toStrictEqual({
    kind: 'refused',
    reason: 'the default export is no defineBench result',
  });
});

test('it refuses a setup that is no function', () => {
  const value = { name: 'boil', budgetMs: 5, setup: 1, run: () => 1 };

  expect(parseBenchDefinition(value)).toStrictEqual({
    kind: 'refused',
    reason: 'its setup is no function',
  });
});
