import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { waitFor } from '../core/wait-for.ts';
import { createTempDir } from '../fs/create-temp-dir.ts';
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

test('it throws after idleMs of real time with nothing scheduled', async () => {
  const ctx = setupTest();
  const startedAtMs = performance.now();
  const outcome = runClockUntil(ctx.clock, () => false, { maxMs: 10_000, idleMs: 50 });

  await expect(outcome).rejects.toThrow('nothing is scheduled and the condition is still false');

  expect(performance.now() - startedAtMs).toBeGreaterThanOrEqual(50);
  expect(ctx.clock.now()).toBe(1000);
});

test('it resets the idle count when a step finds something pending', async () => {
  const ctx = setupTest();
  const startedAtMs = performance.now();
  let fired = false;

  void (async () => {
    const waitStartMs1 = performance.now();

    await waitFor(() => {
      if (performance.now() - waitStartMs1 < 30) {
        throw new Error('not yet');
      }
    });

    await ctx.clock.sleep(10);

    const waitStartMs2 = performance.now();

    await waitFor(() => {
      if (performance.now() - waitStartMs2 < 30) {
        throw new Error('not yet');
      }
    });

    fired = true;
  })();

  await runClockUntil(ctx.clock, () => fired, { maxMs: 10_000, idleMs: 50 });

  expect(performance.now() - startedAtMs).toBeGreaterThanOrEqual(60);
  expect(ctx.clock.now()).toBe(1010);
});

test('it waits out real file and process work between two sleeps', async () => {
  const ctx = setupTest();
  const file = join(createTempDir('clock-io').path, 'big.txt');
  const seen: number[] = [];

  void (async () => {
    await ctx.clock.sleep(100);
    await Bun.write(file, 'x'.repeat(4_000_000));

    const text = await Bun.file(file).text();

    seen.push(text.length);

    await Bun.spawn(['true']).exited;
    await ctx.clock.sleep(100);

    seen.push(ctx.clock.now());
  })();

  await runClockUntil(ctx.clock, () => seen.length === 2, { maxMs: 10_000 });

  expect(seen).toStrictEqual([4_000_000, 1200]);
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
