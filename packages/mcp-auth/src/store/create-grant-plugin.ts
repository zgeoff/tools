import { getOAuthProviderApi } from '@better-auth/oauth-provider';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { generateRandomString } from 'better-auth/crypto';
import { z } from 'zod';

// better-auth needs a unique email on every user row; no mail ever reaches it.
const GRANT_EMAIL_DOMAIN = 'grant.invalid';

const SignInBodySchema = z.object({
  oauth_query: z.string().optional(),
  clientID: z.string().min(1),
  clientName: z.string().min(1),
});

// Every endpoint is server-only: better-auth refuses it over HTTP, so only the
// core's own routes reach it, after they check what it guards.
export function createGrantPlugin() {
  return {
    id: 'mcp-auth-grant',
    endpoints: {
      signInGrant: createAuthEndpoint(
        '/mcp-auth/sign-in-grant',
        { method: 'POST', body: SignInBodySchema, metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const adapter = ctx.context.internalAdapter;
          const id = generateRandomString(32, 'a-z', 'A-Z', '0-9');

          const user = await adapter.createUser(
            {
              id,
              email: `${id}@${GRANT_EMAIL_DOMAIN}`,
              name: ctx.body.clientName,
              emailVerified: true,
              clientId: ctx.body.clientID,
              approvedBy: 'passkey',
            },
            { method: 'admin' },
          );

          const session = await adapter.createSession(user.id);

          await setSessionCookie(ctx, { session, user });

          return ctx.json({ signedIn: true });
        },
      ),
      verifyAccessToken: createAuthEndpoint(
        '/mcp-auth/verify-access-token',
        { method: 'POST', body: z.object({ token: z.string() }), metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const provider = ctx.context.getPlugin('oauth-provider');

          if (provider === null) {
            throw new Error('the oauth-provider plugin is not installed');
          }

          const payload = await getOAuthProviderApi(ctx, provider.options).requireActiveAccessToken(
            ctx.body.token,
          );

          return ctx.json(payload);
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
