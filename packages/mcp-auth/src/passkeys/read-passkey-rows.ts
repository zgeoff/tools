import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { StoreSchema } from '../store/store-schema.ts';

const PasskeyRowsSchema = z.array(
  z.object({
    id: z.string(),
    public_key: z.string(),
    counter: z.number(),
    transports: z.string(),
    created_at: z.string(),
    last_used_at: z.string().nullable(),
  }),
);

// The passkeys of the app's table, oldest first, or the one with the given id.
// The executor is the store's Kysely, or a transaction of it.
export async function readPasskeyRows(
  executor: Kysely<StoreSchema>,
  table: string,
  id: string | null,
): Promise<z.infer<typeof PasskeyRowsSchema>> {
  const result =
    id === null
      ? await sql`select * from ${sql.table(table)} order by created_at`.execute(executor)
      : await sql`select * from ${sql.table(table)} where id = ${id}`.execute(executor);

  return PasskeyRowsSchema.parse(result.rows);
}
