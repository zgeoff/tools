import { expect, test } from 'bun:test';
import { systemClock } from './system-clock.ts';

test('it reads the time and sleeps for the duration', async () => {
  const startedAt = systemClock.now();

  await systemClock.sleep(20);

  expect(systemClock.now() - startedAt).toBeGreaterThanOrEqual(15);
});
