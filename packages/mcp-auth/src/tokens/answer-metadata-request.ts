import { isRecord } from '@zgeoff/std';
import type { RouteContext } from '../sign-in/route-context.ts';

const METADATA_HEADERS = { 'cache-control': 'no-store' };

// The metadata advertises only what the core's clients can use: public clients
// with no client authentication, no introspection endpoint, and bearer tokens
// alone, so nothing about DPoP.
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

  // better-auth serves its endpoints at fixed paths, and an app may serve
  // them at others.
  return Response.json(
    {
      ...advertised,
      authorization_endpoint: `${ctx.origin}${ctx.paths.browser.authorize}`,
      token_endpoint: `${ctx.origin}${ctx.paths.machine.token}`,
      revocation_endpoint: `${ctx.origin}${ctx.paths.machine.revoke}`,
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
    },
    { headers: METADATA_HEADERS },
  );
}
