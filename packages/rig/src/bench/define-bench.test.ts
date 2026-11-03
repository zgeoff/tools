import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';

test('it reads the budget as milliseconds', () => {
  const definition = defineBench({ name: 'boil', budget: '2s', run: () => {} });

  expect(definition.budgetMs).toBe(2000);
  expect(definition.setup).toBeNull();
});

test('it refuses a budget that is no duration', () => {
  expect(() => defineBench({ name: 'boil', budget: 'fast', run: () => {} })).toThrowWithMessage(
    Error,
    'defineBench: the benchmark "boil" has the budget "fast", which is no duration such as \'50ms\' or \'2s\'',
  );
});
