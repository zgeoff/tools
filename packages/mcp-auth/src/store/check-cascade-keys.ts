import { sql } from 'kysely';
import type { QueryExecutorProvider } from 'kysely';
import { z } from 'zod';
import { MCPAuthError } from '../mcp-auth-error.ts';

const CASCADING_TABLES = ['oauthAccessToken', 'oauthRefreshToken', 'session'] as const;

const KeyRowSchema = z.object({
  table: z.string(),
  from: z.string(),
  to: z.string(),
  on_delete: z.string(),
});

export async function checkCascadeKeys(db: QueryExecutorProvider): Promise<void> {
  for (const table of CASCADING_TABLES) {
    const result = await sql`PRAGMA foreign_key_list(${sql.raw(`"${table}"`)})`.execute(db);

    const keys = result.rows.map((row) => KeyRowSchema.parse(row));

    const isCascading = keys.some(
      (key) =>
        key.table === 'user' &&
        key.from === 'userId' &&
        key.to === 'id' &&
        key.on_delete === 'CASCADE',
    );

    if (!isCascading) {
      throw new MCPAuthError(
        'invalid-setup',
        `${table}.userId must reference user(id) on delete cascade`,
      );
    }
  }
}
