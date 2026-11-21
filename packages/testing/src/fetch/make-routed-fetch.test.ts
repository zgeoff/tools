import { expect, test } from 'bun:test';
import { makeRoutedFetch } from './make-routed-fetch.ts';

function setupTest() {
  const calls: string[] = [];

  const answer = (name: string): typeof fetch =>
    Object.assign(
      (input: string | URL | Request) => {
        calls.push(`${name} ${input instanceof Request ? input.url : input.toString()}`);

        return Promise.resolve(new Response(name));
      },
      { preconnect: () => {} },
    );

  const native = answer('native');
  const mocked = answer('mocked');

  return {
    calls,
    routed: makeRoutedFetch({ native, mocked, passthroughHosts: ['127.0.0.1'] }),
  };
}

test('it sends a call to a passthrough host to the native fetch', async () => {
  const ctx = setupTest();

  const response = await ctx.routed('http://127.0.0.1:9000/ping');
  const text = await response.text();

  expect(text).toBe('native');
  expect(ctx.calls).toStrictEqual(['native http://127.0.0.1:9000/ping']);
});

test('it sends a call with the unix option to the native fetch', async () => {
  const ctx = setupTest();

  await ctx.routed('http://api.example.com/', { unix: '/run/kettle.sock' });

  expect(ctx.calls).toStrictEqual(['native http://api.example.com/']);
});

test('it sends every other call to the mocked fetch', async () => {
  const ctx = setupTest();

  const response = await ctx.routed('https://api.example.com/v1');
  const text = await response.text();

  expect(text).toBe('mocked');
  expect(ctx.calls).toStrictEqual(['mocked https://api.example.com/v1']);
});
