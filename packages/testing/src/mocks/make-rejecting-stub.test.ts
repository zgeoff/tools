import { expect, test } from 'bun:test';
import { makeRejectingStub } from './make-rejecting-stub.ts';

test('it records each call and rejects with the failure', async () => {
  const failure = new Error('the group still runs');

  const runTests = makeRejectingStub(failure);

  const rejection = await runTests(['.browser.test.ts']).then(
    () => null,
    (error: unknown) => error,
  );

  expect(rejection).toBe(failure);
  expect(runTests).toHaveBeenCalledExactlyOnceWith(['.browser.test.ts']);
});
