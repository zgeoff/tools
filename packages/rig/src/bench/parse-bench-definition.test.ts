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
  ['an object with no prepare', { name: 'boil', budgetMs: 5 }],
  ['an object whose budget is text', { name: 'boil', budgetMs: '5ms', prepare: () => 1 }],
])('it refuses %s', (_title, value) => {
  expect(parseBenchDefinition(value)).toStrictEqual({
    kind: 'refused',
    reason: 'the default export is no defineBench result',
  });
});

test('it fails to prepare when prepare yields no step', async () => {
  const parsed = parseBenchDefinition({ name: 'boil', budgetMs: 5, prepare: () => 1 });

  expect(parsed.kind).toBe('parsed');

  const prepare = parsed.kind === 'parsed' ? parsed.definition.prepare() : Promise.resolve();

  await expect(prepare).rejects.toThrow('the benchmark "boil" prepared no step to measure');
});
