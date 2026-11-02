import { expect, test } from 'bun:test';
import { systemClock as laneClock } from '../src/system-clock.ts';
import { systemClock } from './system-clock.ts';

test("it is the lane's clock, so a test and the lane read one clock", () => {
  expect(systemClock).toBe(laneClock);
});
