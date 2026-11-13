import type { RouteContext } from '../sign-in/route-context.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import { deriveTokenHash } from '../utils/derive-token-hash.ts';
import { readBodyText } from '../utils/read-body-text.ts';
import { MAX_FORM_BYTES } from '../utils/read-form.ts';
import { buildBetterAuthRequest } from './build-better-auth-request.ts';
import { buildOAuthError } from './build-oauth-error.ts';
import { readErrorDescription } from './read-error-description.ts';

export async function answerRevokeRequest(ctx: RouteContext, request: Request): Promise<Response> {
  const body = await readBodyText(request, MAX_FORM_BYTES);

  if (body === null) {
    return buildOAuthError(400, 'invalid_request', 'the request body is missing or too large');
  }

  const form = new URLSearchParams(body);

  const owner = await ctx.store.db
    .selectFrom('oauthRefreshToken')
    .select(['userId', 'clientId'])
    .where('token', '=', deriveTokenHash(form.get('token') ?? ''))
    .executeTakeFirst();

  const response = await ctx.store.auth.handler(
    buildBetterAuthRequest(ctx.origin, request, { path: '/oauth2/revoke', body }),
  );

  // RFC 7009: a token the server does not know is answered as revoked.
  if (owner === undefined && response.status === 400) {
    const refusal: unknown = await response
      .clone()
      .json()
      .catch(() => null);

    if (readErrorDescription(refusal) === 'token not found') {
      return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } });
    }
  }

  // Only the client a refresh token belongs to ends its grant.
  if (response.ok && owner !== undefined && owner.clientId === form.get('client_id')) {
    await removeGrantRows(ctx.store, [owner.userId]);
  }

  return response;
}
