import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { createFakeClock } from './create-fake-clock.ts';

function setupTest() {
  const controller = new AbortController();

  return { clock: createFakeClock({ startMs: 1000 }), controller };
}

test('it starts at the given time, and at 0 without one', () => {
  expect([createFakeClock({ startMs: 1000 }).now(), createFakeClock().now()]).toStrictEqual([
    1000, 0,
  ]);
});

test('it fires a timer when advance reaches its due time, and not before', () => {
  const ctx = setupTest();
  const fired: number[] = [];

  ctx.clock.schedule(() => fired.push(ctx.clock.now()), 500);
  ctx.clock.advance(499);

  expect(fired).toStrictEqual([]);

  ctx.clock.advance(1);

  expect(fired).toStrictEqual([1500]);
});

test('it reports no next due time once the timer fired', () => {
  const ctx = setupTest();

  ctx.clock.schedule(() => {}, 500);

  expect(ctx.clock.readNextDueMs()).toBe(1500);

  ctx.clock.advance(500);

  expect(ctx.clock.readNextDueMs()).toBeNull();
});

test('it resolves a sleep when advance reaches its due time, and counts it pending until then', async () => {
  const ctx = setupTest();
  const settled: string[] = [];

  const nap = (async () => {
    await ctx.clock.sleep(1000);

    settled.push('woke');
  })();

  expect(ctx.clock.countPending()).toBe(1);

  ctx.clock.advance(999);

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  expect(settled).toStrictEqual([]);

  ctx.clock.advance(1);

  await nap;

  expect(settled).toStrictEqual(['woke']);
  expect(ctx.clock.countPending()).toBe(0);
});

test('it records each delay as the caller passed it', () => {
  const ctx = setupTest();

  ctx.clock.schedule(() => {}, 500);
  ctx.clock.schedule(() => {}, -20);
  void ctx.clock.sleep(1000);
  expect(ctx.clock.delays).toStrictEqual([500, -20, 1000]);
});

test('it treats a negative delay as 0 when it schedules', () => {
  const ctx = setupTest();
  let fired = 0;

  ctx.clock.schedule(() => {
    fired += 1;
  }, -500);

  expect(ctx.clock.readNextDueMs()).toBe(1000);

  ctx.clock.advance(0);

  expect(fired).toBe(1);
});

test('it treats a negative delay as 0 when it sleeps', async () => {
  const ctx = setupTest();
  const nap = ctx.clock.sleep(-500);

  expect(ctx.clock.readNextDueMs()).toBe(1000);

  ctx.clock.advance(0);

  await expect(nap).toResolve();
});

test('it does nothing when a timer is cancelled twice', () => {
  const ctx = setupTest();
  let fired = 0;

  const cancel = ctx.clock.schedule(() => {
    fired += 1;
  }, 100);

  cancel();
  cancel();

  ctx.clock.advance(100);

  expect(fired).toBe(0);
  expect(ctx.clock.countPending()).toBe(0);
});

test('it does nothing when a timer is cancelled after it fired', () => {
  const ctx = setupTest();
  const cancel = ctx.clock.schedule(() => {}, 100);

  ctx.clock.advance(100);

  expect(() => {
    cancel();
  }).not.toThrow();
});

test('it resolves a sleep at once when its signal aborts, and stops counting it', async () => {
  const ctx = setupTest();
  const nap = ctx.clock.sleep(60_000, ctx.controller.signal);

  ctx.controller.abort();

  await expect(nap).toResolve();

  expect(ctx.clock.countPending()).toBe(0);
});

test('it resolves a sleep with an already aborted signal without waiting', async () => {
  const ctx = setupTest();

  ctx.controller.abort();

  await expect(ctx.clock.sleep(60_000, ctx.controller.signal)).toResolve();

  expect(ctx.clock.countPending()).toBe(0);
});

test('it removes its abort listener when a sleep ends by abort', async () => {
  const ctx = setupTest();
  const add = spyOn(ctx.controller.signal, 'addEventListener');
  const remove = spyOn(ctx.controller.signal, 'removeEventListener');

  onTestFinished(() => {
    add.mockRestore();
    remove.mockRestore();
  });

  const nap = ctx.clock.sleep(60_000, ctx.controller.signal);

  ctx.controller.abort();

  await nap;

  expect(remove.mock.calls.map((call) => call[0])).toStrictEqual(['abort']);
  expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]);
});

test('it removes its abort listener when a sleep ends by time', async () => {
  const ctx = setupTest();
  const add = spyOn(ctx.controller.signal, 'addEventListener');
  const remove = spyOn(ctx.controller.signal, 'removeEventListener');

  onTestFinished(() => {
    add.mockRestore();
    remove.mockRestore();
  });

  const nap = ctx.clock.sleep(10, ctx.controller.signal);

  ctx.clock.advance(10);

  await nap;

  expect(remove.mock.calls.map((call) => call[0])).toStrictEqual(['abort']);
  expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]);
});

test('it sets now to each due time as it fires, in due order, and to the target at the end', () => {
  const ctx = setupTest();
  const log: string[] = [];

  ctx.clock.schedule(() => log.push(`late@${ctx.clock.now()}`), 300);
  ctx.clock.schedule(() => log.push(`early@${ctx.clock.now()}`), 100);
  ctx.clock.schedule(() => log.push('beyond'), 900);
  ctx.clock.advance(400);

  expect(log).toStrictEqual(['early@1100', 'late@1300']);
  expect(ctx.clock.now()).toBe(1400);
  expect(ctx.clock.countPending()).toBe(1);
});

test('it resolves a sleep and fires a timer in due order together', async () => {
  const ctx = setupTest();
  const log: string[] = [];

  const nap = (async () => {
    await ctx.clock.sleep(200);

    log.push('sleep');
  })();

  ctx.clock.schedule(() => log.push('timer'), 100);
  ctx.clock.advance(300);

  await nap;

  expect(log).toStrictEqual(['timer', 'sleep']);
});

test('it fires two timers due at the same time in the order they were scheduled', () => {
  const ctx = setupTest();
  const log: string[] = [];

  ctx.clock.schedule(() => log.push('first'), 100);
  ctx.clock.schedule(() => log.push('second'), 100);
  ctx.clock.schedule(() => log.push('third'), 100);
  ctx.clock.advance(100);

  expect(log).toStrictEqual(['first', 'second', 'third']);
});

test('it fires, in the same advance, a timer that a firing timer scheduled within the target', () => {
  const ctx = setupTest();
  const log: string[] = [];

  ctx.clock.schedule(() => {
    log.push(`outer@${ctx.clock.now()}`);
    ctx.clock.schedule(() => log.push(`inner@${ctx.clock.now()}`), 50);
    ctx.clock.schedule(() => log.push('past the target'), 500);
  }, 100);

  ctx.clock.advance(200);

  expect(log).toStrictEqual(['outer@1100', 'inner@1150']);
});

test('it never fires a timer that an earlier timer in the same advance cancelled', () => {
  const ctx = setupTest();
  const log: string[] = [];
  const cancelLater = ctx.clock.schedule(() => log.push('later'), 200);

  ctx.clock.schedule(() => {
    log.push('earlier');

    cancelLater();
  }, 100);

  ctx.clock.advance(300);

  expect(log).toStrictEqual(['earlier']);
});
