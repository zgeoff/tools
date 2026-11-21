import { expect, test } from 'bun:test';
import { buildFakeProcessRuntime } from './build-fake-process-runtime.ts';

test('it spawns a leader with the process ID that settles with the exit promise', async () => {
  const fake = buildFakeProcessRuntime(4417, Promise.resolve(3));
  const runtime = fake.runtime;

  const leader = runtime.spawn(['bun', 'test'], {
    cwd: '/work/notes-app',
    environment: {},
    stdout: 'pipe',
  });

  const exitCode = await leader.exited;

  expect(leader.pid).toBe(4417);
  expect(exitCode).toBe(3);

  expect(runtime.spawn).toHaveBeenCalledExactlyOnceWith(['bun', 'test'], {
    cwd: '/work/notes-app',
    environment: {},
    stdout: 'pipe',
  });
});

test('it gives the runtime a clock that moves only when the test advances its fake', async () => {
  const fake = buildFakeProcessRuntime(4417, Promise.resolve(0));
  const startMs = fake.runtime.now();
  const slept = fake.runtime.sleep(50);

  fake.clock.advance(50);

  await slept;

  expect(startMs).toBe(0);
  expect(fake.runtime.now()).toBe(50);
});
