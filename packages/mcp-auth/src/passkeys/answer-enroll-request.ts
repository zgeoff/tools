import { toTagged } from '@zgeoff/std';
import type { RouteContext } from '../sign-in/route-context.ts';
import type { PasskeyID, Requester } from '../types.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';
import { readForm } from '../utils/read-form.ts';
import { createPasskey } from './create-passkey.ts';
import { PASSKEY_SCRIPT } from './passkey-script.ts';
import { readEnrollmentToken } from './read-enrollment-token.ts';
import { readPasskeyRows } from './read-passkey-rows.ts';
import { renderEnrollPage } from './render-enroll-page.ts';
import { verifyPasskeyRegistration } from './verify-passkey-registration.ts';

const INVALID_TOKEN_MESSAGE =
  'That enrollment token is unknown, used, or expired. Make a new one with the passkeys command on the host.';

export async function answerEnrollRequest(
  ctx: RouteContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  const view = { productName: ctx.productName, enrollPath: ctx.paths.browser.enroll };

  if (request.method !== 'POST') {
    return buildPageResponse(200, {
      page: renderEnrollPage({ ...view, ceremony: null, error: null }),
    });
  }

  const form = await readForm(request);

  const token = (form.get('token') ?? '').trim();
  const context = { path: new URL(request.url).pathname, requester };
  const tokenHash = token === '' ? null : await readEnrollmentToken(ctx.store, token);

  if (tokenHash === null) {
    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: 'invalid_token',
      ...context,
    });

    return buildPageResponse(400, {
      page: renderEnrollPage({ ...view, ceremony: null, error: INVALID_TOKEN_MESSAGE }),
    });
  }

  if (!form.has('credential')) {
    return answerCeremony(ctx, { status: 200, token, tokenHash, error: null });
  }

  const taken = ctx.enrollments.claimChallenge(tokenHash);

  const registered =
    taken.kind === 'taken'
      ? await verifyPasskeyRegistration({
          credential: form.get('credential') ?? '',
          challenge: taken.challenge,
          origin: ctx.origin,
          rpID: new URL(ctx.origin).hostname,
        })
      : null;

  if (registered === null) {
    const isExpired = taken.kind === 'expired';

    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: isExpired ? 'expired' : 'assertion_failed',
      ...context,
    });

    const error = isExpired
      ? 'The enrollment took too long. Try again.'
      : `${ctx.productName} could not enroll that passkey. Try again.`;

    return answerCeremony(ctx, { status: 400, token, tokenHash, error });
  }

  let isCreated: boolean;

  try {
    isCreated = await createPasskey(ctx.store, {
      tokenHash,
      id: toTagged<PasskeyID>(registered.id),
      publicKey: Buffer.from(registered.publicKey).toString('base64url'),
      counter: registered.counter,
      transports: registered.transports,
    });
  } catch {
    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: 'assertion_failed',
      ...context,
    });

    return answerCeremony(ctx, {
      status: 400,
      token,
      tokenHash,
      error: 'That passkey is already enrolled. Use another device, or sign in with it.',
    });
  }

  if (!isCreated) {
    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: 'invalid_token',
      ...context,
    });

    return buildPageResponse(400, {
      page: renderEnrollPage({ ...view, ceremony: null, error: INVALID_TOKEN_MESSAGE }),
    });
  }

  ctx.security.record({ kind: 'owner_auth', outcome: 'succeeded', ...context });

  return buildPageResponse(200, {
    message: 'Passkey enrolled. Start the connection again from your client and sign in with it.',
  });
}

interface CeremonyAnswer {
  readonly status: number;
  readonly token: string;
  readonly tokenHash: string;
  readonly error: string | null;
}

// How long the browser's passkey prompt waits, in milliseconds.
const PROMPT_TIMEOUT_MS = 120_000;

async function answerCeremony(ctx: RouteContext, answer: CeremonyAnswer): Promise<Response> {
  const enrolled = await readPasskeyRows(ctx.store.db, ctx.store.options.tables.passkey, null);

  // The one owner's WebAuthn user handle, the same for every passkey, so an
  // authenticator files each one under the one account.
  const ownerHandle = Buffer.from(`${ctx.productName}-owner`).toString('base64url');

  const options = {
    challenge: ctx.enrollments.mintChallenge(answer.tokenHash),
    rp: { id: new URL(ctx.origin).hostname, name: ctx.productName },
    user: { id: ownerHandle, name: 'owner', displayName: `${ctx.productName} owner` },
    pubKeyCredParams: [
      { type: 'public-key', alg: -8 },
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: PROMPT_TIMEOUT_MS,

    // An authenticator that already holds an enrolled passkey refuses to make
    // a second.
    excludeCredentials: enrolled.map((row) => ({ type: 'public-key', id: row.id })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    attestation: 'none',
  };

  return buildPageResponse(
    answer.status,
    {
      page: renderEnrollPage({
        productName: ctx.productName,
        enrollPath: ctx.paths.browser.enroll,
        ceremony: { token: answer.token, options },
        error: answer.error,
      }),
    },
    [],
    [PASSKEY_SCRIPT.policySource],
  );
}
