import type { Store } from '../store/open-store.ts';
import type { PasskeyID } from '../types.ts';
import { readPasskeyRows } from './read-passkey-rows.ts';

interface SessionPasskey {
  // The session a passkey sign-in just created.
  readonly sessionID: string;

  // The passkey whose assertion signed the owner in.
  readonly passkeyID: PasskeyID;
}

// A passkey removal that committed after the assertion verified and before the
// session existed deleted no session, so the session carries on only while the
// passkey that signed is still enrolled.
export async function verifySessionPasskey(store: Store, check: SessionPasskey): Promise<boolean> {
  try {
    return await store.db.transaction().execute(async (trx) => {
      const passkeys = await readPasskeyRows(trx, store.options.tables.passkey, check.passkeyID);

      const session = await trx
        .selectFrom('session')
        .select('id')
        .where('id', '=', check.sessionID)
        .executeTakeFirst();

      if (passkeys.length > 0 && session !== undefined) {
        return true;
      }

      await trx.deleteFrom('session').where('id', '=', check.sessionID).execute();

      return false;
    });
  } catch {
    // A transaction that fails, such as one a concurrent write keeps busy,
    // still removes the session.
    await store.db.deleteFrom('session').where('id', '=', check.sessionID).execute();

    return false;
  }
}
