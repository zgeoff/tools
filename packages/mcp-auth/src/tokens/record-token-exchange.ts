import { toTagged } from '@zgeoff/std';
import { readStoredClientName } from '../sign-in/read-stored-client-name.ts';
import type { RouteContext } from '../sign-in/route-context.ts';
import type { OAuthClientID, Requester } from '../types.ts';
import { readErrorCode } from './read-error-code.ts';

interface TokenExchange {
  // The request's form, read only for its client id.
  readonly form: Readonly<URLSearchParams>;
  readonly response: Response;
  readonly path: string;
  readonly requester: Requester;
}

// A fixed list keeps the reason a value a log rule can match, whatever text a
// future better-auth puts in its error field.
const TOKEN_EXCHANGE_ERRORS: ReadonlySet<string> = new Set([
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
  'invalid_target',
  'temporarily_unavailable',
]);

// The event holds an error code from the fixed list, and the client's id and
// name only for a client the core holds. It never holds a code, a verifier or
// a token the request carried.
export async function recordTokenExchange(
  ctx: RouteContext,
  exchange: TokenExchange,
): Promise<void> {
  const clientParam = exchange.form.get('client_id');
  const clientID = clientParam === null ? null : toTagged<OAuthClientID>(clientParam);

  const held =
    clientID === null
      ? undefined
      : await ctx.store.db
          .selectFrom('oauthClient')
          .select('clientId')
          .where('clientId', '=', clientID)
          .executeTakeFirst();

  const client =
    clientID === null || held === undefined
      ? {}
      : { client: { id: clientID, name: await readStoredClientName(ctx.store, clientID) } };

  if (exchange.response.ok) {
    ctx.security.record({
      kind: 'token_exchange',
      outcome: 'succeeded',
      path: exchange.path,
      requester: exchange.requester,
      ...client,
    });

    return;
  }

  const code = await readErrorCode(exchange.response);

  ctx.security.record({
    kind: 'token_exchange',
    outcome: 'rejected',
    reason: code !== null && TOKEN_EXCHANGE_ERRORS.has(code) ? code : 'other',
    path: exchange.path,
    requester: exchange.requester,
    ...client,
  });
}
