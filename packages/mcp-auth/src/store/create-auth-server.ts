import { randomBytes } from 'node:crypto';
import { mcp } from '@better-auth/mcp';
import { oauthProvider } from '@better-auth/oauth-provider';
import type { OAuthOptions, Scope as ProviderScope } from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import type { BetterAuthPlugin } from 'better-auth';
import type { Kysely } from 'kysely';
import type { MCPAuthPaths } from '../types.ts';
import { deriveTokenHash } from '../utils/derive-token-hash.ts';
import { createGrantPlugin } from './create-grant-plugin.ts';
import type { StoreSchema } from './store-schema.ts';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
export const CODE_SECONDS = 10 * 60;
export const SESSION_SECONDS = 30 * 60;

// A host with no origin, such as an admin command, builds a server that only
// shares the schema.
const SCHEMA_ORIGIN = 'http://127.0.0.1';

interface AuthServerOptions {
  readonly db: Kysely<StoreSchema>;
  readonly origin: string | null;
  readonly paths: MCPAuthPaths;
  readonly scopes: readonly string[];
}

export function createAuthServer(options: AuthServerOptions) {
  // better-auth reads these when it builds its context; an empty endpoint
  // turns its telemetry into a no-op.
  process.env['BETTER_AUTH_TELEMETRY'] = '0';
  process.env['BETTER_AUTH_TELEMETRY_ENDPOINT'] = '';

  const origin = options.origin ?? SCHEMA_ORIGIN;

  const providerOptions: OAuthOptions<ProviderScope[]> = {
    loginPage: options.paths.browser.login,
    consentPage: options.paths.browser.consent,
    scopes: [...options.scopes, 'offline_access'],
    disableJwtPlugin: true,
    allowDynamicClientRegistration: false,
    grantTypes: ['authorization_code', 'refresh_token'],

    // The server holds one resource, so every client may request it.
    enforcePerClientResources: false,
    accessTokenExpiresIn: ACCESS_TOKEN_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_SECONDS,
    codeExpiresIn: CODE_SECONDS,
    refreshTokenReuseInterval: 0,
    storeTokens: { hash: (token: string) => Promise.resolve(deriveTokenHash(token)) },
  };

  const provider =
    options.origin === null
      ? oauthProvider(providerOptions)
      : mcp({ ...providerOptions, resource: `${origin}${options.paths.machine.mcp}` });

  return betterAuth({
    baseURL: origin,
    basePath: '/',

    // Drawn at each open, so a restart ends the sign-ins in progress.
    secret: randomBytes(32).toString('base64url'),
    database: { db: options.db, type: 'sqlite' },
    telemetry: { enabled: false },
    logger: { disabled: true },

    // better-auth counts by client address, which a proxy hides, so all
    // callers would share one bucket. The core limits sign-ins itself, and a
    // guess fails on 32 random characters and PKCE.
    rateLimit: { enabled: false },
    advanced: { database: { validateSchema: false } },
    trustedOrigins: [origin],
    onAPIError: { errorURL: options.paths.browser.error },

    // A session carries one sign-in from the login page to the code exchange,
    // which detaches every token from it.
    session: { expiresIn: SESSION_SECONDS, disableSessionRefresh: true },
    user: {
      additionalFields: {
        clientId: { type: 'string', required: true, input: false },
        scopes: { type: 'string', required: false, input: false },
        approvedBy: { type: 'string', required: true, input: false },
        limits: { type: 'string', required: false, input: false },
        lastUsedAt: { type: 'date', required: false, input: false },
      },
    },

    // The provider's endpoint types do not satisfy the plugin type under
    // exactOptionalPropertyTypes.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- better-auth plugin type under exactOptionalPropertyTypes
    plugins: [provider as BetterAuthPlugin, createGrantPlugin()],
  });
}

export type AuthServer = ReturnType<typeof createAuthServer>;
