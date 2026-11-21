import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { runClockUntilSettled } from './run-clock-until-settled.ts';

test('it steps the clock through each sleep until the promise resolves, and returns its value', async () => {
  const clock = createFakeClock();

  const sleeper = (async () => {
    await clock.sleep(50);
    await clock.sleep(300);

    return 'rested';
  })();

  const result = await runClockUntilSettled(clock, sleeper);

  expect(result).toBe('rested');
  expect(clock.now()).toBe(350);
});

test('it rejects with the failure of a promise that rejects after a sleep', async () => {
  const clock = createFakeClock();

  const failing = (async () => {
    await clock.sleep(20);

    throw new Error('the kettle broke');
  })();

  await expect(runClockUntilSettled(clock, failing)).rejects.toThrowWithMessage(
    Error,
    'the kettle broke',
  );

  expect(clock.now()).toBe(20);
});
