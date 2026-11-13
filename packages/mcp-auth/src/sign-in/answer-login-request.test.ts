import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildStubAuthenticator } from '../test-utils/build-stub-authenticator.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { parsePasskeyPage } from '../test-utils/parse-passkey-page.ts';
import { seedPasskey } from '../test-utils/seed-passkey.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  const authenticator = buildStubAuthenticator();
  const requester = buildTestRequester();
  const origin = 'https://app.example';

  const startSignIn = async () => {
    const client = await server.auth.clients.add('Claude', ['https://assistant.example/callback']);

    const authorize = new URL(`${origin}/oauth2/authorize`);

    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: client.clientID,
      redirect_uri: 'https://assistant.example/callback',
      scope: 'read',
      state: 'state-1',
      code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      code_challenge_method: 'S256',
    }).toString();

    const answered = await server.auth.routes.authorize(new Request(authorize.href), requester);

    const location = z.string().parse(answered.headers.get('location'));

    return new URL(location, origin);
  };

  const readLoginPage = (login: URL) =>
    server.auth.routes.login(new Request(login.href), requester);

  const postLogin = (fields: Record<string, string>) =>
    server.auth.routes.login(
      buildFormRequest(`${origin}/login`, new URLSearchParams(fields), { origin }),
      requester,
    );

  const signIn = async (
    login: URL,
    ceremony: { readonly origin?: string; readonly userVerified?: boolean } = {},
  ) => {
    const page = await readLoginPage(login);
    const html = await page.text();

    const parsed = parsePasskeyPage(html);

    if (parsed.mode !== 'get') {
      throw new Error('the login page asked to enroll a passkey');
    }

    const assertion = await authenticator.signAssertion(parsed.options, { origin, ...ceremony });

    return postLogin({
      oauth_query: login.search.slice(1),
      credential: JSON.stringify(assertion),
    });
  };

  return {
    ...server,
    authenticator,
    startSignIn,
    readLoginPage,
    postLogin,
    signIn,
    enrollPasskey: () => seedPasskey(server.auth, { authenticator }),
    readGrantRows: () =>
      server.database.query('select email, name, scopes, approvedBy from user').all(),
  };
}

test('#answerLoginRequest tells the owner to enroll a passkey when none is enrolled', async () => {
  const ctx = await setupTest();
  const login = await ctx.startSignIn();
  const page = await ctx.readLoginPage(login);
  const html = await page.text();

  expect(page.status).toBe(200);
  expect(html).toInclude('No passkey is enrolled');
});

test('#answerLoginRequest refuses a login post when no passkey is enrolled and records it', async () => {
  const ctx = await setupTest();
  const login = await ctx.startSignIn();
  const answer = await ctx.postLogin({ oauth_query: login.search.slice(1), credential: '{}' });

  expect(answer.status).toBe(400);

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'owner_auth',
    outcome: 'failed',
    reason: 'not_enrolled',
  });
});

test('#answerLoginRequest answers a sign-in it does not know as expired', async () => {
  const ctx = await setupTest();
  const answer = await ctx.postLogin({ oauth_query: 'client_id=unknown', credential: '{}' });

  expect(answer.status).toBe(400);
  expect(ctx.events.at(-1)).toMatchObject({ kind: 'owner_auth', reason: 'expired' });
});

test('#answerLoginRequest makes a grant row and sends the owner to the consent page when the passkey signs in', async () => {
  const ctx = await setupTest();

  await ctx.enrollPasskey();

  const login = await ctx.startSignIn();
  const answer = await ctx.signIn(login);

  const location = new URL(z.string().parse(answer.headers.get('location')), login.origin);

  expect(answer.status).toBe(302);
  expect(location.pathname).toBe('/consent');
  expect(ctx.events.at(-1)).toMatchObject({ kind: 'owner_auth', outcome: 'succeeded' });

  expect(ctx.readGrantRows()).toStrictEqual([
    {
      email: expect.stringMatching(/^[A-Za-z0-9]{32}@grant\.invalid$/u),
      name: 'Claude',
      scopes: null,
      approvedBy: 'passkey',
    },
  ]);
});

test('#answerLoginRequest refuses an assertion made for another origin', async () => {
  const ctx = await setupTest();

  await ctx.enrollPasskey();

  const login = await ctx.startSignIn();
  const answer = await ctx.signIn(login, { origin: 'https://elsewhere.example' });

  expect(answer.status).toBe(400);
  expect(ctx.readGrantRows()).toStrictEqual([]);

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'owner_auth',
    outcome: 'failed',
    reason: 'assertion_failed',
  });
});

test('#answerLoginRequest refuses an assertion that did not verify the user', async () => {
  const ctx = await setupTest();

  await ctx.enrollPasskey();

  const login = await ctx.startSignIn();
  const answer = await ctx.signIn(login, { userVerified: false });

  expect(answer.status).toBe(400);
  expect(ctx.readGrantRows()).toStrictEqual([]);
});

test('#answerLoginRequest refuses an assertion that answers a challenge older than five minutes', async () => {
  const ctx = await setupTest();

  await ctx.enrollPasskey();

  const login = await ctx.startSignIn();
  const page = await ctx.readLoginPage(login);
  const html = await page.text();

  const parsed = parsePasskeyPage(html);

  if (parsed.mode !== 'get') {
    throw new Error('the login page asked to enroll a passkey');
  }

  ctx.clock.advance(5 * 60_000);

  const assertion = await ctx.authenticator.signAssertion(parsed.options, {
    origin: 'https://app.example',
  });

  const answer = await ctx.postLogin({
    oauth_query: login.search.slice(1),
    credential: JSON.stringify(assertion),
  });

  expect(answer.status).toBe(400);
  expect(ctx.events.at(-1)).toMatchObject({ kind: 'owner_auth', reason: 'expired' });
});

test('#answerLoginRequest ends the sign-in at the fifth failed login', async () => {
  const ctx = await setupTest();

  await ctx.enrollPasskey();

  const login = await ctx.startSignIn();

  const wrong = { origin: 'https://elsewhere.example' };
  const answers: Response[] = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const answer = await ctx.signIn(login, wrong);

    answers.push(answer);
  }

  const texts = await Promise.all(answers.map((answer) => answer.text()));
  const afterwards = await ctx.readLoginPage(login);

  expect(texts.at(-1)).toInclude('Too many failed sign-ins');
  expect(texts.slice(0, 4)).toSatisfyAll((text: string) => !text.includes('Too many failed'));
  expect(afterwards.status).toBe(400);
});
