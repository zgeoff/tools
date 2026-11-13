import type { RouteContext } from '../sign-in/route-context.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import type { GrantID, Requester } from '../types.ts';
import { deriveTokenHash } from '../utils/derive-token-hash.ts';
import { readBodyText } from '../utils/read-body-text.ts';
import { MAX_FORM_BYTES } from '../utils/read-form.ts';
import { buildBetterAuthRequest } from './build-better-auth-request.ts';
import { buildOAuthError } from './build-oauth-error.ts';
import { recordTokenExchange } from './record-token-exchange.ts';
import { removeTokenSessions } from './remove-token-sessions.ts';

export async function answerTokenRequest(
  ctx: RouteContext,
  request: Request,
  requester: Requester,
): Promise<Response> {
  const body = await readBodyText(request, MAX_FORM_BYTES);

  if (body === null) {
    return buildOAuthError(400, 'invalid_request', 'the request body is missing or too large');
  }

  const form = new URLSearchParams(body);

  const refreshing = await readRefreshToken(ctx, form);

  // A refresh token that its own client presents after the core replaced it
  // means the client lost track of its tokens, or someone copied them.
  if (refreshing?.isSpent === true && refreshing.clientID === form.get('client_id')) {
    await removeGrantRows(ctx.store, [refreshing.grantID]);

    return buildOAuthError(400, 'invalid_grant', 'the refresh token was already used');
  }

  const response = await ctx.store.auth.handler(
    buildBetterAuthRequest(ctx.origin, request, { path: '/oauth2/token', body }),
  );

  if (response.ok) {
    await removeTokenSessions(ctx.store);
  }

  const answer = response.ok
    ? response
    : await readRefusal(ctx, { response, grantID: refreshing?.grantID ?? null });

  await recordTokenExchange(ctx, {
    form,
    response: answer,
    path: new URL(request.url).pathname,
    requester,
  });

  return answer;
}

interface RefreshToken {
  readonly grantID: GrantID;
  readonly clientID: string;
  readonly isSpent: boolean;
}

// The refresh token of a refresh request, read before better-auth spends it.
async function readRefreshToken(
  ctx: RouteContext,
  form: Readonly<URLSearchParams>,
): Promise<RefreshToken | null> {
  const refreshToken = form.get('refresh_token');

  if (form.get('grant_type') !== 'refresh_token' || refreshToken === null) {
    return null;
  }

  const row = await ctx.store.db
    .selectFrom('oauthRefreshToken')
    .select(['userId', 'clientId', 'revoked', 'rotatedAt'])
    .where('token', '=', deriveTokenHash(refreshToken))
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  return {
    grantID: row.userId,
    clientID: row.clientId,
    isSpent: row.revoked !== null || row.rotatedAt !== null,
  };
}

interface Refusal {
  readonly response: Response;
  readonly grantID: GrantID | null;
}

// A refresh that loses a race with a revoke fails inside better-auth, on the
// foreign key of its new tokens or as `user not found`. The grant is gone then.
async function readRefusal(ctx: RouteContext, refusal: Refusal): Promise<Response> {
  if (refusal.grantID !== null) {
    const grant = await ctx.store.db
      .selectFrom('user')
      .select('id')
      .where('id', '=', refusal.grantID)
      .executeTakeFirst();

    if (grant === undefined) {
      return buildOAuthError(400, 'invalid_grant', 'the grant was revoked');
    }
  }

  return refusal.response;
}
