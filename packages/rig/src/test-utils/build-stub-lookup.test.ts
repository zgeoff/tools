import { expect, test } from 'bun:test';
import { buildStubLookup } from './build-stub-lookup.ts';

test('it answers a listed key with its answer', () => {
  const lookup = buildStubLookup<string | null>({ '/galley/kettle.txt': 'copper' }, null);

  expect(lookup('/galley/kettle.txt')).resolves.toBe('copper');
});

test('it answers a key it does not list with the missing answer', () => {
  const lookup = buildStubLookup<string | null>({ '/galley/kettle.txt': 'copper' }, null);

  expect(lookup('/galley/teapot.txt')).resolves.toBeNull();
});

test('it records each key it is asked for', async () => {
  const lookup = buildStubLookup<readonly string[]>({}, []);

  await lookup('/galley');
  await lookup('/pantry');

  expect(lookup.mock.calls).toStrictEqual([['/galley'], ['/pantry']]);
});
