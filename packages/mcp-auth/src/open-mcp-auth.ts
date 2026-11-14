import { buildAdmin } from './admin/build-admin.ts';
import { readClientScopes } from './grants/read-client-scopes.ts';
import { verifyOAuthAccess } from './grants/verify-oauth-access.ts';
import { MCPAuthError } from './mcp-auth-error.ts';
import { createEnrollmentState } from './passkeys/create-enrollment-state.ts';
import { buildRoutes } from './routes/build-routes.ts';
import type { ServiceSnapshot } from './service-tokens/build-service-snapshot.ts';
import { ISSUED_TOKEN_PREFIX } from './service-tokens/create-issued-tokens.ts';
import { createServiceState } from './service-tokens/create-service-state.ts';
import type { ServiceState } from './service-tokens/create-service-state.ts';
import { createSignInState } from './sign-in/create-sign-in-state.ts';
import type { RouteContext } from './sign-in/route-context.ts';
import { CODE_SECONDS } from './store/create-auth-server.ts';
import { openStore } from './store/open-store.ts';
import type { Access, MCPAuth, MCPAuthOptions } from './types.ts';

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

  const prefix = options.serviceTokens?.prefix ?? null;

  if (
    prefix !== null &&
    (prefix.startsWith(ISSUED_TOKEN_PREFIX) || ISSUED_TOKEN_PREFIX.startsWith(prefix))
  ) {
    throw new MCPAuthError(
      'invalid-setup',
      `the service token prefix and ${ISSUED_TOKEN_PREFIX} must not start with one another`,
    );
  }

  const store = await openStore(options, { origin: options.origin, paths: options.paths });

  // A resource served under an earlier origin stays a valid token target until
  // its row goes.
  await store.db.deleteFrom('oauthResource').where('identifier', '!=', resource).execute();

  const services = createServiceState(options.serviceTokens?.file ?? null, options.clock);
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
    services: services.state,
    signIns,
    enrollments: createEnrollmentState(options.clock.now),
    consentFields: options.grantLimits ?? null,
  } satisfies RouteContext);

  const scopes = options.scopes;
  const grantLimits = options.grantLimits ?? null;

  return {
    ...buildAdmin(store, signIns),
    resource,
    issuer: options.origin,
    paths: options.paths,
    routes,

    verify: (bearer) => {
      const snapshot = services.state.findSnapshot();

      if (snapshot !== null && bearer.startsWith(ISSUED_TOKEN_PREFIX)) {
        return Promise.resolve(verifyIssuedToken(services.state, snapshot, bearer));
      }

      if (snapshot !== null && prefix !== null && bearer.startsWith(prefix)) {
        return Promise.resolve(snapshot.verifier.verify(bearer));
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
      const service = services.state.findSnapshot()?.verifier.findScopes(clientID) ?? null;

      return service === null
        ? readClientScopes(store, scopes, clientID)
        : Promise.resolve(service);
    },

    replaceServiceTokens: (file) => {
      if (services.state.findSnapshot() === null) {
        throw new MCPAuthError('invalid-setup', 'the server was opened with no service tokens');
      }

      if (file.resource !== resource) {
        throw new MCPAuthError(
          'invalid-setup',
          `the service token file names another resource than ${resource}`,
        );
      }

      services.replace(file);
    },
  };
}

// The client's current scopes, cut to the scopes the token was issued with.
function verifyIssuedToken<Scope extends string>(
  state: ServiceState<Scope>,
  snapshot: ServiceSnapshot<Scope>,
  bearer: string,
): Access<Scope, never> | null {
  const entry = state.issued.findToken(bearer);

  if (entry === null) {
    return null;
  }

  const clientID: `service:${string}` = `service:${entry.clientName}`;
  const current = snapshot.verifier.findScopes(clientID);
  const scopes = current?.filter((scope) => entry.scopes.includes(scope)) ?? [];

  if (scopes.length === 0) {
    state.issued.removeToken(bearer);

    return null;
  }

  return { kind: 'service', clientID, clientName: clientID, scopes };
}
