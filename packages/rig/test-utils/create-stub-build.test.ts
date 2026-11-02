import { expect, test } from 'bun:test';
import { createStubBuild } from './create-stub-build.ts';

test('it marks the build started when the lane runs it, and exits with the code the test finishes it with', async () => {
  const build = createStubBuild();
  const exited = build.runBuild();

  await build.started;

  build.finish(2);

  const exitCode = await exited;

  expect(exitCode).toBe(2);
});

test('it keeps the build running until the test finishes it', async () => {
  const build = createStubBuild();
  const exited = build.runBuild();

  const firstSettled = await Promise.race([
    exited.then(() => 'build'),
    build.started.then(() => 'started'),
  ]);

  expect(firstSettled).toBe('started');
});
