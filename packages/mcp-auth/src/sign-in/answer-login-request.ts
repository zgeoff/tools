import { PASSKEY_SCRIPT } from '../passkeys/passkey-script.ts';
import { readPasskeyRows } from '../passkeys/read-passkey-rows.ts';
import { renderLoginPage } from '../passkeys/render-login-page.ts';
import { verifyPasskeyAssertion } from '../passkeys/verify-passkey-assertion.ts';
import { verifySessionPasskey } from '../passkeys/verify-session-passkey.ts';
import type { PasskeyID, Requester, SecurityEvent } from '../types.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';
import { readForm } from '../utils/read-form.ts';
import { buildConsentBinding } from './build-consent-binding.ts';
import type { PendingSignIn } from './create-sign-in-state.ts';
import { readSessionID } from './read-session-id.ts';
import { readURLField } from './read-url-field.ts';
import type { RouteContext } from './route-context.ts';

const EXPIRED_MESSAGE = 'This sign-in expired or was already used. Start again from the client.';

export async function answerLoginRequest(
  ctx: RouteContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  const url = new URL(request.url);

  const isPost = request.method === 'POST';
  const form = isPost ? await readForm(request) : new URLSearchParams();
  const oauthQuery = isPost ? (form.get('oauth_query') ?? '') : url.search.slice(1);
  const signIn = ctx.signIns.findPending(oauthQuery);

  if (signIn === null) {
    if (isPost) {
      ctx.security.record({
        kind: 'owner_auth',
        outcome: 'failed',
        reason: 'expired',
        path: url.pathname,
        requester,
      });
    }

    return buildPageResponse(400, { message: EXPIRED_MESSAGE });
  }

  const view = {
    productName: ctx.productName,
    loginPath: ctx.paths.browser.login,
    oauthQuery,
    clientName: signIn.clientName,
    redirectURI: signIn.redirectURI,
  };

  const isEnrolled = await probePasskey(ctx);

  if (!isPost) {
    return isEnrolled
      ? buildSignInResponse(ctx, 200, view, null)
      : buildPageResponse(200, { page: renderLoginPage({ ...view, options: null, error: null }) });
  }

  // Read before the assertion is checked, since a login or the last failure
  // ends the sign-in.
  const context = {
    path: url.pathname,
    requester,
    client: { id: signIn.clientID, name: signIn.clientName },
    correlationID: signIn.correlationID,
  };

  if (!isEnrolled) {
    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: 'not_enrolled',
      ...context,
    });

    return buildPageResponse(400, {
      page: renderLoginPage({ ...view, options: null, error: null }),
    });
  }

  // The challenge is taken whether or not the assertion verifies, so it counts
  // once.
  const taken = ctx.signIns.claimChallenge(oauthQuery);

  const passkeyID =
    taken.kind === 'taken'
      ? await verifyPasskeyAssertion(ctx.store, {
          credential: form.get('credential') ?? '',
          challenge: taken.challenge,
          origin: ctx.origin,
          rpID: new URL(ctx.origin).hostname,
        })
      : null;

  if (passkeyID === null) {
    const reason = taken.kind === 'expired' ? 'expired' : 'assertion_failed';

    if (ctx.signIns.recordFailure(oauthQuery) === 'locked') {
      ctx.security.record({ kind: 'owner_auth', outcome: 'failed', reason: 'locked', ...context });

      return buildPageResponse(400, {
        message: 'Too many failed sign-ins. Start again from the client.',
      });
    }

    ctx.security.record({ kind: 'owner_auth', outcome: 'failed', reason, ...context });

    const error =
      reason === 'expired'
        ? 'The sign-in took too long. Try again.'
        : `That passkey did not sign you in. Try again with a passkey enrolled for ${ctx.productName}.`;

    return buildSignInResponse(ctx, 400, view, error);
  }

  ctx.signIns.removePending(oauthQuery);

  return completeLogin(ctx, { oauthQuery, signIn, passkeyID, context });
}

async function probePasskey(ctx: RouteContext): Promise<boolean> {
  const rows = await readPasskeyRows(ctx.store.db, ctx.store.options.tables.passkey, null);

  return rows.length > 0;
}

interface LoginView {
  readonly productName: string;
  readonly loginPath: string;
  readonly oauthQuery: string;
  readonly clientName: string;
  readonly redirectURI: string;
}

// How long the browser's passkey prompt waits, in milliseconds.
const PROMPT_TIMEOUT_MS = 120_000;

// The sign-in page with a fresh challenge for its request. The options list no
// credential, so the authenticator offers the passkeys it holds for the RP ID,
// and they require user verification.
function buildSignInResponse(
  ctx: RouteContext,
  status: number,
  view: LoginView,
  error: string | null,
): Response {
  const challenge = ctx.signIns.mintChallenge(view.oauthQuery);

  if (challenge === null) {
    return buildPageResponse(400, { message: EXPIRED_MESSAGE });
  }

  const options = {
    challenge,
    rpId: new URL(ctx.origin).hostname,
    timeout: PROMPT_TIMEOUT_MS,
    userVerification: 'required',
    allowCredentials: [],
  };

  return buildPageResponse(
    status,
    { page: renderLoginPage({ ...view, options, error }) },
    [],
    [PASSKEY_SCRIPT.policySource],
  );
}

const RESTART_MESSAGE = 'The sign-in could not continue. Start again from the client.';

interface LoginCompletion {
  readonly oauthQuery: string;
  readonly signIn: PendingSignIn;
  readonly passkeyID: PasskeyID;
  readonly context: Pick<SecurityEvent, 'path' | 'requester' | 'client' | 'correlationID'>;
}

// The passkey signed in: a grant row and its session come into being, and the
// authorization resumes at the consent page.
async function completeLogin(ctx: RouteContext, login: LoginCompletion): Promise<Response> {
  const context = login.context;

  // Resuming the authorization reads the request better-auth was called with.
  const headers = new Headers({ accept: 'application/json', 'content-type': 'application/json' });

  const signedIn = await ctx.store.auth.api.signInGrant({
    body: {
      oauth_query: login.oauthQuery,
      clientID: login.signIn.clientID,
      clientName: login.signIn.clientName,
    },
    headers,
    request: new Request(`${ctx.origin}/mcp-auth/sign-in-grant`, { method: 'POST', headers }),
    asResponse: true,
  });

  const answer: unknown = await signedIn.json();

  const next = readURLField(answer);
  const setCookies = signedIn.headers.getSetCookie();
  const cookie = setCookies.map((line) => line.split(';')[0]).join('; ');

  const sessionID = await readSessionID(ctx.store, cookie);

  if (!signedIn.ok || next === null || sessionID === null) {
    ctx.security.record({ kind: 'owner_auth', outcome: 'failed', ...context });

    return buildPageResponse(400, { message: RESTART_MESSAGE });
  }

  const isStillEnrolled = await verifySessionPasskey(ctx.store, {
    sessionID,
    passkeyID: login.passkeyID,
  });

  if (!isStillEnrolled) {
    ctx.security.record({
      kind: 'owner_auth',
      outcome: 'failed',
      reason: 'not_enrolled',
      ...context,
    });

    return buildPageResponse(400, {
      message: 'The passkey that signed you in is no longer enrolled. Start again from the client.',
    });
  }

  ctx.signIns.recordApproved(sessionID, {
    binding: buildConsentBinding(login.oauthQuery),
    correlationID: login.signIn.correlationID,
  });

  ctx.security.record({ kind: 'owner_auth', outcome: 'succeeded', ...context });

  const redirect = new Headers({ location: new URL(next, ctx.origin).href });

  for (const line of setCookies) {
    redirect.append('set-cookie', line);
  }

  return new Response(null, { status: 302, headers: redirect });
}
