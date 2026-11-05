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

test('it measures at concurrency 1 alone when the options name no concurrency', () => {
  const definition = defineBench({ name: 'boil', budget: '2s', run: () => {} });

  expect(definition.concurrency).toStrictEqual([1]);
});

test('it keeps the concurrency levels in the order the options give', () => {
  const definition = defineBench({
    name: 'boil',
    budget: '2s',
    concurrency: [4, 1],
    run: () => {},
  });

  expect(definition.concurrency).toStrictEqual([4, 1]);
});

test.each([
  ['an empty list', [], ''],
  ['a zero', [1, 0], '1, 0'],
  ['a fraction', [1.5], '1.5'],
  ['a repeated level', [4, 4], '4, 4'],
])('it refuses a concurrency with %s', (_title, concurrency, listText) => {
  expect(() =>
    defineBench({ name: 'boil', budget: '2s', concurrency, run: () => {} }),
  ).toThrowWithMessage(
    Error,
    `defineBench: the benchmark "boil" has the concurrency [${listText}], which is no list of distinct positive whole numbers`,
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

  expect(prepared.dispose()).resolves.toBeUndefined();
});
