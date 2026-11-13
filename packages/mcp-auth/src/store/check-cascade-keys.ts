import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { MCPAuthError } from '../mcp-auth-error.ts';

const CASCADING_TABLES = ['oauthAccessToken', 'oauthRefreshToken', 'session'] as const;
const KeyRowSchema = z.object({ table: z.string(), from: z.string(), on_delete: z.string() });

export function checkCascadeKeys(sqlite: Database): void {
  for (const table of CASCADING_TABLES) {
    const keys = sqlite
      .query(`PRAGMA foreign_key_list("${table}")`)
      .all()
      .map((row) => KeyRowSchema.parse(row));

    const isCascading = keys.some(
      (key) => key.table === 'user' && key.from === 'userId' && key.on_delete === 'CASCADE',
    );

    if (!isCascading) {
      throw new MCPAuthError(
        'invalid-setup',
        `${table}.userId must reference user(id) on delete cascade`,
      );
    }
  }
}
