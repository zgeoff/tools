import type { GrantID } from '../types.ts';
import type { Store } from './open-store.ts';

// One delete ends a grant: every token and session of it references the row
// with on delete cascade. The hook runs after the delete commits.
export async function removeGrantRows(
  store: Store,
  grantIDs: readonly GrantID[],
): Promise<GrantID[]> {
  if (grantIDs.length === 0) {
    return [];
  }

  const removed = await store.db
    .deleteFrom('user')
    .where('id', 'in', grantIDs)
    .returning('id')
    .execute();

  const removedIDs = removed.map((row) => row.id);

  for (const grantID of removedIDs) {
    store.options.onGrantRevoked(grantID);
  }

  return removedIDs;
}
