import { expect, test } from 'bun:test';
import { systemClock as laneClock } from '../packages/rig/src/system-clock.ts';
import { systemClock } from './system-clock.ts';

test('it reads the time and sleeps for the duration', async () => {
  const startedAt = systemClock.now();

  await systemClock.sleep(20);

  expect(systemClock.now() - startedAt).toBeGreaterThanOrEqual(15);
});

test("it is the lane's clock, so a test and the lane read one clock", () => {
  expect(systemClock).toBe(laneClock);
});
