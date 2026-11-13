import { buildAdmin } from './admin/build-admin.ts';
import { readClientScopes } from './grants/read-client-scopes.ts';
import { verifyOAuthAccess } from './grants/verify-oauth-access.ts';
import { MCPAuthError } from './mcp-auth-error.ts';
import { createEnrollmentState } from './passkeys/create-enrollment-state.ts';
import { buildRoutes } from './routes/build-routes.ts';
import { buildServiceTokenVerifier } from './service-tokens/build-service-token-verifier.ts';
import { createSignInState } from './sign-in/create-sign-in-state.ts';
import type { RouteContext } from './sign-in/route-context.ts';
import { CODE_SECONDS } from './store/create-auth-server.ts';
import { openStore } from './store/open-store.ts';
import type { MCPAuth, MCPAuthOptions } from './types.ts';

export async function openMCPAuth<Scope extends string, Limits = null>(
  options: MCPAuthOptions<Scope, Limits>,
): Promise<MCPAuth<Scope, Limits>> {
  const resource = `${options.origin}${options.paths.machine.mcp}`;

  if (options.serviceTokens !== undefined && options.serviceTokens.file.resource !== resource) {
    throw new MCPAuthError(
      'invalid-setup',
      `the service token file names another resource than ${resource}`,
    );
  }

  const store = await openStore(options, { origin: options.origin, paths: options.paths });

  // A resource served under an earlier origin stays a valid token target until
  // its row goes.
  await store.db.deleteFrom('oauthResource').where('identifier', '!=', resource).execute();

  const signIns = createSignInState(CODE_SECONDS * 1000, options.clock.now);

  const routes = buildRoutes({
    store,
    origin: options.origin,
    resource,
    paths: options.paths,
    productName: options.productName,
    scopes: options.scopes,
    clock: options.clock,
    security: options.security,
    signIns,
    enrollments: createEnrollmentState(options.clock.now),
    consentFields: options.grantLimits ?? null,
  } satisfies RouteContext);

  const serviceTokens =
    options.serviceTokens === undefined
      ? null
      : buildServiceTokenVerifier(options.serviceTokens.file);

  const prefix = options.serviceTokens?.prefix ?? null;
  const scopes = options.scopes;
  const grantLimits = options.grantLimits ?? null;

  return {
    ...buildAdmin(store, signIns),
    resource,
    issuer: options.origin,
    paths: options.paths,
    routes,

    verify: (bearer) => {
      if (serviceTokens !== null && prefix !== null && bearer.startsWith(prefix)) {
        return Promise.resolve(serviceTokens.verify(bearer));
      }

      return verifyOAuthAccess(
        {
          store,
          resource,
          scopes,
          grantLimits,
        },
        bearer,
      );
    },

    // oxlint-disable-next-line zgeoff/verb-contract -- the contract names this call findClientScopes
    findClientScopes: (clientID) => {
      const service = serviceTokens?.findScopes(clientID) ?? null;

      return service === null
        ? readClientScopes(store, scopes, clientID)
        : Promise.resolve(service);
    },
  };
}
