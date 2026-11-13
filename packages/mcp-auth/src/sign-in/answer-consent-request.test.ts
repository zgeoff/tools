import { expect, onTestFinished, test } from 'bun:test';
import { z } from 'zod';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { runSignInToConsent } from '../test-utils/run-sign-in-to-consent.ts';
import type { GrantLimits } from '../types.ts';

async function setupTest() {
  const grantLimits: GrantLimits<{ imps: string[] }> = {
    renderConsentFields: () => '<input name="imp" value="web-*">',
    parseConsentFields: (form) => {
      const imp = form.get('imp') ?? '';

      return imp === ''
        ? { ok: false, error: 'Pick an imp.' }
        : { ok: true, limits: { imps: [imp] } };
    },
    parseStored: () => null,
    check: () => Promise.resolve({ kind: 'allow', scopes: [] }),
  };

  const server = await openTestAuth({ grantLimits });

  onTestFinished(() => server.close());

  const requester = buildTestRequester();

  return {
    ...server,
    startConsent: () => runSignInToConsent(server.auth, { scopes: ['read', 'write'] }),
    readConsentPage: (consent: URL, cookie: string) =>
      server.auth.routes.consent(new Request(consent.href, { headers: { cookie } }), requester),
    postConsent: (fields: URLSearchParams, cookie: string, origin = 'https://app.example') =>
      server.auth.routes.consent(
        buildFormRequest('https://app.example/consent', fields, { origin, cookie }),
        requester,
      ),
  };
}

test('#answerConsentRequest offers the scopes the client asked for, and the fields of the app', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();
  const page = await ctx.readConsentPage(signIn.consent, signIn.cookie);
  const html = await page.text();

  expect(page.status).toBe(200);
  expect(html).toInclude('name="scope" value="read"');
  expect(html).toInclude('name="scope" value="write"');
  expect(html).toInclude('<input name="imp" value="web-*">');
});

test('#answerConsentRequest refuses a consent page request with no session', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();
  const page = await ctx.readConsentPage(signIn.consent, '');

  expect(page.status).toBe(400);
});

test('#answerConsentRequest refuses a signed query that was changed', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const tampered = new URL(signIn.consent.href);

  tampered.searchParams.set('state', 'state-2');

  const page = await ctx.readConsentPage(tampered, signIn.cookie);

  expect(page.status).toBe(400);
});

test('#answerConsentRequest issues a code for the ticked scopes and writes them to the grant row', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const answer = await ctx.postConsent(
    new URLSearchParams({
      oauth_query: signIn.consent.search.slice(1),
      decision: 'approve',
      scope: 'read',
      imp: 'web-*',
    }),
    signIn.cookie,
  );

  const location = z.string().parse(answer.headers.get('location'));
  const row = ctx.database.query('select scopes, limits from user').get();

  expect(new URL(location).searchParams.has('code')).toBeTrue();
  expect(row).toStrictEqual({ scopes: '["read"]', limits: '{"imps":["web-*"]}' });
  expect(ctx.events.at(-1)).toMatchObject({ kind: 'consent', outcome: 'allowed' });
});

test('#answerConsentRequest ends the browser session cookie when it redirects', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const answer = await ctx.postConsent(
    new URLSearchParams({
      oauth_query: signIn.consent.search.slice(1),
      decision: 'approve',
      scope: 'read',
      imp: 'web-*',
    }),
    signIn.cookie,
  );

  expect(answer.headers.get('set-cookie')).toInclude('Max-Age=0');
});

test('#answerConsentRequest shows the error of the app and keeps the sign-in when its fields do not parse', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const fields = new URLSearchParams({
    oauth_query: signIn.consent.search.slice(1),
    decision: 'approve',
    scope: 'read',
  });

  const refused = await ctx.postConsent(fields, signIn.cookie);
  const refusedHTML = await refused.text();

  fields.set('imp', 'web-*');

  const retried = await ctx.postConsent(fields, signIn.cookie);

  expect(refused.status).toBe(400);
  expect(refusedHTML).toInclude('Pick an imp.');
  expect(retried.status).toBe(302);
});

test('#answerConsentRequest redirects to the client with access_denied when the owner denies', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const answer = await ctx.postConsent(
    new URLSearchParams({
      oauth_query: signIn.consent.search.slice(1),
      decision: 'deny',
      scope: 'read',
    }),
    signIn.cookie,
  );

  const location = new URL(z.string().parse(answer.headers.get('location')));

  expect(location.searchParams.get('error')).toBe('access_denied');
  expect(ctx.database.query('select scopes from user').get()).toStrictEqual({ scopes: null });
  expect(ctx.events.at(-1)).toMatchObject({ kind: 'consent', outcome: 'denied' });
});

test('#answerConsentRequest denies an allow with no scope ticked', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  await ctx.postConsent(
    new URLSearchParams({
      oauth_query: signIn.consent.search.slice(1),
      decision: 'approve',
      imp: 'web-*',
    }),
    signIn.cookie,
  );

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'consent',
    outcome: 'denied',
    reason: 'none_ticked',
  });
});

test('#answerConsentRequest lets one login approve one request', async () => {
  const ctx = await setupTest();
  const signIn = await ctx.startConsent();

  const fields = new URLSearchParams({
    oauth_query: signIn.consent.search.slice(1),
    decision: 'approve',
    scope: 'read',
    imp: 'web-*',
  });

  await ctx.postConsent(fields, signIn.cookie);

  const again = await ctx.postConsent(fields, signIn.cookie);

  expect(again.status).toBe(400);
});
