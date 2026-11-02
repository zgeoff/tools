import { expect, test } from 'bun:test';
import { buildSteppingClock } from './build-stepping-clock.ts';

test('it starts at 0, and moves by each sleep and by nothing else', async () => {
  const clock = buildSteppingClock();
  const startMs = clock.now();

  await clock.sleep(50);
  await clock.sleep(300);

  expect(startMs).toBe(0);
  expect(clock.now()).toBe(350);
  expect(clock.sleep.mock.calls).toStrictEqual([[50], [300]]);
});
