import type { Store } from '../store/open-store.ts';

// A code exchange binds its tokens to the session that approved them. Once the
// tokens exist none needs it, so every session a token holds goes, with the
// expired ones.
export async function removeTokenSessions(store: Store): Promise<void> {
  const held = await store.db
    .selectFrom('oauthAccessToken')
    .select('sessionId')
    .where('sessionId', 'is not', null)
    .union(
      store.db
        .selectFrom('oauthRefreshToken')
        .select('sessionId')
        .where('sessionId', 'is not', null),
    )
    .execute();

  const sessionIDs = held.flatMap((row) => (row.sessionId === null ? [] : [row.sessionId]));

  const now = new Date(store.options.clock.now()).toISOString();

  await store.db
    .deleteFrom('session')
    .where((eb) =>
      eb.or([
        eb('expiresAt', '<', now),
        ...(sessionIDs.length === 0 ? [] : [eb('id', 'in', sessionIDs)]),
      ]),
    )
    .execute();
}
