import type { GrantID, OAuthClientID } from '../types.ts';

// Only the columns the core reads and writes itself: better-auth owns the
// tables. Dates are ISO 8601 strings and string lists are JSON arrays.
export interface StoreSchema {
  readonly user: {
    readonly id: GrantID;
    readonly email: string;
    readonly name: string;
    readonly emailVerified: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly clientId: OAuthClientID;
    readonly scopes: string | null;
    readonly approvedBy: string;
    readonly limits: string | null;
    readonly lastUsedAt: string | null;
  };
  readonly session: {
    readonly id: string;
    readonly expiresAt: string;
    readonly userId: GrantID;
  };
  readonly verification: { readonly id: string; readonly expiresAt: string };
  readonly oauthClient: {
    readonly id: string;
    readonly clientId: OAuthClientID;
    readonly name: string | null;
    readonly redirectUris: string;
    readonly scopes: string;
    readonly clientCredentialsScopes: string;
    readonly tokenEndpointAuthMethod: string;
    readonly grantTypes: string;
    readonly responseTypes: string;
    readonly applicationType: string;
    readonly requirePKCE: number;
    readonly disabled: number;
    readonly createdAt: string | null;
    readonly updatedAt: string | null;
  };
  readonly oauthAccessToken: {
    readonly id: string;
    readonly token: string;
    readonly clientId: OAuthClientID;
    readonly sessionId: string | null;
    readonly userId: GrantID | null;
    readonly expiresAt: string;
  };
  readonly oauthRefreshToken: {
    readonly id: string;
    readonly token: string;
    readonly clientId: OAuthClientID;
    readonly sessionId: string | null;
    readonly userId: GrantID;
    readonly expiresAt: string;
    readonly createdAt: string;
    readonly revoked: string | null;
    readonly rotatedAt: string | null;
  };
  readonly oauthResource: { readonly identifier: string };
}
