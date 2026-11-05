import { expect, test } from 'bun:test';
import { createOtherRealmTimeout } from './create-other-realm-timeout.ts';

test('it returns a promise that is no instance of the Promise of the test realm', () => {
  expect(createOtherRealmTimeout(1, () => {}) instanceof Promise).toBeFalse();
});

test('it settles the promise after the delay and after the callback', async () => {
  const events: string[] = [];
  const startMs = performance.now();

  await createOtherRealmTimeout(5, async () => {
    await Promise.resolve();

    events.push('timed out');
  });

  expect({ events, waited: performance.now() - startMs >= 4 }).toStrictEqual({
    events: ['timed out'],
    waited: true,
  });
});
