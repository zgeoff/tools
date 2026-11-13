import { sql } from 'kysely';
import type { Store } from '../store/open-store.ts';
import type { PasskeyID } from '../types.ts';

export interface NewPasskey {
  // The hash of the enrollment token the passkey was enrolled with.
  readonly tokenHash: string;

  // The credential id and its COSE public key, both base64url.
  readonly id: PasskeyID;
  readonly publicKey: string;
  readonly counter: number;
  readonly transports: readonly string[];
}

// Spending the token in the same transaction as the insert lets one token
// enroll one passkey.
export function createPasskey(store: Store, passkey: NewPasskey): Promise<boolean> {
  const now = store.options.clock.now();
  const passkeyTable = store.options.tables.passkey;
  const enrollmentToken = store.options.tables.enrollmentToken;

  return store.db.transaction().execute(async (trx) => {
    const spent =
      await sql`delete from ${sql.table(enrollmentToken)} where token_hash = ${passkey.tokenHash} and expires_at > ${new Date(now).toISOString()}`.execute(
        trx,
      );

    if ((spent.numAffectedRows ?? 0n) === 0n) {
      return false;
    }

    await sql`insert into ${sql.table(passkeyTable)} (id, public_key, counter, transports, created_at, last_used_at) values (${passkey.id}, ${passkey.publicKey}, ${passkey.counter}, ${JSON.stringify(passkey.transports)}, ${new Date(now).toISOString()}, null)`.execute(
      trx,
    );

    return true;
  });
}
