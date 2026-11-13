import { toTagged } from '@zgeoff/std';
import type { OAuthClientID, Requester } from '../types.ts';
import { buildPageResponse } from '../utils/build-page-response.ts';
import { readStoredClientName } from './read-stored-client-name.ts';
import type { RouteContext } from './route-context.ts';

export async function answerAuthorizeRequest(
  ctx: RouteContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.searchParams);

  // Every sign-in asks for a fresh passkey login and the consent page, whatever
  // session or consent the browser kept.
  params.set('prompt', 'login consent');

  const asked = (params.get('scope') ?? '').split(' ').filter((item) => item !== '');

  params.set(
    'scope',
    [...new Set([...(asked.length === 0 ? ctx.scopes : asked), 'offline_access'])].join(' '),
  );

  if (!params.has('resource')) {
    params.set('resource', ctx.resource);
  }

  const response = await ctx.store.auth.handler(
    new Request(`${ctx.origin}/oauth2/authorize?${params.toString()}`, {
      headers: { accept: 'text/html' },
    }),
  );

  const location = response.headers.get('location');
  const target = location === null ? null : new URL(location, ctx.origin);

  if (
    target === null ||
    target.origin !== ctx.origin ||
    target.pathname !== ctx.paths.browser.login
  ) {
    await recordInvalidRequest(ctx, { url, requester, target });

    return response;
  }

  const clientID = toTagged<OAuthClientID>(target.searchParams.get('client_id') ?? '');
  const redirectURI = target.searchParams.get('redirect_uri') ?? '';

  const clientName = await readStoredClientName(ctx.store, clientID);

  const context = { path: url.pathname, requester, client: { id: clientID, name: clientName } };

  const signIn = ctx.signIns.createPending({
    key: target.search.slice(1),
    clientID,
    clientName,
    redirectURI,
  });

  if (signIn === null) {
    ctx.security.record({
      kind: 'authorize_started',
      outcome: 'rejected',
      reason: 'rate_limited',
      ...context,
    });

    return buildPageResponse(429, {
      message: 'Too many sign-ins started in the last minute. Wait a minute, then start again.',
    });
  }

  ctx.security.record({
    kind: 'authorize_started',
    outcome: 'accepted',
    ...context,
    correlationID: signIn.correlationID,
  });

  return response;
}

interface InvalidRequest {
  readonly url: URL;
  readonly requester: Requester;
  readonly target: URL | null;
}

// The better-auth error codes an `authorize_invalid` event may hold; any other
// code becomes `other`.
const AUTHORIZE_ERRORS: ReadonlySet<string> = new Set([
  'invalid_client',
  'client_disabled',
  'invalid_redirect',
  'unauthorized_client',
  'unsupported_response_type',
  'invalid_request',
  'invalid_scope',
  'invalid_target',
]);

// The event holds the client's id and name only for a client the core holds.
async function recordInvalidRequest(ctx: RouteContext, invalid: InvalidRequest): Promise<void> {
  const code = invalid.target?.searchParams.get('error') ?? null;
  const clientParam = invalid.url.searchParams.get('client_id');
  const clientID = clientParam === null ? null : toTagged<OAuthClientID>(clientParam);

  const stored =
    clientID === null
      ? null
      : await ctx.store.db
          .selectFrom('oauthClient')
          .select('clientId')
          .where('clientId', '=', clientID)
          .executeTakeFirst();

  const name =
    clientID === null || stored === null || stored === undefined
      ? null
      : await readStoredClientName(ctx.store, clientID);

  ctx.security.record({
    kind: 'authorize_invalid',
    outcome: 'rejected',
    reason: code !== null && AUTHORIZE_ERRORS.has(code) ? code : 'other',
    path: invalid.url.pathname,
    requester: invalid.requester,
    ...(clientID === null || name === null ? {} : { client: { id: clientID, name } }),
  });
}
