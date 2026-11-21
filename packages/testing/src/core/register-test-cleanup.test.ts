import { expect, onTestFinished, test } from 'bun:test';
import { createTestCleanupRegistry, registerTestCleanup } from './register-test-cleanup.ts';

// Stands in for Bun's onTestFinished, so the test decides when "the test" ends.
function setupTest() {
  const hooks: (() => Promise<void>)[] = [];

  const registry = createTestCleanupRegistry((hook) => {
    hooks.push(hook);
  });

  return {
    registry,
    hooks,
    finishTest: async () => {
      for (const hook of hooks.splice(0)) {
        await hook();
      }
    },
  };
}

test('it runs the releases after the test in reverse order of registration', async () => {
  const ctx = setupTest();
  const order: string[] = [];

  ctx.registry.register(() => order.push('server'));
  ctx.registry.register(() => order.push('folder'));
  ctx.registry.register(() => order.push('port'));

  await ctx.finishTest();

  expect(order).toStrictEqual(['server', 'folder', 'port'].toReversed());
});

test('it awaits an async release before it runs the next', async () => {
  const ctx = setupTest();
  const order: string[] = [];

  ctx.registry.register(() => order.push('second'));

  ctx.registry.register(async () => {
    await Promise.resolve();

    order.push('first');
  });

  await ctx.finishTest();

  expect(order).toStrictEqual(['first', 'second']);
});

test('it runs every release after one throws, then throws an AggregateError of the failures', () => {
  const ctx = setupTest();
  const order: string[] = [];

  const stuck = new Error('port is stuck');
  const jammed = new Error('folder is jammed');

  ctx.registry.register(() => order.push('server'));

  ctx.registry.register(() => {
    throw jammed;
  });

  ctx.registry.register(() => Promise.reject(stuck));
  ctx.registry.register(() => order.push('first'));

  const failure = ctx.finishTest();

  expect(failure).rejects.toBeInstanceOf(AggregateError);
  expect(failure).rejects.toMatchObject({ errors: [stuck, jammed] });
  expect(order).toStrictEqual(['first', 'server']);
});

test('it adds one hook per test however many releases the test registers', () => {
  const ctx = setupTest();

  ctx.registry.register(() => 1);
  ctx.registry.register(() => 2);
  ctx.registry.register(() => 3);

  expect(ctx.hooks).toHaveLength(1);
});

test('it adds a new hook for the next test', async () => {
  const ctx = setupTest();

  ctx.registry.register(() => 1);

  await ctx.finishTest();

  ctx.registry.register(() => 2);

  expect(ctx.hooks).toHaveLength(1);
});

test('it runs a release at most once when the test releases it early', async () => {
  const ctx = setupTest();
  let runs = 0;

  const release = ctx.registry.register(() => {
    runs += 1;

    return 'stopped';
  });

  const early = release();

  await ctx.finishTest();

  expect({ early, runs }).toStrictEqual({ early: 'stopped', runs: 1 });
});

test('it returns the first result of a release that a later call repeats', () => {
  const ctx = setupTest();
  let runs = 0;

  const release = ctx.registry.register(() => {
    runs += 1;

    return runs;
  });

  const results = [release(), release(), release()];

  expect(results).toStrictEqual([1, 1, 1]);
});

test('it rethrows the first failure of a release on a later call, without running it again', () => {
  const ctx = setupTest();

  const jammed = new Error('folder is jammed');

  let runs = 0;

  const release = ctx.registry.register(() => {
    runs += 1;
    throw jammed;
  });

  expect(release).toThrow(jammed);
  expect(release).toThrow(jammed);
  expect(runs).toBe(1);
});

test('it skips a release that the test ran early, and reports no failure for it', async () => {
  const ctx = setupTest();

  const release = ctx.registry.register(() => {
    throw new Error('folder is jammed');
  });

  expect(release).toThrow('folder is jammed');

  await ctx.finishTest();
});

test('it runs its releases after the test that registered them', () => {
  const order: string[] = [];

  registerTestCleanup(() => order.push('server'));
  registerTestCleanup(() => order.push('folder'));

  onTestFinished(() => {
    expect(order).toStrictEqual(['folder', 'server']);
  });
});
