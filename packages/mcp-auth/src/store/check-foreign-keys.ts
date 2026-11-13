import { sql } from 'kysely';
import type { QueryExecutorProvider } from 'kysely';
import { z } from 'zod';
import { MCPAuthError } from '../mcp-auth-error.ts';

const PragmaRowSchema = z.object({ foreign_keys: z.number() });

// A pragma inside a transaction does nothing, so the core reads the setting
// back instead of trusting the statement.
export async function checkForeignKeys(db: QueryExecutorProvider): Promise<void> {
  await sql`PRAGMA foreign_keys = ON`.execute(db);

  const result = await sql`PRAGMA foreign_keys`.execute(db);

  const row = PragmaRowSchema.parse(result.rows[0]);

  if (row.foreign_keys === 0) {
    throw new MCPAuthError(
      'invalid-setup',
      'foreign keys are off on the connection, so a revoke would not end the tokens of a grant',
    );
  }
}
