import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { createOtherRealmTimeout } from '../test-utils/create-other-realm-timeout.ts';
import { defineBench } from './define-bench.ts';
import { parseBenchDefinition } from './parse-bench-definition.ts';

test('it accepts what defineBench returns', () => {
  const parsed = parseBenchDefinition(
    defineBench({ name: 'boil', budget: '5ms', concurrency: [1, 4], run: () => {} }),
  );

  expect(parsed).toStrictEqual({
    kind: 'parsed',
    definition: { name: 'boil', budgetMs: 5, concurrency: [1, 4], prepare: expect.any(Function) },
  });
});

test('it measures at concurrency 1 alone when the definition has no concurrency', () => {
  const parsed = parseBenchDefinition({ name: 'boil', budgetMs: 5, prepare: () => 1 });

  expect(parsed).toStrictEqual({
    kind: 'parsed',
    definition: { name: 'boil', budgetMs: 5, concurrency: [1], prepare: expect.any(Function) },
  });
});

test.each<readonly [string, unknown]>([
  ['null', null],
  ['a string', 'boil'],
  ['an object with no prepare', { name: 'boil', budgetMs: 5 }],
  ['an object whose budget is text', { name: 'boil', budgetMs: '5ms', prepare: () => 1 }],
  [
    'an object whose concurrency repeats a level',
    { name: 'boil', budgetMs: 5, concurrency: [2, 2], prepare: () => 1 },
  ],
])('it refuses %s', (_title, value) => {
  expect(parseBenchDefinition(value)).toStrictEqual({
    kind: 'refused',
    reason: 'the default export is no defineBench result',
  });
});

test('it fails to prepare when prepare yields no step', () => {
  const parsed = parseBenchDefinition({ name: 'boil', budgetMs: 5, prepare: () => 1 });

  invariant(parsed.kind === 'parsed');

  expect(parsed.definition.prepare()).rejects.toThrow(
    'the benchmark "boil" prepared no step to measure',
  );
});

test('it returns no promise from the step of a synchronous run', async () => {
  const parsed = parseBenchDefinition(defineBench({ name: 'stir', budget: '5ms', run: () => {} }));

  invariant(parsed.kind === 'parsed');

  const prepared = await parsed.definition.prepare();

  expect(prepared.step()).toBeUndefined();
});

test('it returns a promise from the step of an async run that settles after the run', async () => {
  const calls: string[] = [];

  const parsed = parseBenchDefinition(
    defineBench({
      name: 'steep',
      budget: '5ms',
      run: async () => {
        await Promise.resolve();

        calls.push('steeped');
      },
    }),
  );

  invariant(parsed.kind === 'parsed');

  const prepared = await parsed.definition.prepare();

  await prepared.step();

  expect(calls).toStrictEqual(['steeped']);
});

test('it returns a step that settles after a run whose promise comes from another realm', async () => {
  const events: string[] = [];

  const parsed = parseBenchDefinition(
    defineBench({
      name: 'steep',
      budget: '5ms',
      run: () =>
        createOtherRealmTimeout(1, () => {
          events.push('steeped');
        }),
    }),
  );

  invariant(parsed.kind === 'parsed');

  const prepared = await parsed.definition.prepare();

  await prepared.step();

  events.push('stepped');

  expect(events).toStrictEqual(['steeped', 'stepped']);
});

test('it keeps the disposal of the setup result', async () => {
  const disposals: string[] = [];

  const parsed = parseBenchDefinition(
    defineBench({
      name: 'boil',
      budget: '5ms',
      setup: () =>
        Promise.resolve({
          [Symbol.asyncDispose]: () => {
            disposals.push('dispose');

            return Promise.resolve();
          },
        }),
      run: () => {},
    }),
  );

  invariant(parsed.kind === 'parsed');

  const prepared = await parsed.definition.prepare();

  await prepared.dispose();

  expect(disposals).toStrictEqual(['dispose']);
});
