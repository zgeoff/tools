import { expect, test } from 'bun:test';
import { makeAbortingRunStub } from './make-aborting-run-stub.ts';

test('it aborts the controller, then exits with the code', async () => {
  const controller = new AbortController();

  const exitCode = await makeAbortingRunStub(controller, 0)(['.browser.test.ts'], {});

  expect(exitCode).toBe(0);
  expect(controller.signal.aborted).toBeTrue();
});

test('it leaves the controller alone until the run starts', () => {
  const controller = new AbortController();

  makeAbortingRunStub(controller, 0);

  expect(controller.signal.aborted).toBeFalse();
});
