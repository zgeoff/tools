import { expect, test } from 'bun:test';
import { z } from 'zod';
import { buildClientAdmin } from '../admin/build-client-admin.ts';
import { DEFAULT_PATHS } from '../default-paths.ts';
import { openStore } from '../store/open-store.ts';
import { buildStubClock } from '../test-utils/build-stub-clock.ts';
import { createTestDatabase } from '../test-utils/create-test-database.ts';
import { verifyOAuthQuery } from './verify-oauth-query.ts';

async function setupTest() {
  const database = createTestDatabase();

  const store = await openStore(
    {
      database,
      scopes: ['read'],
      tables: { passkey: 'app_passkey', enrollmentToken: 'app_enrollment_token' },
      clock: buildStubClock(),
      onGrantRevoked: () => {},
    },
    { origin: 'https://app.example', paths: DEFAULT_PATHS },
  );

  const clients = buildClientAdmin(store, null);

  const authContext = await store.auth.$context;

  return {
    secret: authContext.secret,

    // The signed query better-auth puts on the login page it redirects to.
    readLoginQuery: async () => {
      const client = await clients.add('Claude', ['https://assistant.example.com/callback']);

      const authorize = new URL('https://app.example/oauth2/authorize');

      authorize.search = new URLSearchParams({
        response_type: 'code',
        client_id: client.clientID,
        redirect_uri: 'https://assistant.example.com/callback',
        scope: 'read',
        state: 'state-1',
        code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        code_challenge_method: 'S256',
      }).toString();

      const answered = await store.auth.handler(new Request(authorize.href));

      const location = z.string().parse(answered.headers.get('location'));

      return new URL(location, 'https://app.example').searchParams;
    },
  };
}

test('it accepts the query better-auth signs for the login page', async () => {
  const ctx = await setupTest();
  const query = await ctx.readLoginQuery();
  const verified = await verifyOAuthQuery(query.toString(), ctx.secret, Date.now());

  expect(verified).toBeTrue();
});

test('it refuses a signed query once its expiry has passed', async () => {
  const ctx = await setupTest();
  const query = await ctx.readLoginQuery();

  const expiresAt = Number(query.get('exp')) * 1000;

  const verified = await verifyOAuthQuery(query.toString(), ctx.secret, expiresAt + 1);

  expect(verified).toBeFalse();
});

test('it refuses a signed query with one parameter changed', async () => {
  const ctx = await setupTest();
  const query = await ctx.readLoginQuery();

  query.set('state', 'state-2');

  const verified = await verifyOAuthQuery(query.toString(), ctx.secret, Date.now());

  expect(verified).toBeFalse();
});

test.each([
  ['client_id=c1&exp=99999999999'],
  ['client_id=c1&exp=99999999999&sig='],
  ['client_id=c1&exp=99999999999&sig=a&sig=b'],
])('it refuses the query %p without one valid signature', async (query) => {
  const verified = await verifyOAuthQuery(
    query,
    'secret-0123456789-abcdefghijklmnopqrstuvwxyz',
    Date.now(),
  );

  expect(verified).toBeFalse();
});
