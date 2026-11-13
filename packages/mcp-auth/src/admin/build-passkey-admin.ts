import { toTagged } from '@zgeoff/std';
import { sql } from 'kysely';
import { readPasskeyRows } from '../passkeys/read-passkey-rows.ts';
import type { Store } from '../store/open-store.ts';
import { removeGrantRows } from '../store/remove-grant-rows.ts';
import type { MCPAuthAdmin, PasskeyID } from '../types.ts';
import { createEnrollmentToken } from './create-enrollment-token.ts';
import { readSignInGrants } from './read-sign-in-grants.ts';

export function buildPasskeyAdmin(store: Store): MCPAuthAdmin['passkeys'] {
  const passkeyTable = sql.table(store.options.tables.passkey);
  const enrollmentTable = sql.table(store.options.tables.enrollmentToken);

  return {
    createEnrollmentToken: () => createEnrollmentToken(store),

    list: async () => {
      const rows = await readPasskeyRows(store.db, store.options.tables.passkey, null);

      return rows.map((row) => ({
        id: toTagged<PasskeyID>(row.id),
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
      }));
    },

    // Every session goes, so no sign-in the removed passkey made carries on to
    // a consent.
    remove: async (id) => {
      await store.db.transaction().execute(async (trx) => {
        const removed = await sql`delete from ${passkeyTable} where id = ${id}`.execute(trx);

        const removedCount = removed.numAffectedRows ?? 0n;

        if (removedCount > 0n) {
          await trx.deleteFrom('session').execute();
        }
      });
    },

    reset: async () => {
      await store.db.transaction().execute(async (trx) => {
        await sql`delete from ${passkeyTable}`.execute(trx);
        await sql`delete from ${enrollmentTable}`.execute(trx);
        await trx.deleteFrom('session').execute();
      });

      const signIns = await readSignInGrants(store);

      await removeGrantRows(store, signIns);
    },
  };
}
