import { expect, test } from 'bun:test';
import { buildTickingClock } from './build-ticking-clock.ts';

test('it moves by the step at each read', () => {
  const now = buildTickingClock(3);

  expect([now(), now(), now()]).toStrictEqual([3, 6, 9]);
});
