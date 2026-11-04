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

test('it times out with the label and the last error as the cause', () => {
  const lastError = new Error('kettle is cold');

  const failure = waitFor(
    () => {
      throw lastError;
    },
    { intervalMs: 5, timeoutMs: 40, label: 'the kettle' },
  );

  expect(failure).rejects.toMatchObject({
    message: 'timed out after 40 ms waiting for the kettle: kettle is cold',
    cause: lastError,
  });
});

test('it times out without a label', () => {
  const lastError = new Error('kettle is cold');

  const failure = waitFor(
    () => {
      throw lastError;
    },
    { intervalMs: 5, timeoutMs: 40 },
  );

  expect(failure).rejects.toMatchObject({
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

test('it times out on a rejection with the last error as the cause', () => {
  const lastError = new Error('still cold');

  const failure = waitFor(() => Promise.reject(lastError), { intervalMs: 5, timeoutMs: 40 });

  expect(failure).rejects.toMatchObject({
    message: 'timed out after 40 ms: still cold',
    cause: lastError,
  });
});

test('it starts no retry after the deadline', () => {
  let calls = 0;

  const failure = waitFor(
    () => {
      calls += 1;

      if (calls === 1) {
        throw new Error('kettle is cold');
      }

      return 'late success';
    },
    { intervalMs: 80, timeoutMs: 10 },
  );

  expect(failure).rejects.toThrow('timed out after 10 ms: kettle is cold');
  expect(calls).toBe(1);
});

test('it times out while an attempt is still pending', () => {
  const failure = waitFor(() => new Promise<string>(() => {}), { intervalMs: 5, timeoutMs: 30 });

  expect(failure).rejects.toThrow('timed out after 30 ms: the attempt had not finished');
});
