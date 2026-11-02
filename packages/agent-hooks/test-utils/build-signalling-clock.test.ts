import { expect, test } from 'bun:test';
import { buildSignallingClock } from './build-signalling-clock.ts';

test('it resolves the first-sleep promise once a caller sleeps, and sleeps for real', async () => {
  const signalling = buildSignallingClock();

  const firstSettled = await Promise.race([
    signalling.firstSleep.then(() => 'slept'),
    Promise.resolve('not yet'),
  ]);

  const startedAt = signalling.clock.now();

  await signalling.clock.sleep(20);

  await signalling.firstSleep;

  expect(firstSettled).toBe('not yet');
  expect(signalling.clock.now() - startedAt).toBeGreaterThanOrEqual(15);
});
