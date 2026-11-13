import { expect, onTestFinished, test } from 'bun:test';
import { buildFormRequest } from '../test-utils/build-form-request.ts';
import { buildStubAuthenticator } from '../test-utils/build-stub-authenticator.ts';
import { buildTestRequester } from '../test-utils/build-test-requester.ts';
import { openTestAuth } from '../test-utils/open-test-auth.ts';
import { parsePasskeyPage } from '../test-utils/parse-passkey-page.ts';

async function setupTest() {
  const server = await openTestAuth();

  onTestFinished(() => server.close());

  const requester = buildTestRequester();
  const authenticator = buildStubAuthenticator();

  const post = (fields: Record<string, string>) =>
    server.auth.routes.enroll(
      buildFormRequest('https://app.example/enroll', new URLSearchParams(fields), {
        origin: 'https://app.example',
      }),
      requester,
    );

  // The ceremony page for a token, and then the credential for its options.
  const startEnrollment = async (token: string) => {
    const page = await post({ token });
    const html = await page.text();

    return { page, html };
  };

  return { ...server, authenticator, post, startEnrollment, requester };
}

test('#answerEnrollRequest asks for the enrollment token on a get', async () => {
  const ctx = await setupTest();

  const page = await ctx.auth.routes.enroll(
    new Request('https://app.example/enroll'),
    ctx.requester,
  );

  const html = await page.text();

  expect(page.status).toBe(200);
  expect(html).toInclude('name="token"');
});

test('#answerEnrollRequest refuses a token it does not know and records it', async () => {
  const ctx = await setupTest();
  const answer = await ctx.post({ token: 'enroll-unknown' });

  expect(answer.status).toBe(400);

  expect(ctx.events.at(-1)).toMatchObject({
    kind: 'owner_auth',
    outcome: 'failed',
    reason: 'invalid_token',
  });
});

test('#answerEnrollRequest refuses a token after fifteen minutes', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();

  ctx.clock.advance(15 * 60_000);

  const answer = await ctx.post({ token });

  expect(answer.status).toBe(400);
});

test('#answerEnrollRequest enrolls a passkey for a token and lists it', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();
  const started = await ctx.startEnrollment(token);

  const ceremony = parsePasskeyPage(started.html);

  if (ceremony.mode !== 'create') {
    throw new Error('the enrollment page asked for a sign-in');
  }

  const registration = await ctx.authenticator.create(ceremony.options, {
    origin: 'https://app.example',
  });

  const answer = await ctx.post({ token, credential: JSON.stringify(registration) });
  const passkeys = await ctx.auth.passkeys.list();

  expect(answer.status).toBe(200);

  expect(passkeys).toStrictEqual([
    { id: ctx.authenticator.credentialID, createdAt: expect.any(String), lastUsedAt: null },
  ]);

  expect(ctx.events.at(-1)).toMatchObject({ kind: 'owner_auth', outcome: 'succeeded' });
});

test('#answerEnrollRequest lets one token enroll one passkey', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();
  const started = await ctx.startEnrollment(token);

  const ceremony = parsePasskeyPage(started.html);

  if (ceremony.mode !== 'create') {
    throw new Error('the enrollment page asked for a sign-in');
  }

  const registration = await ctx.authenticator.create(ceremony.options, {
    origin: 'https://app.example',
  });

  await ctx.post({ token, credential: JSON.stringify(registration) });

  const again = await ctx.post({ token });

  expect(again.status).toBe(400);
});

test('#answerEnrollRequest refuses a registration made for another origin and enrolls nothing', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();
  const started = await ctx.startEnrollment(token);

  const ceremony = parsePasskeyPage(started.html);

  if (ceremony.mode !== 'create') {
    throw new Error('the enrollment page asked for a sign-in');
  }

  const registration = await ctx.authenticator.create(ceremony.options, {
    origin: 'https://elsewhere.example',
  });

  const answer = await ctx.post({ token, credential: JSON.stringify(registration) });
  const passkeys = await ctx.auth.passkeys.list();

  expect(answer.status).toBe(400);
  expect(passkeys).toStrictEqual([]);
});

test('#answerEnrollRequest refuses a registration whose challenge is older than five minutes', async () => {
  const ctx = await setupTest();
  const token = await ctx.auth.passkeys.createEnrollmentToken();
  const started = await ctx.startEnrollment(token);

  const ceremony = parsePasskeyPage(started.html);

  if (ceremony.mode !== 'create') {
    throw new Error('the enrollment page asked for a sign-in');
  }

  const registration = await ctx.authenticator.create(ceremony.options, {
    origin: 'https://app.example',
  });

  ctx.clock.advance(5 * 60_000);

  const answer = await ctx.post({ token, credential: JSON.stringify(registration) });

  expect(answer.status).toBe(400);
  expect(ctx.events.at(-1)).toMatchObject({ reason: 'expired' });
});
