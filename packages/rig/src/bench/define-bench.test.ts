import { expect, test } from 'bun:test';
import { defineBench } from './define-bench.ts';

test('it reads the budget as milliseconds', () => {
  const definition = defineBench({ name: 'boil', budget: '2s', run: () => {} });

  expect(definition.budgetMs).toBe(2000);
});

test('it refuses a budget that is no duration', () => {
  expect(() => defineBench({ name: 'boil', budget: 'fast', run: () => {} })).toThrowWithMessage(
    Error,
    'defineBench: the benchmark "boil" has the budget "fast", which is no duration such as \'50ms\' or \'2s\'',
  );
});

test('it types the run context from what setup returns', async () => {
  const seen: number[] = [];

  const definition = defineBench({
    name: 'pour',
    budget: '1s',
    setup: () => Promise.resolve({ kettle: { litres: 2 } }),
    run: (context) => {
      seen.push(context.kettle.litres);
    },
  });

  const prepared = await definition.prepare();

  await prepared.step();

  expect(seen).toStrictEqual([2]);
});

test('it disposes of nothing when the setup result has no async dispose', async () => {
  const definition = defineBench({
    name: 'pour',
    budget: '1s',
    setup: () => Promise.resolve({ kettle: { litres: 2 } }),
    run: () => {},
  });

  const prepared = await definition.prepare();

  await expect(prepared.dispose()).resolves.toBeUndefined();
});
