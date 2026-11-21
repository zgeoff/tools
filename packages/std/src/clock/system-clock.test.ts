import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { systemClock } from './system-clock.ts';

function setupTest() {
  const controller = new AbortController();

  return { controller };
}

test('it reads the current time in epoch milliseconds', () => {
  const before = Date.now();
  const now = systemClock.now();
  const after = Date.now();

  expect(now).toBeGreaterThanOrEqual(before);
  expect(now).toBeLessThanOrEqual(after);
});

test('it fires a scheduled callback after the delay', async () => {
  const fired = Promise.withResolvers<void>();

  systemClock.schedule(() => {
    fired.resolve();
  }, 5);

  await expect(fired.promise).toResolve();
});

test('it treats a negative delay as 0 when it schedules', () => {
  const setTimeoutSpy = spyOn(globalThis, 'setTimeout');

  onTestFinished(() => {
    setTimeoutSpy.mockRestore();
  });

  const cancel = systemClock.schedule(() => {}, -1000);

  cancel();

  expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
});

test('it treats a negative delay as 0 when it sleeps', async () => {
  const setTimeoutSpy = spyOn(globalThis, 'setTimeout');

  onTestFinished(() => {
    setTimeoutSpy.mockRestore();
  });

  await systemClock.sleep(-5000);

  expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
});

test('it does not fire a cancelled callback, and a second cancel does nothing', async () => {
  let fired = 0;
  const control = Promise.withResolvers<void>();

  const cancel = systemClock.schedule(() => {
    fired += 1;
  }, 5);

  cancel();
  cancel();
  setTimeout(control.resolve, 30);

  await control.promise;

  expect(fired).toBe(0);
});

test('it ignores a cancel after the callback fired', async () => {
  const fired = Promise.withResolvers<void>();

  const cancel = systemClock.schedule(() => {
    fired.resolve();
  }, 1);

  await fired.promise;

  expect(() => {
    cancel();
  }).not.toThrow();
});

test('it resolves a sleep early when the signal aborts during it', async () => {
  const ctx = setupTest();
  const startedAt = performance.now();
  const nap = systemClock.sleep(60_000, ctx.controller.signal);

  ctx.controller.abort();

  await nap;

  expect(performance.now() - startedAt).toBeLessThan(5000);
});

test('it resolves at once for a signal that is already aborted', async () => {
  const ctx = setupTest();
  const startedAt = performance.now();

  ctx.controller.abort();

  await systemClock.sleep(60_000, ctx.controller.signal);

  expect(performance.now() - startedAt).toBeLessThan(5000);
});

test('it removes its abort listener when the sleep ends by time', async () => {
  const ctx = setupTest();
  const add = spyOn(ctx.controller.signal, 'addEventListener');
  const remove = spyOn(ctx.controller.signal, 'removeEventListener');

  onTestFinished(() => {
    add.mockRestore();
    remove.mockRestore();
  });

  await systemClock.sleep(1, ctx.controller.signal);

  expect(add.mock.calls.map((call) => call[0])).toStrictEqual(['abort']);
  expect(remove.mock.calls.map((call) => call[0])).toStrictEqual(['abort']);
  expect(remove.mock.calls[0]?.[1]).toBe(add.mock.calls[0]?.[1]);
});

test('it removes its abort listener when the sleep ends by abort', async () => {
  const ctx = setupTest();
  const remove = spyOn(ctx.controller.signal, 'removeEventListener');

  onTestFinished(() => {
    remove.mockRestore();
  });

  const nap = systemClock.sleep(60_000, ctx.controller.signal);

  ctx.controller.abort();

  await nap;

  expect(remove.mock.calls.map((call) => call[0])).toStrictEqual(['abort']);
});
