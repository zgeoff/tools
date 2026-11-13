import { isAPIError } from 'better-auth/api';
import { readStoredClientName } from '../sign-in/read-stored-client-name.ts';
import type { Store } from '../store/open-store.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import type { Access, GrantLimits } from '../types.ts';
import { parseApprovedBy } from '../utils/parse-approved-by.ts';
import { parseJSONStrings } from '../utils/parse-json-strings.ts';
import { collectGrantedScopes } from './collect-granted-scopes.ts';
import { readAccessPayload } from './read-access-payload.ts';

// verify stamps the grant's last use at most this often.
const TOUCH_MS = 60_000;

interface OAuthVerification<Scope extends string, Limits> {
  readonly store: Store;
  readonly resource: string;
  readonly scopes: readonly Scope[];
  readonly grantLimits: GrantLimits<Limits> | null;
}

type OAuthAccess<Scope extends string, Limits> = Extract<Access<Scope, Limits>, { kind: 'oauth' }>;

// An unknown, expired or revoked token, one bound to another resource or to a
// key, and one whose grant the app's limits end, all read as null.
export async function verifyOAuthAccess<Scope extends string, Limits>(
  deps: OAuthVerification<Scope, Limits>,
  bearer: string,
): Promise<OAuthAccess<Scope, Limits> | null> {
  let payload: unknown;

  try {
    payload = await deps.store.auth.api.verifyAccessToken({ body: { token: bearer } });
  } catch (error) {
    if (isAPIError(error)) {
      return null;
    }

    throw error;
  }

  const access = readAccessPayload(payload);

  if (access === null || !access.audiences.includes(deps.resource)) {
    return null;
  }

  const grant = await deps.store.db
    .selectFrom('user')
    .selectAll()
    .where('id', '=', access.grantID)
    .executeTakeFirst();

  const approvedBy = grant === undefined ? null : parseApprovedBy(grant.approvedBy);

  if (grant === undefined || approvedBy === null) {
    return null;
  }

  const held = parseJSONStrings(grant.scopes ?? '[]') ?? [];
  const createdAt = Date.parse(grant.createdAt);
  const lastUsedAt = grant.lastUsedAt === null ? null : Date.parse(grant.lastUsedAt);
  let limits: Limits | null = null;
  let allowed: readonly string[] | null = null;

  if (deps.grantLimits !== null) {
    const stored: unknown = grant.limits === null ? null : JSON.parse(grant.limits);

    limits = deps.grantLimits.parseStored(stored);

    if (limits === null) {
      await removeGrantRows(deps.store, [grant.id]);

      return null;
    }

    const check = await deps.grantLimits.check({
      grantID: grant.id,
      clientID: grant.clientId,
      scopes: held,
      approvedBy,
      limits,
      createdAt,
      lastUsedAt,
    });

    if (check.kind === 'revoke') {
      await removeGrantRows(deps.store, [grant.id]);

      return null;
    }

    allowed = check.scopes;
  }

  const now = deps.store.options.clock.now();

  if (lastUsedAt === null || now - lastUsedAt >= TOUCH_MS) {
    await deps.store.db
      .updateTable('user')
      .set({ lastUsedAt: new Date(now).toISOString() })
      .where('id', '=', grant.id)
      .execute();
  }

  return {
    kind: 'oauth',
    grantID: grant.id,
    clientID: access.clientID,
    clientName: await readStoredClientName(deps.store, access.clientID),
    scopes: collectGrantedScopes(deps.scopes, { grant: held, token: access.scopes, allowed }),
    limits,
  };
}
