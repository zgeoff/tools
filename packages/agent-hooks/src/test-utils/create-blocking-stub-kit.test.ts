import { expect, test } from 'bun:test';
import { createBlockingStubKit } from './create-blocking-stub-kit.ts';

test('it reports its first call with its arguments, and settles only once released', async () => {
  const blocking = createBlockingStubKit('built');
  const call = blocking.stub('/work/notes-app/cache');

  const firstCallArguments = await blocking.firstCall;

  const settledFirst = await Promise.race([
    call.then(() => 'call'),
    Promise.resolve('still blocked'),
  ]);

  blocking.release();

  const result = await call;

  expect(firstCallArguments).toStrictEqual(['/work/notes-app/cache']);
  expect(settledFirst).toBe('still blocked');
  expect(result).toBe('built');
});
