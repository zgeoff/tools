import { expect, test } from 'bun:test';
import { trackSettled } from './track-settled.ts';

test('it reports a promise that has not settled, then one that resolved', async () => {
  const exit = Promise.withResolvers<number>();
  const state = trackSettled(exit.promise);
  const isSettledBefore = state.isSettled();

  exit.resolve(0);

  await state.settled;

  expect(isSettledBefore).toBeFalse();
  expect(state.isSettled()).toBeTrue();
});

test('it reports a promise that rejected as settled', async () => {
  const state = trackSettled(Promise.reject(new Error('the group still runs')));

  await state.settled;

  expect(state.isSettled()).toBeTrue();
});
