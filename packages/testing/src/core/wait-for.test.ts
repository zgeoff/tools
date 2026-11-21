import { expect, mock, onTestFinished, setSystemTime, test } from 'bun:test';
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

  const failure = waitFor(() => Promise.reject(lastError), {
    intervalMs: 5,
    timeoutMs: 40,
  });

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
  const failure = waitFor(() => new Promise<string>(() => {}), {
    intervalMs: 5,
    timeoutMs: 30,
  });

  expect(failure).rejects.toThrow('timed out after 30 ms: the attempt had not finished');
});

test.each([[false], [null], [undefined], [0], ['']])(
  'it resolves with %p, a value that is falsy',
  async (answer) => {
    let calls = 0;

    const value = await waitFor(() => {
      calls += 1;

      return answer;
    });

    expect({ value, calls }).toStrictEqual({ value: answer, calls: 1 });
  },
);

test('it keeps its deadline when the wall clock jumps forward', async () => {
  let calls = 0;

  onTestFinished(() => {
    setSystemTime();
  });

  const value = await waitFor(
    () => {
      calls += 1;

      if (calls < 3) {
        setSystemTime(new Date(Date.now() + 3_600_000));
        throw new Error('not yet');
      }

      return 'steeped';
    },
    { intervalMs: 5, timeoutMs: 1000 },
  );

  expect(value).toBe('steeped');
});

test('it measures the deadline with the now it is given', () => {
  const clock = { nowMs: 0 };

  const failure = waitFor(
    () => {
      throw new Error('kettle is cold');
    },
    {
      intervalMs: 10,
      timeoutMs: 100,
      now: () => clock.nowMs,
      sleep: (delayMs) => {
        clock.nowMs += delayMs;

        return Promise.resolve();
      },
    },
  );

  expect(failure).rejects.toThrow('timed out after 100 ms: kettle is cold');
});

test('it makes the attempts that fit before a deadline of its own clock', async () => {
  const clock = { nowMs: 0 };
  let calls = 0;

  const failure = waitFor(
    () => {
      calls += 1;
      throw new Error('kettle is cold');
    },
    {
      intervalMs: 10,
      timeoutMs: 100,
      now: () => clock.nowMs,
      sleep: (delayMs) => {
        clock.nowMs += delayMs;

        return Promise.resolve();
      },
    },
  );

  await failure.catch(() => null);

  expect(calls).toBe(10);
});

test('it rejects at the deadline while an attempt hangs, and ignores its result', async () => {
  const hung = Promise.withResolvers<string>();
  let calls = 0;

  const failure = waitFor(
    () => {
      calls += 1;

      return hung.promise;
    },
    { timeoutMs: 30 },
  );

  await failure.catch(() => null);

  hung.resolve('late');

  expect(failure).rejects.toThrow('timed out after 30 ms: the attempt had not finished');
  expect(calls).toBe(1);
});

test('it races a hung attempt against the sleep it is given for the time left', () => {
  const failure = waitFor(() => new Promise<string>(() => {}), {
    timeoutMs: 60_000,
    sleep: () => Promise.resolve(),
  });

  expect(failure).rejects.toThrow('timed out after 60000 ms');
});

test('it times out when the progress value stays the same', () => {
  const failure = waitFor(
    () => {
      throw new Error('kettle is cold');
    },
    { intervalMs: 5, timeoutMs: 40, progress: () => 'same' },
  );

  expect(failure).rejects.toThrow('timed out after 40 ms: kettle is cold');
});

test('it starts the deadline again each time the progress value changes', async () => {
  let calls = 0;

  const value = await waitFor(
    () => {
      calls += 1;

      if (calls < 20) {
        throw new Error('not yet');
      }

      return calls;
    },
    { intervalMs: 5, timeoutMs: 30, progress: () => calls },
  );

  expect(value).toBe(20);
});

test('it compares the progress value with Object.is', () => {
  const failure = waitFor(
    () => {
      throw new Error('kettle is cold');
    },
    { intervalMs: 5, timeoutMs: 40, progress: () => Number.NaN },
  );

  expect(failure).rejects.toThrow('timed out after 40 ms');
});

test('it keeps waiting on a hung attempt while the progress value changes', async () => {
  const hung = Promise.withResolvers<string>();
  let ticks = 0;

  const interval = setInterval(() => {
    ticks += 1;
  }, 10);

  setTimeout(() => {
    clearInterval(interval);

    hung.resolve('done');
  }, 150);

  const value = await waitFor(() => hung.promise, {
    timeoutMs: 50,
    progress: () => ticks,
  });

  expect(value).toBe('done');
});

test('it rejects with the reason of the signal when it aborts', () => {
  const controller = new AbortController();
  const reason = new Error('the test gave up');

  setTimeout(() => {
    controller.abort(reason);
  }, 20);

  const failure = waitFor(
    () => {
      throw new Error('kettle is cold');
    },
    { intervalMs: 5, timeoutMs: 5000, signal: controller.signal },
  );

  expect(failure).rejects.toBe(reason);
});

test('it rejects with the reason of the signal while an attempt hangs', () => {
  const controller = new AbortController();
  const reason = new Error('the test gave up');

  setTimeout(() => {
    controller.abort(reason);
  }, 20);

  const failure = waitFor(() => new Promise<string>(() => {}), {
    timeoutMs: 5000,
    signal: controller.signal,
  });

  expect(failure).rejects.toBe(reason);
});

test('it starts no attempt when the signal has aborted already', () => {
  const attempt = mock(() => 'steeped');

  const reason = new Error('too late');

  const failure = waitFor(attempt, { signal: AbortSignal.abort(reason) });

  expect(failure).rejects.toBe(reason);
  expect(attempt).not.toHaveBeenCalled();
});

test('it rejects when an attempt returns a value after the deadline', () => {
  const clock = { nowMs: 0 };

  const failure = waitFor(
    () => {
      clock.nowMs = 101;

      return 'late';
    },
    { timeoutMs: 100, now: () => clock.nowMs },
  );

  expect(failure).rejects.toThrow('timed out after 100 ms');
});
