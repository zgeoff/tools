import { expect, test } from 'bun:test';
import { buildStubClock } from './build-stub-clock.ts';

test('it starts at the time it is given', () => {
  const clock = buildStubClock(5000);

  expect(clock.now()).toBe(5000);
});

test('it starts at the real time when it is given none', () => {
  const before = Date.now();
  const clock = buildStubClock();

  expect(clock.now()).toBeWithin(before, Date.now() + 1);
});

test('it moves forward by the duration it is given', () => {
  const clock = buildStubClock(5000);

  clock.advance(250);

  expect(clock.now()).toBe(5250);
});

test('it jumps to the time it is set to', () => {
  const clock = buildStubClock(5000);

  clock.setTime(100);

  expect(clock.now()).toBe(100);
});
