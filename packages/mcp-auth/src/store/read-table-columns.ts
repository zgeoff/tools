import { sql } from 'kysely';
import type { QueryExecutorProvider } from 'kysely';
import { z } from 'zod';

const ColumnRowSchema = z.object({ name: z.string() });

// The columns a table holds, or an empty list when it does not exist. The
// table name goes into the statement, so the caller has checked it.
export async function readTableColumns(
  db: QueryExecutorProvider,
  table: string,
): Promise<string[]> {
  const result = await sql`PRAGMA table_info(${sql.raw(`"${table}"`)})`.execute(db);

  return result.rows.map((row) => ColumnRowSchema.parse(row).name);
}
