import { expect, test } from 'bun:test';
import { createFakeClock } from './create-fake-clock.ts';
import { runClockUntil } from './run-clock-until.ts';

function setupTest() {
  return { clock: createFakeClock({ startMs: 1000 }) };
}

test('it returns at once when the condition already holds', async () => {
  const ctx = setupTest();

  ctx.clock.schedule(() => {}, 100);

  await runClockUntil(ctx.clock, () => true, { maxMs: 1000 });

  expect(ctx.clock.now()).toBe(1000);
  expect(ctx.clock.countPending()).toBe(1);
});

test('it steps to each next due time until the condition holds', async () => {
  const ctx = setupTest();
  let ticks = 0;

  const tick = (): void => {
    ticks += 1;

    ctx.clock.schedule(tick, 100);
  };

  ctx.clock.schedule(tick, 100);

  await runClockUntil(ctx.clock, () => ticks === 3, { maxMs: 10_000 });

  expect(ctx.clock.now()).toBe(1300);
});

test('it lets the code that a step woke run before it checks the condition', async () => {
  const ctx = setupTest();
  let state = 'waiting';

  void (async () => {
    await ctx.clock.sleep(500);
    await Promise.resolve();

    state = 'done';
  })();

  await runClockUntil(ctx.clock, () => state === 'done', { maxMs: 10_000 });

  expect(ctx.clock.now()).toBe(1500);
});

test('it waits for turns without moving the clock while nothing is pending', async () => {
  const ctx = setupTest();
  let turns = 0;

  const countTurn = (): void => {
    turns += 1;

    if (turns < 5) {
      setImmediate(countTurn);
    }
  };

  setImmediate(countTurn);

  await runClockUntil(ctx.clock, () => turns === 5, { maxMs: 10_000 });

  expect(ctx.clock.now()).toBe(1000);
});

test('it throws after 100 steps in a row with nothing scheduled', () => {
  const ctx = setupTest();
  let checks = 0;

  const outcome = runClockUntil(
    ctx.clock,
    () => {
      checks += 1;

      return false;
    },
    { maxMs: 10_000 },
  );

  expect(outcome).rejects.toThrow('nothing is scheduled and the condition is still false');
  expect(checks).toBe(101);
});

test('it counts only steps in a row, so a step that moves the clock resets the count', () => {
  const ctx = setupTest();
  let turns = 0;

  ctx.clock.schedule(() => {
    turns = 0;
  }, 10);

  const outcome = runClockUntil(
    ctx.clock,
    () => {
      turns += 1;

      return turns === 150;
    },
    { maxMs: 10_000 },
  );

  expect(outcome).rejects.toThrow('nothing is scheduled and the condition is still false');
});

test('it moves the clock to the limit, checks once more, and throws when the condition is false', () => {
  const ctx = setupTest();
  let fired = 0;

  ctx.clock.schedule(() => {
    fired += 1;
  }, 5000);

  const outcome = runClockUntil(ctx.clock, () => false, { maxMs: 2000 });

  expect(outcome).rejects.toThrow('the condition stayed false for 2000 ms of clock time');
  expect(ctx.clock.now()).toBe(3000);
  expect(fired).toBe(0);
});

test('it resolves when the condition holds at the limit check', async () => {
  const ctx = setupTest();
  let isOpen = false;

  ctx.clock.schedule(() => {}, 5000);

  const outcome = runClockUntil(
    ctx.clock,
    () => {
      isOpen = ctx.clock.now() >= 3000;

      return isOpen;
    },
    { maxMs: 2000 },
  );

  await expect(outcome).toResolve();

  expect(ctx.clock.now()).toBe(3000);
});
