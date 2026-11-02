import { expect, test } from 'bun:test';
import { buildFakeProcessRuntime } from './build-fake-process-runtime.ts';

test('it spawns a leader with the process ID that settles with the exit promise', async () => {
  const runtime = buildFakeProcessRuntime(4417, Promise.resolve(3));

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

test('it moves its clock by each sleep, and by nothing else', async () => {
  const runtime = buildFakeProcessRuntime(4417, Promise.resolve(0));
  const startMs = runtime.now();

  await runtime.sleep(50);
  await runtime.sleep(300);

  expect(startMs).toBe(0);
  expect(runtime.now()).toBe(350);
});
