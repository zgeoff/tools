import { expect, test } from 'bun:test';
import { systemClock } from '../system-clock.ts';
import { processRuntime } from './process-runtime.ts';

test("it reads the time and sleeps on the system clock, as the rest of rig's code does", () => {
  expect(processRuntime.now).toBe(systemClock.now);
  expect(processRuntime.sleep).toBe(systemClock.sleep);
});
