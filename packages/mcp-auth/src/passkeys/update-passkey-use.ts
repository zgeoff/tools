import { sql } from 'kysely';
import type { Store } from '../store/open-store.ts';
import type { PasskeyID } from '../types.ts';

interface PasskeyUse {
  readonly id: PasskeyID;

  // The counter the verification read, which the passkey must still hold, so
  // a passkey removed during the verification, or a concurrent assertion that
  // stored a newer counter, makes this use fail.
  readonly counter: number;
  readonly newCounter: number;
}

export async function updatePasskeyUse(store: Store, use: PasskeyUse): Promise<boolean> {
  const now = new Date(store.options.clock.now()).toISOString();

  const stored =
    await sql`update ${sql.table(store.options.tables.passkey)} set counter = ${use.newCounter}, last_used_at = ${now} where id = ${use.id} and counter = ${use.counter}`.execute(
      store.db,
    );

  return (stored.numAffectedRows ?? 0n) > 0n;
}
