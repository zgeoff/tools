import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { MCPAuthError } from '../mcp-auth-error.ts';

const PragmaRowSchema = z.object({ foreign_keys: z.number() });

// A pragma inside a transaction does nothing, so the core reads the setting
// back instead of trusting the statement.
export function checkForeignKeys(sqlite: Database): void {
  sqlite.run('PRAGMA foreign_keys = ON');

  const row = PragmaRowSchema.parse(sqlite.query('PRAGMA foreign_keys').get());

  if (row.foreign_keys === 0) {
    throw new MCPAuthError(
      'invalid-setup',
      'foreign keys are off on the connection, so a revoke would not end the tokens of a grant',
    );
  }
}
