import { expect, test } from 'bun:test';
import { makeFailOnCall } from './make-fail-on-call.ts';

test('it runs the effect on every call but the failing one, which rejects with the message', async () => {
  const poured: string[] = [];

  const pour = makeFailOnCall(
    (cup: string) => {
      poured.push(cup);

      return Promise.resolve();
    },
    2,
    'the kettle ran dry',
  );

  await pour('first');

  const second = pour('second');

  expect(second).rejects.toThrow('the kettle ran dry');

  await pour('third');

  expect(poured).toStrictEqual(['first', 'third']);
});
