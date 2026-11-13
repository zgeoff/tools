import { expect, test } from 'bun:test';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { withFormOrigin } from './with-form-origin.ts';

function setupTest() {
  const calls: string[] = [];

  const route = withFormOrigin('https://app.example', (request) => {
    calls.push(request.method);

    return Promise.resolve(new Response('ok'));
  });

  return { calls, route, requester: buildTestRequester() };
}

test('#withFormOrigin passes a post from the origin of the server', async () => {
  const ctx = setupTest();

  const answer = await ctx.route(
    buildFormRequest('https://app.example/login', new URLSearchParams(), {
      origin: 'https://app.example',
    }),
    ctx.requester,
  );

  expect(answer.status).toBe(200);
});

test.each([[{ origin: 'https://evil.example' }], [{}]])(
  '#withFormOrigin refuses a post with the headers %p before the route runs',
  async (headers) => {
    const ctx = setupTest();

    const answer = await ctx.route(
      buildFormRequest('https://app.example/login', new URLSearchParams(), headers),
      ctx.requester,
    );

    expect(answer.status).toBe(403);
    expect(ctx.calls).toStrictEqual([]);
  },
);

test('#withFormOrigin passes a get with no origin', async () => {
  const ctx = setupTest();

  const answer = await ctx.route(new Request('https://app.example/login'), ctx.requester);

  expect(answer.status).toBe(200);
});
