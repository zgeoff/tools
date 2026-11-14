import { isRecord } from '@zgeoff/std';
import type { RouteContext } from '../sign-in/route-context.ts';

const METADATA_HEADERS = { 'cache-control': 'no-store' };

// The metadata advertises only what the core's clients can use: public clients,
// client_secret_basic and client_credentials only while a service client holds
// a secret, no introspection endpoint, and no DPoP.
export async function answerMetadataRequest(
  ctx: RouteContext,
  kind: 'authorization-server' | 'resource',
): Promise<Response> {
  const path =
    kind === 'resource'
      ? '/.well-known/oauth-protected-resource'
      : '/.well-known/oauth-authorization-server';

  const response = await ctx.store.auth.handler(new Request(`${ctx.origin}${path}`));
  const metadata: unknown = await response.json();

  if (!isRecord(metadata)) {
    return new Response(null, { status: 503 });
  }

  const advertised = Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) => !key.startsWith('introspection_') && !key.startsWith('dpop_'),
    ),
  );

  if (kind === 'resource') {
    return Response.json(
      { ...advertised, resource_name: ctx.productName },
      { status: response.status, headers: METADATA_HEADERS },
    );
  }

  const hasSecrets = (ctx.services.findSnapshot()?.secrets.length ?? 0) > 0;
  const advertisedGrants: unknown = advertised['grant_types_supported'];

  const grantTypes = Array.isArray(advertisedGrants)
    ? advertisedGrants.filter((grant): grant is string => typeof grant === 'string')
    : [];

  // better-auth serves its endpoints at fixed paths, and an app may serve
  // them at others.
  return Response.json(
    {
      ...advertised,
      ...(hasSecrets
        ? { grant_types_supported: [...new Set([...grantTypes, 'client_credentials'])] }
        : {}),
      authorization_endpoint: `${ctx.origin}${ctx.paths.browser.authorize}`,
      token_endpoint: `${ctx.origin}${ctx.paths.machine.token}`,
      revocation_endpoint: `${ctx.origin}${ctx.paths.machine.revoke}`,
      token_endpoint_auth_methods_supported: hasSecrets
        ? ['none', 'client_secret_basic']
        : ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
    },
    { headers: METADATA_HEADERS },
  );
}
