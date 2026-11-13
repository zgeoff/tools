import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import { z } from 'zod';
import { authorizeTestClient } from '../test-utils/authorize-test-client.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import type { GrantCheck, GrantLimits, StoredGrant } from '../types.ts';

interface Limits {
  readonly imps: readonly string[];
}

async function setupTest() {
  const checked: StoredGrant<Limits>[] = [];
  let verdict: GrantCheck | Error = { kind: 'allow', scopes: ['read', 'write'] };
  let isStoredValid = true;
  const StoredSchema = z.object({ imps: z.array(z.string()) });

  const grantLimits: GrantLimits<Limits> = {
    renderConsentFields: () => '<input name="imp" value="web-*">',
    parseConsentFields: (form) => ({ ok: true, limits: { imps: form.getAll('imp') } }),
    parseStored: (json) => (isStoredValid ? (StoredSchema.safeParse(json).data ?? null) : null),
    check: (grant) => {
      checked.push(grant);

      return verdict instanceof Error ? Promise.reject(verdict) : Promise.resolve(verdict);
    },
  };

  const server = await openTestAuth({ grantLimits });

  onTestFinished(() => server.close());

  return {
    ...server,
    checked,
    decide: (next: GrantCheck | Error) => {
      verdict = next;
    },
    rejectStoredLimits: () => {
      isStoredValid = false;
    },
    authorize: (scopes: readonly string[]) =>
      authorizeTestClient(server.auth, {
        scopes,
        consentFields: new URLSearchParams({ imp: 'web-*' }),
      }),
  };
}

test('#verifyOAuthAccess returns the access of a live token with the limits of the grant', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);
  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toStrictEqual({
    kind: 'oauth',
    grantID: tokens.grantID,
    clientID: tokens.clientID,
    clientName: expect.any(String),
    scopes: ['read'],
    limits: { imps: ['web-*'] },
  });
});

test('#verifyOAuthAccess gives the check the stored grant', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  await ctx.auth.verify(tokens.accessToken);

  expect(ctx.checked).toStrictEqual([
    {
      grantID: tokens.grantID,
      clientID: tokens.clientID,
      scopes: ['read'],
      approvedBy: 'passkey',
      limits: { imps: ['web-*'] },
      createdAt: expect.any(Number),
      lastUsedAt: null,
    },
  ]);
});

test('#verifyOAuthAccess returns only the scopes that the grant holds and the check allows', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  ctx.decide({ kind: 'allow', scopes: ['write'] });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toMatchObject({ scopes: [] });
});

test('#verifyOAuthAccess never returns a scope that the grant lacks, whatever the check allows', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  ctx.decide({ kind: 'allow', scopes: ['read', 'write'] });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toMatchObject({ scopes: ['read'] });
});

test('#verifyOAuthAccess revokes the grant and returns null when the check says revoke', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  ctx.decide({ kind: 'revoke', reason: 'the imp token no longer covers it' });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toBeNull();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#verifyOAuthAccess throws and leaves the grant when the check throws', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  ctx.decide(new Error('the imp token store is down'));

  const access = ctx.auth.verify(tokens.accessToken);

  expect(access).rejects.toThrow('the imp token store is down');

  const grants = await ctx.auth.grants.list();

  expect(grants.map((grant) => grant.grantID)).toStrictEqual([tokens.grantID]);
});

test('#verifyOAuthAccess returns null for a token it does not know', async () => {
  const ctx = await setupTest();
  const access = await ctx.auth.verify('not-a-token');

  expect(access).toBeNull();
});

test('#verifyOAuthAccess revokes the grant and returns null when the app cannot read its stored limits', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  ctx.rejectStoredLimits();

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toBeNull();
  expect(ctx.revoked).toStrictEqual([tokens.grantID]);
});

test('#verifyOAuthAccess returns null for a token after fifteen minutes', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  setSystemTime(new Date(Date.now() + 16 * 60_000));

  onTestFinished(() => {
    setSystemTime();
  });

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toBeNull();
});

test('#verifyOAuthAccess returns null for a token bound to a key', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  // oxlint-disable-next-line zgeoff/seed-only -- the token route drops DPoP, so no code of the core makes a key-bound token
  ctx.database.run('update oauthAccessToken set confirmation = ?', ['{"jkt":"thumbprint"}']);

  const access = await ctx.auth.verify(tokens.accessToken);

  expect(access).toBeNull();
});

test('#verifyOAuthAccess stamps lastUsedAt at most once a minute', async () => {
  const ctx = await setupTest();
  const tokens = await ctx.authorize(['read']);

  await ctx.auth.verify(tokens.accessToken);

  const [first] = await ctx.auth.grants.list();

  ctx.clock.advance(30_000);

  await ctx.auth.verify(tokens.accessToken);

  const [second] = await ctx.auth.grants.list();

  ctx.clock.advance(31_000);

  await ctx.auth.verify(tokens.accessToken);

  const [third] = await ctx.auth.grants.list();

  expect(second?.lastUsedAt).toBe(first?.lastUsedAt ?? null);
  expect(third?.lastUsedAt).toBe(new Date(ctx.clock.now()).toISOString());
});
