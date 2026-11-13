import { sql } from 'kysely';
import { z } from 'zod';
import type { Store } from '../store/open-store.ts';
import { deriveTokenHash } from '../utils/derive-token-hash.ts';

const TokenRowsSchema = z.array(z.object({ token_hash: z.string() }));

export async function readEnrollmentToken(store: Store, token: string): Promise<string | null> {
  const now = new Date(store.options.clock.now()).toISOString();

  const table = sql.table(store.options.tables.enrollmentToken);

  const result =
    await sql`select token_hash from ${table} where token_hash = ${deriveTokenHash(token)} and expires_at > ${now}`.execute(
      store.db,
    );

  const [row] = TokenRowsSchema.parse(result.rows);

  return row === undefined ? null : row.token_hash;
}
