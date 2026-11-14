import type { Database } from 'bun:sqlite';
import type { Kysely } from 'kysely';
import type { Tagged } from 'type-fest';

export type GrantID = Tagged<string, 'GrantID'>;

export type OAuthClientID = Tagged<string, 'OAuthClientID'>;

export type PasskeyID = Tagged<string, 'PasskeyID'>;

// The same for every event of one sign-in.
export type CorrelationID = Tagged<string, 'CorrelationID'>;

// After `token:` comes an imp token ID.
export type ApprovedBy = 'passkey' | `token:${string}`;

export interface MCPAuthPaths {
  readonly browser: {
    readonly authorize: string;
    readonly login: string;
    readonly enroll: string;
    readonly consent: string;
    readonly error: string;
  };
  readonly machine: {
    readonly mcp: string;
    readonly root: string;
    readonly token: string;
    readonly revoke: string;
    readonly authorizationServerMetadata: string;
    readonly resourceMetadata: string;
    readonly mcpResourceMetadata: string;
  };
}

export interface MCPAuthTables {
  // Owned by the app: the core reads and writes only the columns it needs.
  readonly passkey: string;

  // Owned by the core: token_hash, created_at, expires_at.
  readonly enrollmentToken: string;
}

// The clock for the times the core stamps itself: sign-ins in progress,
// enrollments, lastUsedAt and removeExpired. better-auth stamps token, code
// and session expiries from Date.now().
export interface Clock {
  readonly now: () => number;
}

export interface Requester {
  readonly socketAddress: string | null;
  readonly connectingIP: {
    readonly address: string;
    readonly provenance: 'trusted' | 'unverified';
  } | null;
  readonly userAgent: string | null;
}

export interface SecurityEvent {
  readonly kind:
    | 'authorize_started'
    | 'authorize_invalid'
    | 'owner_auth'
    | 'consent'
    | 'token_exchange'
    | 'bearer'
    | 'bad_host'
    | 'bad_origin';
  readonly outcome: 'accepted' | 'rejected' | 'succeeded' | 'failed' | 'allowed' | 'denied';
  readonly reason?: string;
  readonly path: string;
  readonly requester: Requester;
  readonly client?: { readonly id: OAuthClientID; readonly name: string };
  readonly correlationID?: CorrelationID;
}

export interface SecuritySink {
  readonly record: (event: SecurityEvent) => void;
}

export interface MCPAuthAdminOptions<Scope extends string> {
  // The app's own Kysely when one runs on this connection, so the core shares
  // its driver lock. A Database only when no other Kysely uses it.
  // oxlint-disable-next-line typescript/no-explicit-any -- an app's Kysely is typed with its own tables, which only any accepts
  readonly database: Database | Kysely<any>;
  readonly scopes: readonly Scope[];
  readonly tables: MCPAuthTables;
  readonly clock: Clock;
  readonly onGrantRevoked: (grantID: GrantID) => void;
}

// A client holds static tokens, secret digests, or both.
export interface ServiceClient<Scope extends string> {
  // The client ID is `service:${name}`.
  readonly name: string;
  readonly scopes: readonly Scope[];
  readonly tokens: readonly string[];

  // sha256 hex digests of the client's secrets. Two entries allow a rotation
  // with no gap.
  readonly secretDigests?: readonly string[];
}

export interface ServiceTokenFile<Scope extends string> {
  readonly resource: string;
  readonly clients: readonly ServiceClient<Scope>[];
}

export type ParsedServiceTokenFile<Scope extends string> =
  | { readonly ok: true; readonly file: ServiceTokenFile<Scope> }
  | { readonly ok: false; readonly reason: string };

export interface MCPAuthOptions<Scope extends string, Limits> extends MCPAuthAdminOptions<Scope> {
  readonly origin: string;
  readonly productName: string;
  readonly paths: MCPAuthPaths;
  readonly serviceTokens?: {
    readonly prefix: string;
    readonly file: ServiceTokenFile<Scope>;
  };
  readonly grantLimits?: GrantLimits<Limits>;
  readonly security: SecuritySink;
}

export interface ClientView {
  readonly clientID: OAuthClientID;
  readonly name: string;
  readonly redirectURIs: readonly string[];
  readonly createdAt: string;
}

export interface GrantView {
  readonly grantID: GrantID;
  readonly clientID: OAuthClientID;
  readonly clientName: string;
  readonly scopes: readonly string[];
  readonly approvedBy: ApprovedBy;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

export interface PasskeyView {
  readonly id: PasskeyID;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

export interface MCPAuthAdmin {
  readonly clients: {
    readonly list: () => Promise<ClientView[]>;
    readonly add: (name: string, redirectURIs: readonly string[]) => Promise<ClientView>;

    // The clients whose stored name cleans to the same text as `name`: more
    // than one when an old database holds two names that clean alike.
    readonly readByName: (name: string) => Promise<ClientView[]>;
    readonly update: (
      clientID: OAuthClientID,
      redirectURIs: readonly string[],
    ) => Promise<ClientView>;

    // The number of grants it revoked.
    readonly remove: (clientID: OAuthClientID) => Promise<number>;
  };
  readonly grants: {
    // Grants with a live refresh token.
    readonly list: () => Promise<GrantView[]>;

    // False when no grant row has the ID.
    readonly revoke: (grantID: GrantID) => Promise<boolean>;
  };
  readonly passkeys: {
    // Shown once; the core stores its hash.
    readonly createEnrollmentToken: () => Promise<string>;
    readonly list: () => Promise<PasskeyView[]>;
    readonly remove: (id: PasskeyID) => Promise<void>;

    // Removes every passkey, and the grant row of each sign-in in progress.
    readonly reset: () => Promise<void>;
  };
  readonly removeExpired: () => Promise<void>;

  // Leaves the connection open, and the app's Kysely too.
  readonly close: () => Promise<void>;
}

export type MCPAuthRouteName =
  | 'authorize'
  | 'login'
  | 'enroll'
  | 'consent'
  | 'error'
  | 'token'
  | 'revoke'
  | 'authorizationServerMetadata'
  | 'resourceMetadata';

export type MCPAuthRoutes = Record<
  MCPAuthRouteName,
  (request: Request, requester: Requester) => Promise<Response>
>;

export type Access<Scope extends string, Limits> =
  | {
      readonly kind: 'oauth';
      readonly grantID: GrantID;
      readonly clientID: OAuthClientID;
      readonly clientName: string;
      readonly scopes: readonly Scope[];
      readonly limits: Limits | null;
    }
  | {
      readonly kind: 'service';
      readonly clientID: `service:${string}`;
      readonly clientName: `service:${string}`;
      readonly scopes: readonly Scope[];
    };

export interface MCPAuth<Scope extends string, Limits = null> extends MCPAuthAdmin {
  // `${origin}${paths.machine.mcp}`
  readonly resource: string;
  readonly issuer: string;
  readonly paths: MCPAuthPaths;
  readonly routes: MCPAuthRoutes;

  // Null for an unknown, expired or revoked token, and for a DPoP-bound one.
  // Throws when the app's GrantLimits.check throws.
  readonly verify: (bearer: string) => Promise<Access<Scope, Limits> | null>;

  // The scopes a client holds now, or null when it holds none.
  readonly findClientScopes: (clientID: string) => Promise<readonly Scope[] | null>;

  // Swaps the service clients that the token route and `verify` read. Throws,
  // and keeps the old ones, when `serviceTokens` was not passed or the file
  // names another resource.
  // oxlint-disable-next-line typescript/method-signature-style -- a method is bivariant, so an MCPAuth of known scopes still passes where any scope goes
  replaceServiceTokens(file: ServiceTokenFile<Scope>): void;
}

export interface ConsentRequest {
  readonly clientID: OAuthClientID;
  readonly clientName: string;
  readonly scopes: readonly string[];
}

export interface StoredGrant<Limits> {
  readonly grantID: GrantID;
  readonly clientID: OAuthClientID;
  readonly scopes: readonly string[];
  readonly approvedBy: ApprovedBy;
  readonly limits: Limits | null;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
}

export type GrantCheck =
  | { readonly kind: 'allow'; readonly scopes: readonly string[] }
  | { readonly kind: 'revoke'; readonly reason: string };

export interface GrantLimits<Limits> {
  // HTML, escaped by the app.
  readonly renderConsentFields: (request: ConsentRequest) => string;
  readonly parseConsentFields: (
    form: URLSearchParams,
  ) => { ok: true; limits: Limits } | { ok: false; error: string };

  // Null revokes the grant.
  readonly parseStored: (json: unknown) => Limits | null;
  readonly check: (grant: StoredGrant<Limits>) => Promise<GrantCheck>;
}
