import { createHash, timingSafeEqual } from 'node:crypto';
import { toTagged } from '@zgeoff/std';
import type { ServiceSnapshot } from '../service-tokens/build-service-snapshot.ts';
import { ISSUED_TOKEN_SECONDS } from '../service-tokens/create-issued-tokens.ts';
import { parseBasicCredentials } from '../service-tokens/parse-basic-credentials.ts';
import type { BasicCredentials } from '../service-tokens/parse-basic-credentials.ts';
import type { RouteContext } from '../sign-in/route-context.ts';
import type { OAuthClientID, Requester } from '../types.ts';
import { buildOAuthError } from './build-oauth-error.ts';
import { pickClientCredentialsScopes } from './pick-client-credentials-scopes.ts';

// The client_credentials grant, answered here and never by better-auth, whose
// own grant keeps one secret per client in its tables.
export function answerClientCredentialsRequest(
  ctx: RouteContext,
  request: Request,
  form: Readonly<URLSearchParams>,
  requester: Requester,
): Response {
  const snapshot = ctx.services.findSnapshot();
  const claimed = parseBasicCredentials(request.headers.get('authorization'));
  const outcome = decideOutcome(ctx, snapshot, claimed, form);

  const claimedClient =
    snapshot === null || claimed === null
      ? undefined
      : snapshot.file.clients.find((client) => `service:${client.name}` === claimed.clientID);

  const client =
    claimedClient === undefined
      ? {}
      : {
          client: {
            id: toTagged<OAuthClientID>(`service:${claimedClient.name}`),
            name: `service:${claimedClient.name}`,
          },
        };

  ctx.security.record({
    kind: 'token_exchange',
    ...(outcome.error === null
      ? { outcome: 'succeeded' as const }
      : { outcome: 'rejected' as const, reason: outcome.error }),
    path: new URL(request.url).pathname,
    requester,
    ...client,
  });

  return outcome.response;
}

interface Outcome {
  readonly response: Response;

  // Null for a success.
  readonly error: string | null;
}

function decideOutcome(
  ctx: RouteContext,
  snapshot: ServiceSnapshot<string> | null,
  claimed: BasicCredentials | null,
  form: Readonly<URLSearchParams>,
): Outcome {
  if (snapshot === null || snapshot.secrets.length === 0) {
    return refuse(400, 'unsupported_grant_type', 'the server has no service clients with secrets');
  }

  const authenticated = readAuthenticatedClient(ctx, snapshot, claimed, form);

  if ('response' in authenticated) {
    return authenticated;
  }

  const scopes = pickClientCredentialsScopes(form.get('scope'), authenticated.scopes);

  if (scopes === null) {
    return refuse(400, 'invalid_scope', 'the client does not hold a requested scope');
  }

  const resources = form.getAll('resource');

  if (resources.length > 1 || (resources[0] !== undefined && resources[0] !== ctx.resource)) {
    return refuse(400, 'invalid_target', `the only resource is ${ctx.resource}`);
  }

  const token = ctx.services.issued.writeToken(authenticated.name, scopes);

  if (token === null) {
    return refuse(503, 'temporarily_unavailable', 'too many access tokens are live; retry later');
  }

  return {
    error: null,
    response: Response.json(
      {
        access_token: token,
        token_type: 'Bearer',
        expires_in: ISSUED_TOKEN_SECONDS,
        scope: scopes.join(' '),
      },
      { headers: { 'cache-control': 'no-store' } },
    ),
  };
}

function refuse(
  status: number,
  error: string,
  description: string,
  headers: Readonly<Record<string, string>> = {},
): Outcome {
  return { error, response: buildOAuthError(status, error, description, headers) };
}

function readAuthenticatedClient(
  ctx: RouteContext,
  snapshot: ServiceSnapshot<string>,
  claimed: BasicCredentials | null,
  form: Readonly<URLSearchParams>,
): Outcome | { readonly name: string; readonly scopes: readonly string[] } {
  const refusal = refuseClient(ctx, 'the client did not authenticate with client_secret_basic');

  if (
    claimed === null ||
    form.has('client_secret') ||
    form.has('client_assertion') ||
    form.has('client_assertion_type') ||
    (form.has('client_id') && form.get('client_id') !== claimed.clientID)
  ) {
    return refusal;
  }

  const presented = createHash('sha256').update(claimed.secret).digest();
  let isMatch = false;

  // Every stored digest is compared, so the time taken does not say which one
  // matched.
  for (const entry of snapshot.secrets) {
    const isEqual = timingSafeEqual(presented, entry.digest);

    isMatch ||= isEqual && entry.clientID === claimed.clientID;
  }

  const client = snapshot.file.clients.find(
    (candidate) => `service:${candidate.name}` === claimed.clientID,
  );

  return isMatch && client !== undefined ? client : refusal;
}

function refuseClient(ctx: RouteContext, description: string): Outcome {
  return refuse(401, 'invalid_client', description, {
    'www-authenticate': `Basic realm="${ctx.origin}"`,
  });
}
