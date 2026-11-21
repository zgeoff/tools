import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '../core/wait-for.ts';
import { startStubServer } from './start-stub-server.ts';

test('it listens on the loopback interface and gives a URL with no trailing slash', async () => {
  const api = startStubServer(() => new Response('boiled'));

  const response = await fetch(`${api.url}/kettle`);
  const text = await response.text();

  expect(api.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
  expect(text).toBe('boiled');
});

test('it answers with the response that handle returns', async () => {
  const api = startStubServer((request) =>
    Promise.resolve(
      Response.json({ ok: true, path: new URL(request.url).pathname }, { status: 201 }),
    ),
  );

  const response = await fetch(`${api.url}/v1/sync`);
  const body = await response.json();

  expect([response.status, body]).toStrictEqual([201, { ok: true, path: '/v1/sync' }]);
});

test('it records each request, in arrival order, with its method, path, headers and body', async () => {
  const api = startStubServer(() => new Response('ok'));

  await fetch(`${api.url}/v1/first?since=0`);

  await fetch(`${api.url}/v1/sync`, {
    method: 'POST',
    headers: { 'x-kettle': 'red' },
    body: '{"since":0}',
  });

  expect(api.requests).toStrictEqual([
    {
      method: 'GET',
      path: '/v1/first?since=0',
      headers: expect.objectContaining({ host: expect.any(String) }),
      body: '',
    },
    {
      method: 'POST',
      path: '/v1/sync',
      headers: expect.objectContaining({ 'x-kettle': 'red' }),
      body: '{"since":0}',
    },
  ]);
});

test('it records a request before it calls handle', async () => {
  const seen: number[] = [];

  const api = startStubServer(() => {
    seen.push(api.requests.length);

    return new Response('ok');
  });

  await fetch(`${api.url}/a`);

  expect(seen).toStrictEqual([1]);
});

test('it stops the server after the test', () => {
  const api = startStubServer(() => new Response('ok'));

  onTestFinished(() => {
    expect(fetch(`${api.url}/`)).rejects.toThrow();
  });

  expect(fetch(`${api.url}/`)).resolves.toBeInstanceOf(Response);
});

test('it leaves a manual server running after the test, until the caller stops it', () => {
  const api = startStubServer(() => new Response('ok'), { cleanup: 'manual' });

  onTestFinished(async () => {
    expect(fetch(`${api.url}/`)).resolves.toBeInstanceOf(Response);

    await api.stop();
  });
});

test('it stops a manual server when the caller calls stop', async () => {
  const api = startStubServer(() => new Response('ok'), { cleanup: 'manual' });

  await api.stop();

  expect(fetch(`${api.url}/`)).rejects.toThrow();
});

test('it stops a server that never answers, and fails the request that waits on it', async () => {
  const api = startStubServer(() => new Promise<Response>(() => {}));
  const waiting = fetch(`${api.url}/slow`);

  await waitFor(() => {
    expect(api.requests).toHaveLength(1);
  });

  await api.stop();

  const [outcome] = await Promise.allSettled([waiting]);

  expect(outcome?.status).toBe('rejected');
});

test('it keeps arrival order when an earlier request body finishes after a later request', async () => {
  const api = startStubServer(() => new Response('ok'));

  const encoder = new TextEncoder();

  const slowBody = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();

  const first = fetch(`${api.url}/v1/first`, {
    method: 'POST',
    body: new ReadableStream<Uint8Array>({
      start: (controller) => {
        slowBody.resolve(controller);
      },
    }),
  });

  const controller = await slowBody.promise;

  controller.enqueue(encoder.encode('half'));

  await waitFor(() => {
    expect(api.requests).toHaveLength(1);
  });

  await fetch(`${api.url}/v1/second`);

  controller.close();

  await first;

  expect(api.requests.map((request) => request.path)).toStrictEqual(['/v1/first', '/v1/second']);
});
