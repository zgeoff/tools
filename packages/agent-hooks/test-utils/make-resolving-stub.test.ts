import { expect, test } from 'bun:test';
import { makeResolvingStub } from './make-resolving-stub.ts';

test('it resolves with the value, and records the arguments of each call', async () => {
  const runTests = makeResolvingStub(3);

  const exitCode = await runTests(['.browser.test.ts'], { PATH: '/usr/bin' });

  expect(exitCode).toBe(3);
  expect(runTests).toHaveBeenCalledExactlyOnceWith(['.browser.test.ts'], { PATH: '/usr/bin' });
});
