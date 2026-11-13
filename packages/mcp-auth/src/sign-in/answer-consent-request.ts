import { toTagged } from '@zgeoff/std';
import { CODE_SECONDS } from '../store/create-auth-server.ts';
import type { OAuthClientID, Requester } from '../types.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';
import { readForm } from '../utils/read-form.ts';
import { buildConsentBinding } from './build-consent-binding.ts';
import { pickConsentChoice } from './pick-consent-choice.ts';
import { pickConsentOutcome } from './pick-consent-outcome.ts';
import { readSessionID } from './read-session-id.ts';
import { readStoredClientName } from './read-stored-client-name.ts';
import { readURLField } from './read-url-field.ts';
import { renderConsentPage } from './render-consent-page.ts';
import type { RouteContext } from './route-context.ts';
import { verifyOAuthQuery } from './verify-oauth-query.ts';

const EXPIRED_MESSAGE = 'This sign-in expired or was already used. Start again from the client.';

export async function answerConsentRequest(
  ctx: RouteContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  const url = new URL(request.url);

  const isPost = request.method === 'POST';
  const form = isPost ? await readForm(request) : new URLSearchParams();
  const oauthQuery = isPost ? (form.get('oauth_query') ?? '') : url.search.slice(1);
  const cookie = request.headers.get('cookie');

  const verified = await verifyConsentRequest(ctx, oauthQuery, cookie);

  if (verified === null) {
    return buildPageResponse(400, { message: EXPIRED_MESSAGE });
  }

  const params = new URLSearchParams(oauthQuery);

  const redirectURI = params.get('redirect_uri') ?? '';
  const clientID = toTagged<OAuthClientID>(params.get('client_id') ?? '');

  const clientName = await readStoredClientName(ctx.store, clientID);

  const requested = (params.get('scope') ?? '').split(' ');
  const offered = ctx.scopes.filter((scope) => requested.includes(scope));

  // The form's answer redirects to the client, which the page's form-action
  // policy has to allow.
  const formTargets = URL.canParse(redirectURI) ? [new URL(redirectURI).origin] : [];

  const renderPage = (status: number, error: string | null) =>
    buildPageResponse(
      status,
      {
        page: renderConsentPage({
          consentPath: ctx.paths.browser.consent,
          oauthQuery,
          clientName,
          redirectURI,
          scopes: offered,
          extraFields:
            ctx.consentFields?.renderConsentFields({ clientID, clientName, scopes: offered }) ?? '',
          error,
        }),
      },
      formTargets,
    );

  if (!isPost) {
    return renderPage(200, null);
  }

  const choice = pickConsentChoice(offered, form.getAll('scope'), form.get('decision'));
  const parsed = choice.accept ? ctx.consentFields?.parseConsentFields(form) : undefined;

  if (parsed?.ok === false) {
    return renderPage(400, parsed.error);
  }

  // Either answer ends the session's binding, so one login approves one
  // request.
  ctx.signIns.removeApproved(verified.sessionID);

  const limits = parsed === undefined ? null : parsed.limits;

  if (choice.accept) {
    await writeGrantChoice(ctx, verified.sessionID, {
      scopes: choice.scopes,
      limits: limits === null ? null : JSON.stringify(limits),
    });
  }

  const consented = await ctx.store.auth.handler(
    new Request(`${ctx.origin}/oauth2/consent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        origin: ctx.origin,
        ...(cookie === null ? {} : { cookie }),
      },
      body: JSON.stringify({
        accept: choice.accept,
        ...(choice.scope === null ? {} : { scope: choice.scope }),
        oauth_query: oauthQuery,
      }),
    }),
  );

  const answer: unknown = await consented.json();

  const next = readURLField(answer);
  const isIssued = consented.ok && next !== null && new URL(next).searchParams.has('code');

  // The code exchange still needs the session, so it stays until the code
  // expires; an answer that issued no code deletes it now.
  await (isIssued
    ? ctx.store.db
        .updateTable('session')
        .set({ expiresAt: new Date(ctx.clock.now() + CODE_SECONDS * 1000).toISOString() })
        .where('id', '=', verified.sessionID)
        .execute()
    : ctx.store.db.deleteFrom('session').where('id', '=', verified.sessionID).execute());

  ctx.security.record({
    ...pickConsentOutcome(isIssued, choice.noneTicked),
    path: url.pathname,
    requester,
    client: { id: clientID, name: clientName },
    correlationID: verified.correlationID,
  });

  if (!consented.ok || next === null) {
    return buildPageResponse(400, {
      message: `${ctx.productName} could not record this choice. Start again from the client.`,
    });
  }

  const authContext = await ctx.store.auth.$context;

  const sessionCookie = authContext.authCookies.sessionToken;
  const secure = sessionCookie.attributes.secure === true ? '; Secure' : '';

  return new Response(null, {
    status: 302,
    headers: {
      location: next,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'set-cookie': `${sessionCookie.name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}

interface VerifiedConsent {
  readonly sessionID: string;
  readonly correlationID: Parameters<RouteContext['signIns']['recordApproved']>[1]['correlationID'];
}

async function verifyConsentRequest(
  ctx: RouteContext,
  oauthQuery: string,
  cookie: string | null,
): Promise<VerifiedConsent | null> {
  const authContext = await ctx.store.auth.$context;

  if (!(await verifyOAuthQuery(oauthQuery, authContext.secret, ctx.clock.now()))) {
    return null;
  }

  // A query still asking for a login is one better-auth signed for the login
  // page, which no passkey login carried past.
  const prompt = (new URLSearchParams(oauthQuery).get('prompt') ?? '').split(' ');

  if (prompt.includes('login')) {
    return null;
  }

  const sessionID = await readSessionID(ctx.store, cookie);

  const approved = sessionID === null ? null : ctx.signIns.findApproved(sessionID);

  if (
    sessionID === null ||
    approved === null ||
    approved.binding !== buildConsentBinding(oauthQuery)
  ) {
    return null;
  }

  return { sessionID, correlationID: approved.correlationID };
}

interface GrantChoice {
  readonly scopes: readonly string[];
  readonly limits: string | null;
}

// The session belongs to one grant row, which the consent fills in before a
// code is issued, so no token ever exists for a grant without its scopes.
async function writeGrantChoice(
  ctx: RouteContext,
  sessionID: string,
  choice: GrantChoice,
): Promise<void> {
  const session = await ctx.store.db
    .selectFrom('session')
    .select('userId')
    .where('id', '=', sessionID)
    .executeTakeFirst();

  if (session === undefined) {
    return;
  }

  await ctx.store.db
    .updateTable('user')
    .set({ scopes: JSON.stringify(choice.scopes), limits: choice.limits })
    .where('id', '=', session.userId)
    .execute();
}
