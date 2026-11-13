import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { seedClient } from '../test-utils/seed-client.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  const requester = buildTestRequester();

  return {
    ...server,
    requester,
    readClient: () =>
      seedClient(server.auth, { redirectURIs: ['https://assistant.example/callback'] }),
    authorize: (params: Record<string, string>) => {
      const url = new URL('https://app.example/oauth2/authorize');

      url.search = new URLSearchParams({
        response_type: 'code',
        redirect_uri: 'https://assistant.example/callback',
        state: 'state-1',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
        ...params,
      }).toString();

      return server.auth.routes.authorize(new Request(url.href), requester);
    },
  };
}

test('#answerAuthorizeRequest sends a known client to the login page and records the start', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();
  const answer = await ctx.authorize({ client_id: client.clientID, scope: 'read' });

  const location = new URL(z.string().parse(answer.headers.get('location')), 'https://app.example');

  expect(location.pathname).toBe('/login');

  expect(ctx.events).toStrictEqual([
    {
      kind: 'authorize_started',
      outcome: 'accepted',
      path: '/oauth2/authorize',
      requester: ctx.requester,
      client: { id: client.clientID, name: client.name },
      correlationID: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    },
  ]);
});

test('#answerAuthorizeRequest asks for a fresh login and consent whatever the client sent', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();
  const answer = await ctx.authorize({ client_id: client.clientID, scope: 'read', prompt: 'none' });

  const location = new URL(z.string().parse(answer.headers.get('location')), 'https://app.example');

  expect(location.searchParams.get('prompt')).toBe('login consent');
});

test('#answerAuthorizeRequest asks for every scope of the server when the client names none', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();
  const answer = await ctx.authorize({ client_id: client.clientID });

  const location = new URL(z.string().parse(answer.headers.get('location')), 'https://app.example');

  expect(location.searchParams.get('scope')).toBe('read write offline_access');
});

test('#answerAuthorizeRequest names the resource of the server when the client names none', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();
  const answer = await ctx.authorize({ client_id: client.clientID, scope: 'read' });

  const location = new URL(z.string().parse(answer.headers.get('location')), 'https://app.example');

  expect(location.searchParams.get('resource')).toBe('https://app.example/mcp');
});

test('#answerAuthorizeRequest records an unknown client as a refused request', async () => {
  const ctx = await setupTest();

  await ctx.authorize({ client_id: 'nobody', scope: 'read' });

  expect(ctx.events).toStrictEqual([
    {
      kind: 'authorize_invalid',
      outcome: 'rejected',
      reason: 'invalid_client',
      path: '/oauth2/authorize',
      requester: ctx.requester,
    },
  ]);
});

test('#answerAuthorizeRequest records a redirect URI the client lacks, with the client', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();

  await ctx.authorize({
    client_id: client.clientID,
    scope: 'read',
    redirect_uri: 'https://elsewhere.example/callback',
  });

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'authorize_invalid',
    outcome: 'rejected',
    client: { id: client.clientID, name: client.name },
  });
});

test('#answerAuthorizeRequest refuses the eleventh sign-in started within a minute', async () => {
  const ctx = await setupTest();
  const client = await ctx.readClient();

  const answers: Response[] = [];

  for (let start = 0; start < 11; start += 1) {
    const answer = await ctx.authorize({
      client_id: client.clientID,
      scope: 'read',
      state: `s${start}`,
    });

    answers.push(answer);
  }

  expect(answers.map((answer) => answer.status)).toStrictEqual([
    ...Array.from({ length: 10 }, () => 302),
    429,
  ]);

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'authorize_started',
    outcome: 'rejected',
    reason: 'rate_limited',
  });
});
