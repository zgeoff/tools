import { expect, test } from 'bun:test';
import { waitFor } from './wait-for.ts';

test('it resolves at once with the first value', async () => {
  const value = await waitFor(() => 'boiled');

  expect(value).toBe('boiled');
});

test('it resolves after some failed attempts', async () => {
  let calls = 0;

  const value = await waitFor(
    () => {
      calls += 1;

      if (calls < 3) {
        throw new Error('not yet');
      }

      return calls;
    },
    { intervalMs: 5 },
  );

  expect(value).toBe(3);
});

test('it times out with the label and the last error as the cause', async () => {
  const lastError = new Error('kettle is cold');

  const failure = waitFor(
    () => {
      throw lastError;
    },
    { intervalMs: 5, timeoutMs: 40, label: 'the kettle' },
  );

  await expect(failure).rejects.toMatchObject({
    message: 'timed out after 40 ms waiting for the kettle: kettle is cold',
    cause: lastError,
  });
});

test('it times out without a label', async () => {
  const lastError = new Error('kettle is cold');

  const failure = waitFor(
    () => {
      throw lastError;
    },
    { intervalMs: 5, timeoutMs: 40 },
  );

  await expect(failure).rejects.toMatchObject({
    message: 'timed out after 40 ms: kettle is cold',
    cause: lastError,
  });
});

test('it retries a rejection like a throw', async () => {
  let calls = 0;

  const value = await waitFor(
    () => {
      calls += 1;

      return calls < 2 ? Promise.reject(new Error('not yet')) : Promise.resolve('steeped');
    },
    { intervalMs: 5 },
  );

  expect(value).toBe('steeped');
});

test('it times out on a rejection with the last error as the cause', async () => {
  const lastError = new Error('still cold');

  const failure = waitFor(() => Promise.reject(lastError), { intervalMs: 5, timeoutMs: 40 });

  await expect(failure).rejects.toMatchObject({
    message: 'timed out after 40 ms: still cold',
    cause: lastError,
  });
});
